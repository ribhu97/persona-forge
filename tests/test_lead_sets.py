"""
Unit tests for the Lead Persona Set module (src/lead_sets.py).

In-memory SQLite, no AI providers. Covers the four verbs through the
module interface: create, public view states, claim (token / email
fallback / CAS race), and the capture/failure hooks.
"""
import json

import pytest

from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from src import jobs, lead_sets, quota, think_hard
from src.lead_sets import (
    LeadSetValidationError,
    capture_job_result,
    create_for_marketing,
    get_public_view,
    mark_job_failed,
    maybe_claim,
)
from src.models import Conversation, LeadPersonaSet, Message, User


PERSONAS = [{
    "name": "Riya, the COO", "status": "primary", "role": "Operations lead",
    "tech_comfort": "high", "scenario_context": "Evaluating tools",
    "demographics": {"age": "38", "location": "Pune", "education": "MBA", "industry": "SaaS"},
    "goals": ["Cut research time"], "frustrations": ["Slow tools"],
    "behavioral_patterns": ["Shops in bursts"], "influence_networks": ["Peer COOs"],
    "recruitment_criteria": ["B2B SaaS"], "research_assumptions": ["Wants speed"],
}]


@pytest.fixture(name="test_engine")
def test_engine_fixture():
    """Fresh in-memory engine; swap every module-level engine."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    saved = {m: m.engine for m in (jobs, quota, think_hard, lead_sets)}
    for m in (jobs, quota, think_hard, lead_sets):
        m.engine = engine
    yield engine
    for m, orig in saved.items():
        m.engine = orig
    SQLModel.metadata.drop_all(engine)


def _make_ready_set(session, email="lead@acme.co", personas=None):
    """Create + freeze a ready set directly (no job machinery)."""
    lead_set = LeadPersonaSet(
        token=lead_sets.secrets.token_urlsafe(24),
        lead_email=email,
        product_description="A scheduling tool for dental clinics",
        raw_personas=json.dumps(personas if personas is not None else PERSONAS),
        state="ready",
    )
    session.add(lead_set)
    session.commit()
    session.refresh(lead_set)
    return lead_set


def _make_user(session, email="founder@acme.co"):
    user = User(email=email, is_verified=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


class TestCreateForMarketing:
    def test_create_enqueues_think_hard_job(self, test_engine):
        with Session(test_engine) as session:
            lead_set = create_for_marketing(
                session,
                product_description="A scheduling tool for dental clinics",
                lead_email="Lead@Acme.co",
                channel="email",
            )
        assert lead_set.state == "generating"
        assert lead_set.lead_email == "lead@acme.co"  # case-normalized
        assert lead_set.job_id is not None
        job = jobs.get_job(lead_set.job_id)
        assert job.mode == "think_hard"
        assert job.state == "queued"

    def test_create_validates_input(self, test_engine):
        with Session(test_engine) as session:
            with pytest.raises(LeadSetValidationError):
                create_for_marketing(session, product_description="   ")
            with pytest.raises(LeadSetValidationError):
                create_for_marketing(session, product_description="x" * 20_001)


class TestCaptureHook:
    def test_capture_freezes_and_readies(self, test_engine):
        with Session(test_engine) as session:
            gen = LeadPersonaSet(
                token=lead_sets.secrets.token_urlsafe(24),
                product_description="desc", state="generating",
            )
            session.add(gen)
            session.commit()
            session.refresh(gen)
            capture_job_result(session, "job-does-not-match", PERSONAS)
            session.commit()
            session.refresh(gen)
            assert gen.state == "generating"  # no-op for unknown job

            gen.job_id = "job-42"
            session.add(gen)
            session.commit()
            capture_job_result(session, "job-42", PERSONAS)
            session.commit()
            session.refresh(gen)
            assert gen.state == "ready"
            assert json.loads(gen.raw_personas) == PERSONAS
            assert gen.ready_at is not None

    def test_mark_failed_flips_generating_only(self, test_engine):
        with Session(test_engine) as session:
            gen = LeadPersonaSet(
                token=lead_sets.secrets.token_urlsafe(24),
                product_description="desc", state="generating",
                job_id="job-7",
            )
            session.add(gen)
            session.commit()
            mark_job_failed(session, "job-7")
            session.commit()
            session.refresh(gen)
            assert gen.state == "failed"

            ready = _make_ready_set(session)
            mark_job_failed(session, ready.job_id or "none")
            session.commit()
            session.refresh(ready)
            assert ready.state == "ready"  # never touches non-generating


class TestPublicView:
    def test_ready_shows_full_personas(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
        view = get_public_view(lead_set.token)
        assert view.state == "ready"
        assert view.personas == PERSONAS
        assert view.product_description is not None
        assert view.sign_in_cta is False

    def test_claimed_is_fully_blurred(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            lead_set.state = "claimed"
            session.add(lead_set)
            session.commit()
            token = lead_set.token
        view = get_public_view(token)
        assert view.state == "claimed"
        assert view.personas is None
        assert view.product_description is None
        assert view.persona_count == len(PERSONAS)
        assert view.sign_in_cta is True


    def test_generating_and_failed_show_state_only(self, test_engine):
        for state in ("generating", "failed"):
            with Session(test_engine) as session:
                lead_set = LeadPersonaSet(
                    token=lead_sets.secrets.token_urlsafe(24),
                    product_description="d", state=state,
                )
                session.add(lead_set)
                session.commit()
                view = get_public_view(lead_set.token)
                assert view.state == state
                assert view.personas is None

    def test_unknown_token_raises(self, test_engine):
        with pytest.raises(LookupError):
            get_public_view("no-such-token")


class TestClaim:
    def test_claim_by_token_seeds_conversation(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            user = _make_user(session)
            outcome = maybe_claim(session, user, token=lead_set.token)
            session.commit()
            assert outcome is not None
            conv = session.get(Conversation, outcome.conversation_id)
            assert conv.user_id == user.id
            msgs = session.exec(
                select(Message).where(Message.conversation_id == conv.id)
            ).all()
            assert msgs[0].role == "user"
            assert msgs[0].content == lead_set.product_description
            assert msgs[1].role == "assistant"
            assert "Generated 1 personas" in msgs[1].content
            session.refresh(lead_set)
            assert lead_set.state == "claimed"
            assert lead_set.claimed_by_user_id == user.id


    def test_claim_by_email_fallback(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session, email="founder@acme.co")
            user = _make_user(session, email="founder@acme.co")
            outcome = maybe_claim(session, user)  # no token
            session.commit()
            assert outcome is not None
            session.refresh(lead_set)
            assert lead_set.state == "claimed"

    def test_claim_idempotent_relogin(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            user = _make_user(session)
            first = maybe_claim(session, user, token=lead_set.token)
            session.commit()
            second = maybe_claim(session, user, token=lead_set.token)
            session.commit()
        assert first is not None
        assert second is not None
        assert second.conversation_id == first.conversation_id

    def test_second_claimant_gets_none_via_email(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            u1 = _make_user(session, email="u1@x.co")
            u2 = _make_user(session, email="u2@x.co")
            assert maybe_claim(session, u1, token=lead_set.token) is not None
            session.commit()
            assert maybe_claim(session, u2, token=lead_set.token) is None
            session.commit()

    def test_claim_with_no_pending_returns_none(self, test_engine):
        with Session(test_engine) as session:
            user = _make_user(session)
            assert maybe_claim(session, user) is None



