"""
Integration tests for the Lead Persona Set HTTP surface.

Covers: service-token gate (wrong token, non-ASCII token, unset), marketing
POST -> 201 + link, public GET per state (incl. no-store), claim via explicit
endpoint (auth'd, per state), and the auth-handler claim path for all three
login routes (login / verify-otp / google) plus its failure isolation.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src import lead_sets
from src.auth import create_access_token, get_password_hash
from src.main import app
from src.database import get_session
from src.models import Conversation, LeadPersonaSet, OneTimePassword, User

from tests.conftest import engine as conftest_engine


SERVICE_TOKEN = "test-service-token"

@pytest.fixture(name="client")
def client_fixture(session, monkeypatch):
    from sqlmodel import SQLModel
    from src import jobs, lead_sets, quota, think_hard

    monkeypatch.setenv("LEAD_SERVICE_TOKEN", SERVICE_TOKEN)
    # create_job / quota / public view use module-level engines; point them
    # at the conftest's in-memory engine for the duration of the test
    # (same swap convention as tests/test_think_hard.py).
    saved = {m: m.engine for m in (jobs, quota, think_hard, lead_sets)}
    for m in (jobs, quota, think_hard, lead_sets):
        m.engine = conftest_engine
        SQLModel.metadata.create_all(m.engine)
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    for m, orig in saved.items():
        m.engine = orig



def _make_ready_set(session, email="founder@acme.co"):
    lead_set = LeadPersonaSet(
        token=lead_sets.secrets.token_urlsafe(24),
        lead_email=email,
        product_description="A scheduling tool for dental clinics",
        raw_personas=json.dumps([{
            "name": "Riya", "status": "primary", "role": "COO",
            "tech_comfort": "high", "scenario_context": "evaluating",
            "demographics": {"age": "38", "location": "Pune"},
            "goals": ["cut research time"], "frustrations": ["slow tools"],
            "behavioral_patterns": ["shops in bursts"],
            "influence_networks": ["peers"], "recruitment_criteria": ["b2b"],
            "research_assumptions": ["wants speed"],
        }]),
        state="ready",
    )
    session.add(lead_set)
    session.commit()
    session.refresh(lead_set)
    return lead_set


class TestServiceTokenGate:
    def test_missing_token_401(self, client):
        r = client.post("/api/lead-sets", json={"product_description": "d"})
        assert r.status_code == 401

    def test_wrong_token_401(self, client):
        r = client.post("/api/lead-sets", json={"product_description": "d"},
                        headers={"X-Service-Token": "wrong"})
        assert r.status_code == 401

    def test_unset_env_fails_closed(self, session, monkeypatch):
        from src.main import app
        from src.database import get_session
        monkeypatch.delenv("LEAD_SERVICE_TOKEN", raising=False)
        app.dependency_overrides[get_session] = lambda: session
        with TestClient(app) as client:
            r = client.post("/api/lead-sets", json={"product_description": "d"},
                            headers={"X-Service-Token": "anything"})
            assert r.status_code == 503
        app.dependency_overrides.clear()

    def test_valid_token_creates(self, client):
        r = client.post(
            "/api/lead-sets",
            json={"product_description": "A budgeting app for freelancers",
                  "lead_email": "Lead@Example.com", "channel": "email"},
            headers={"X-Service-Token": SERVICE_TOKEN},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["public_url"] == f"/p/{body['token']}"


class TestPublicGet:
    def test_ready_full_view(self, client, session):
        lead_set = _make_ready_set(session)
        r = client.get(f"/api/lead-sets/{lead_set.token}")
        assert r.status_code == 200
        body = r.json()
        assert body["state"] == "ready"
        assert body["personas"][0]["name"] == "Riya"
        assert body["sign_in_cta"] is False

    def test_claimed_blurred_view(self, client, session):
        lead_set = _make_ready_set(session)
        lead_set.state = "claimed"
        session.add(lead_set)
        session.commit()
        r = client.get(f"/api/lead-sets/{lead_set.token}")
        body = r.json()
        assert body["state"] == "claimed"
        assert body["personas"] is None
        assert body["product_description"] is None
        assert body["persona_count"] == 1
        assert body["sign_in_cta"] is True

    def test_unknown_token_404(self, client):
        assert client.get("/api/lead-sets/nope").status_code == 404


class TestExplicitClaim:
    def test_claim_endpoint_unauthenticated_401(self, client, session):
        lead_set = _make_ready_set(session)
        r = client.post(f"/api/lead-sets/{lead_set.token}/claim")
        assert r.status_code == 401

    def test_claim_endpoint_creates_conversation(self, client, session):
        from src.auth import create_access_token

        lead_set = _make_ready_set(session)
        user = User(email="founder@acme.co", is_verified=True)
        session.add(user)
        session.commit()
        token = create_access_token(data={"sub": user.email})

        r = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                        headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["claimed"] is True
        conv_id = r.json()["conversation_id"]

        session.expire_all()
        fresh = session.exec(select(LeadPersonaSet).where(
            LeadPersonaSet.id == lead_set.id)).first()
        assert fresh.state == "claimed"
        assert fresh.claimed_conversation_id == conv_id

    def test_claim_idempotent_and_409_for_other(self, client, session):
        from src.auth import create_access_token

        lead_set = _make_ready_set(session)
        u1 = User(email="a@x.co", is_verified=True)
        u2 = User(email="b@x.co", is_verified=True)
        session.add_all([u1, u2])
        session.commit()
        t1 = create_access_token(data={"sub": u1.email})
        t2 = create_access_token(data={"sub": u2.email})

        r1 = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                         headers={"Authorization": f"Bearer {t1}"})
        assert r1.status_code == 200
        # re-claim by owner: same conversation
        r1b = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                          headers={"Authorization": f"Bearer {t1}"})
        assert r1b.json()["conversation_id"] == r1.json()["conversation_id"]
        # another user: 409
        r2 = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                         headers={"Authorization": f"Bearer {t2}"})
        assert r2.status_code == 409


class TestServiceTokenHardening:
    def test_non_ascii_service_token_is_401_not_500(self, monkeypatch):
        """
        compare_digest raises TypeError on non-ASCII str; the gate must encode
        first. Called directly because httpx refuses non-ASCII header values.
        """
        from fastapi import HTTPException
        from src.routers.lead_sets import require_service_token

        monkeypatch.setenv("LEAD_SERVICE_TOKEN", SERVICE_TOKEN)
        with pytest.raises(HTTPException) as exc:
            require_service_token(x_service_token="ünïcode-token")
        assert exc.value.status_code == 401


class TestClaimErrorContract:
    """Distinct codes so the client can render the right state."""

    def _auth_headers(self, session, email="founder@acme.co"):
        user = User(email=email, is_verified=True)
        session.add(user)
        session.commit()
        return {"Authorization": f"Bearer {create_access_token(data={'sub': email})}"}

    def test_claim_on_generating_returns_425(self, client, session):
        lead_set = LeadPersonaSet(
            token=lead_sets.secrets.token_urlsafe(8),
            product_description="d", state="generating",
        )
        session.add(lead_set)
        session.commit()

        r = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                        headers=self._auth_headers(session))
        assert r.status_code == 425
        assert r.json()["detail"] == {"state": "generating"}

    def test_claim_on_failed_returns_410(self, client, session):
        lead_set = LeadPersonaSet(
            token=lead_sets.secrets.token_urlsafe(8),
            product_description="d", state="failed",
        )
        session.add(lead_set)
        session.commit()

        r = client.post(f"/api/lead-sets/{lead_set.token}/claim",
                        headers=self._auth_headers(session))
        assert r.status_code == 410
        assert r.json()["detail"] == {"state": "failed"}

    def test_claim_on_unknown_token_returns_404(self, client, session):
        r = client.post("/api/lead-sets/no-such-token/claim",
                        headers=self._auth_headers(session))
        assert r.status_code == 404

    def test_public_view_is_not_cached(self, client, session):
        lead_set = _make_ready_set(session)
        r = client.get(f"/api/lead-sets/{lead_set.token}")
        assert r.status_code == 200
        assert r.headers["cache-control"] == "no-store"


class TestAuthHandlerClaim:
    """The claim fires from every auth route, and never breaks it."""

    def _verified_user(self, session, email, password="hunter2"):
        user = User(
            email=email, hashed_password=get_password_hash(password), is_verified=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    def test_login_with_lead_token_claims(self, client, session):
        lead_set = _make_ready_set(session, email="founder@acme.co")
        self._verified_user(session, "founder@acme.co")

        r = client.post("/api/auth/login", json={
            "email": "founder@acme.co", "password": "hunter2",
            "lead_token": lead_set.token,
        })

        assert r.status_code == 200
        conv_id = r.json()["claimed_conversation_id"]
        assert conv_id is not None
        session.expire_all()
        fresh = session.get(LeadPersonaSet, lead_set.id)
        assert fresh.state == "claimed"
        assert fresh.claimed_conversation_id == conv_id

    def test_login_without_lead_token_uses_email_fallback(self, client, session):
        lead_set = _make_ready_set(session, email="founder@acme.co")
        self._verified_user(session, "founder@acme.co")

        r = client.post("/api/auth/login", json={
            "email": "founder@acme.co", "password": "hunter2",
        })

        assert r.status_code == 200
        assert r.json()["claimed_conversation_id"] is not None
        session.expire_all()
        assert session.get(LeadPersonaSet, lead_set.id).state == "claimed"

    def test_verify_otp_with_lead_token_claims(self, client, session):
        lead_set = _make_ready_set(session, email="newbie@acme.co")
        user = User(email="newbie@acme.co", hashed_password=get_password_hash("pw"))
        session.add(user)
        session.commit()
        session.refresh(user)
        session.add(OneTimePassword(
            user_id=user.id, code="123456",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        ))
        session.commit()

        r = client.post("/api/auth/verify-otp", json={
            "email": "newbie@acme.co", "otp": "123456", "lead_token": lead_set.token,
        })

        assert r.status_code == 200
        assert r.json()["claimed_conversation_id"] is not None
        session.expire_all()
        assert session.get(LeadPersonaSet, lead_set.id).state == "claimed"

    def test_google_login_with_lead_token_claims(self, client, session, monkeypatch):
        monkeypatch.setattr(
            "src.routers.auth.verify_google_token",
            lambda token: {"email": "guser@acme.co", "name": "G User"},
        )
        lead_set = _make_ready_set(session, email="guser@acme.co")

        r = client.post("/api/auth/google", json={
            "token": "fake-google-token", "lead_token": lead_set.token,
        })

        assert r.status_code == 200
        assert r.json()["claimed_conversation_id"] is not None
        session.expire_all()
        assert session.get(LeadPersonaSet, lead_set.id).state == "claimed"

    def test_claim_failure_does_not_break_login(self, client, session, monkeypatch):
        """
        verify-otp consumes the OTP before claiming: an escaping claim error
        would 500 a request whose OTP is already spent, locking the user out.
        """
        self._verified_user(session, "founder@acme.co")

        def boom(*args, **kwargs):
            raise RuntimeError("claim exploded")

        monkeypatch.setattr(lead_sets, "maybe_claim", boom)

        r = client.post("/api/auth/login", json={
            "email": "founder@acme.co", "password": "hunter2",
        })

        assert r.status_code == 200
        assert r.json()["access_token"]
        assert r.json()["claimed_conversation_id"] is None

    def test_login_claims_only_the_newest_set(self, client, session):
        now = datetime.now(timezone.utc)
        older = _make_ready_set(session, email="founder@acme.co")
        older.created_at = now - timedelta(minutes=5)
        session.add(older)
        session.commit()
        newer = _make_ready_set(session, email="founder@acme.co")
        newer.created_at = now - timedelta(minutes=1)
        session.add(newer)
        session.commit()
        self._verified_user(session, "founder@acme.co")

        r = client.post("/api/auth/login", json={
            "email": "founder@acme.co", "password": "hunter2",
        })

        assert r.status_code == 200
        session.expire_all()
        assert session.get(LeadPersonaSet, newer.id).state == "claimed"
        assert session.get(LeadPersonaSet, older.id).state == "ready"
        assert len(session.exec(select(Conversation)).all()) == 1
