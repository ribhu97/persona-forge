"""
Unit tests for the Lead Persona Set module (src/lead_sets.py).

In-memory SQLite, no AI providers. Covers the four verbs through the
module interface: create (atomic job link, failure cleanup), public view
states, claim (token / email fallback / newest-only scope / CAS race /
tier exemption), the capture and failure hooks, and the stuck-set
reconciler.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from src import jobs, lead_sets, quota, think_hard
from src.lead_sets import (
    RECONCILE_GRACE_SECONDS,
    LeadSetValidationError,
    capture_job_result,
    create_for_marketing,
    get_public_view,
    mark_job_failed,
    maybe_claim,
    reconcile_stuck_sets,
)
from src.models import Conversation, GenerationJob, LeadPersonaSet, Message, Persona, User


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
                create_for_marketing(session, product_description="test")
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


class TestClaimScope:
    """One claim per call: the newest matching set, and only that one."""

    def test_email_fallback_claims_only_newest(self, test_engine):
        now = datetime.now(timezone.utc)
        with Session(test_engine) as session:
            older = _make_ready_set(session, email="founder@acme.co")
            older.created_at = now - timedelta(minutes=5)
            session.add(older)
            session.commit()
            newer = _make_ready_set(session, email="founder@acme.co")
            newer.created_at = now - timedelta(minutes=1)
            session.add(newer)
            session.commit()

            user = _make_user(session, email="founder@acme.co")
            outcome = maybe_claim(session, user)
            session.commit()
            session.refresh(older)
            session.refresh(newer)

            assert outcome is not None
            assert newer.state == "claimed"
            assert older.state == "ready"
            convs = session.exec(
                select(Conversation).where(Conversation.user_id == user.id)
            ).all()
            assert len(convs) == 1

    def test_token_match_beats_email_fallback(self, test_engine):
        now = datetime.now(timezone.utc)
        with Session(test_engine) as session:
            by_token = _make_ready_set(session, email="founder@acme.co")
            by_token.created_at = now - timedelta(minutes=10)  # older than the email match
            session.add(by_token)
            session.commit()
            newer = _make_ready_set(session, email="founder@acme.co")
            newer.created_at = now - timedelta(minutes=1)
            session.add(newer)
            session.commit()

            user = _make_user(session, email="founder@acme.co")
            outcome = maybe_claim(session, user, token=by_token.token)
            session.commit()
            session.refresh(by_token)
            session.refresh(newer)

            assert outcome is not None
            assert by_token.state == "claimed"
            assert newer.state == "ready"

    def test_lost_cas_race_loses_only_that_claim(self, test_engine):
        """
        A lost CAS must discard only the claim. A plain session.rollback()
        would also throw away whatever the caller had staged — and hand back
        a conversation id that no longer exists.
        """

        class ZeroRows:
            rowcount = 0

        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            user = _make_user(session)

            # Work the caller (an auth handler) staged before claiming.
            pending = User(email="pending-write@x.co", is_verified=True)
            session.add(pending)
            session.flush()

            real_execute = session.execute

            def losing_execute(statement, *args, **kwargs):
                if getattr(statement, "is_update", False):
                    return ZeroRows()
                return real_execute(statement, *args, **kwargs)

            session.execute = losing_execute
            outcome = maybe_claim(session, user, token=lead_set.token)
            session.execute = real_execute
            session.commit()
            session.expire_all()

            assert outcome is None
            assert session.get(LeadPersonaSet, lead_set.id).state == "ready"
            assert session.exec(select(Conversation)).all() == []
            assert session.exec(select(Persona)).all() == []
            assert session.exec(
                select(User).where(User.email == "pending-write@x.co")
            ).first() is not None

    def test_claim_exempt_from_conversation_limit(self, test_engine):
        """Claims are pre-paid by marketing: a free user at their limit still claims."""
        with Session(test_engine) as session:
            user = _make_user(session)
            assert user.account_type == 0
            for i in range(3):  # free tier allows 3 conversations/month
                session.add(Conversation(user_id=user.id, title=f"existing {i}"))
            session.commit()

            lead_set = _make_ready_set(session)
            outcome = maybe_claim(session, user, token=lead_set.token)
            session.commit()

            assert outcome is not None
            session.refresh(lead_set)
            assert lead_set.state == "claimed"

    def test_claim_with_unusable_personas_returns_none(self, test_engine):
        with Session(test_engine) as session:
            lead_set = _make_ready_set(session)
            lead_set.raw_personas = "{not json"
            session.add(lead_set)
            session.commit()

            user = _make_user(session)
            assert maybe_claim(session, user, token=lead_set.token) is None
            session.refresh(lead_set)
            assert lead_set.state == "ready"


class TestCreateLifecycle:
    def test_create_links_job_id_atomically(self, test_engine, monkeypatch):
        """The job_id link must ride create_job's own transaction, not a later commit."""
        seen = {}

        class FakeJob:
            id = "job-atomic"

        def fake_create_job(user_id, conversation_id, *, on_created=None, **kwargs):
            seen["on_created"] = on_created
            assert on_created is not None, "create_for_marketing must pass on_created"
            # Mimic the real create_job: its own session, its own commit.
            with Session(test_engine) as job_session:
                on_created(job_session, FakeJob())
                job_session.commit()
            return FakeJob()

        monkeypatch.setattr(jobs, "create_job", fake_create_job)

        with Session(test_engine) as session:
            lead_set = create_for_marketing(session, product_description="A budgeting app for freelancers")
            lead_set_id = lead_set.id
            # The caller's stale in-memory copy must not be able to clobber it.
            assert lead_set.job_id == "job-atomic"

        with Session(test_engine) as session:
            assert session.get(LeadPersonaSet, lead_set_id).job_id == "job-atomic"

    def test_create_job_failure_leaves_no_rows(self, test_engine, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("quota exhausted")

        monkeypatch.setattr(jobs, "create_job", boom)

        with Session(test_engine) as session:
            with pytest.raises(RuntimeError):
                create_for_marketing(
                    session, product_description="A budgeting app for freelancers", lead_email="lead@acme.co"
                )
            session.expire_all()
            assert session.exec(select(LeadPersonaSet)).all() == []
            assert session.exec(select(Conversation)).all() == []
            # The ghost user is a singleton, not per-set garbage.
            assert len(session.exec(select(User)).all()) == 1

    def test_create_binds_job_by_idempotency_key(self, test_engine):
        with Session(test_engine) as session:
            lead_set = create_for_marketing(session, product_description="A budgeting app for freelancers")
            assert lead_set.job_id is not None
            job = jobs.get_job(lead_set.job_id)
            assert job.idempotency_key == f"lead-set-{lead_set.id}"


class TestReconcileStuckSets:
    def _generating(self, **kwargs):
        kwargs.setdefault("product_description", "d")
        return LeadPersonaSet(
            token=lead_sets.secrets.token_urlsafe(8), state="generating", **kwargs
        )

    def test_flips_only_provably_stuck_sets(self, test_engine):
        now = datetime.now(timezone.utc)
        with Session(test_engine) as session:
            fresh_null = self._generating()                       # too young, no job
            old_null = self._generating(
                created_at=now - timedelta(seconds=RECONCILE_GRACE_SECONDS * 2)
            )
            dead_job = GenerationJob(
                id="job-dead", user_id=1, conversation_id=1, mode="think_hard",
                state=jobs.STATE_FAILED, input_text="x",
                user_message_id=1, assistant_message_id=1,
                expires_at=now + timedelta(hours=1),
            )
            linked_dead = self._generating(job_id="job-dead")      # job already terminal
            live_job = GenerationJob(
                id="job-live", user_id=1, conversation_id=1, mode="think_hard",
                state=jobs.STATE_RUNNING, input_text="x",
                user_message_id=1, assistant_message_id=1,
                expires_at=now + timedelta(hours=1),
            )
            linked_live = self._generating(
                job_id="job-live",
                created_at=now - timedelta(seconds=RECONCILE_GRACE_SECONDS * 2),
            )
            ready = LeadPersonaSet(
                token=lead_sets.secrets.token_urlsafe(8),
                product_description="d", state="ready",
                created_at=now - timedelta(seconds=RECONCILE_GRACE_SECONDS * 2),
            )
            session.add_all([fresh_null, old_null, dead_job, linked_dead, live_job, linked_live, ready])
            session.commit()

            assert reconcile_stuck_sets(session) == 2
            session.commit()
            for row in (fresh_null, old_null, linked_dead, linked_live, ready):
                session.refresh(row)

            assert fresh_null.state == "generating"
            assert linked_live.state == "generating"
            assert ready.state == "ready"
            assert old_null.state == "failed"
            assert linked_dead.state == "failed"


class TestLeadJobPersistence:
    def test_lead_job_freezes_json_and_persists_no_persona_rows(self, test_engine):
        """The frozen JSON is the single source of truth for a lead job."""
        with Session(test_engine) as session:
            lead_set = create_for_marketing(session, product_description="A budgeting app for freelancers")
            lead_set_id = lead_set.id
            job_id = lead_set.job_id

        jobs.claim_next_queued("worker-1")  # queued -> running
        assert think_hard._final_transaction(jobs.get_job(job_id), PERSONAS) is True

        with Session(test_engine) as session:
            fresh = session.get(LeadPersonaSet, lead_set_id)
            assert fresh.state == "ready"
            assert json.loads(fresh.raw_personas) == PERSONAS
            assert session.exec(select(Persona)).all() == []
            msg = session.get(Message, jobs.get_job(job_id).assistant_message_id)
            assert msg.is_pending is False
            assert msg.content == f"Generated {len(PERSONAS)} personas"



