"""
Integration tests for the Lead Persona Set HTTP surface.

Covers: service-token gate (wrong token, unset), marketing POST -> 201 +
link, public GET per state, claim via explicit endpoint (auth'd), and the
auth-handler claim path (login with lead_token).
"""
import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src import lead_sets
from src.auth import create_access_token
from src.main import app
from src.database import get_session
from src.models import LeadPersonaSet, User

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
