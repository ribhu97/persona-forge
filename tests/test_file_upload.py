"""
Integration tests for the file upload endpoint and file_id flow in send_message.

Covers:
- Unauthenticated upload rejected (401)
- Oversized file rejected (413)
- Disallowed extension rejected (415)
- Successful TXT upload returns file_id
- send_message with valid file_id passes file_context to generator
- send_message with wrong user's file_id rejected (403)
- send_message with expired file_id rejected (410)
- send_message with already-used file_id rejected (409)
- Degraded mode flag flows through to response
"""
import io
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from src.dependencies import get_current_user
from src.models import UploadedFile, User


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_user(session: Session, email: str, account_type: int = 0) -> User:
    user = User(email=email, is_verified=True, account_type=account_type)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_override(user: User):
    return lambda: user


def _txt_file(content: str = "This is a product brief.") -> tuple[str, io.BytesIO, str]:
    return ("file", io.BytesIO(content.encode()), "brief.txt")


def _insert_file_record(
    session: Session,
    user_id: int,
    *,
    status: str = "ready",
    hours_from_now: float = 1.0,
    extracted_text: str = "Extracted content",
) -> str:
    file_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    record = UploadedFile(
        user_id=user_id,
        file_id=file_id,
        original_filename="brief.txt",
        file_type="txt",
        file_size=100,
        status=status,
        extracted_text=extracted_text,
        extracted_char_count=len(extracted_text),
        truncated=False,
        created_at=now,
        expires_at=now + timedelta(hours=hours_from_now),
    )
    session.add(record)
    session.commit()
    return file_id


_MOCK_PERSONA = {
    "personas": [{
        "name": "Alice",
        "status": "primary",
        "role": "Product Manager",
        "tech_comfort": "high",
        "scenario_context": "Uses the product daily.",
        "demographics": {"age": "30", "location": "NYC", "education": "BA", "industry": "Tech"},
        "goals": ["Ship features faster"],
        "frustrations": ["Too many meetings"],
        "behavioral_patterns": ["Data-driven"],
        "influence_networks": ["Twitter"],
        "recruitment_criteria": ["5+ years PM experience"],
        "research_assumptions": ["Willing to pay for productivity tools"],
    }]
}


# ── Upload endpoint ───────────────────────────────────────────────────────────

class TestUploadEndpoint:
    def test_unauthenticated_upload_rejected(self, client: TestClient):
        response = client.post(
            "/api/files/upload",
            files={"file": ("brief.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert response.status_code == 401

    def test_disallowed_extension_rejected(self, client: TestClient, session: Session):
        user = _make_user(session, "uploader@test.com")
        client.app.dependency_overrides[get_current_user] = _auth_override(user)

        with patch("src.file_utils.upload_to_gemini", return_value=None):
            response = client.post(
                "/api/files/upload",
                files={"file": ("malware.exe", io.BytesIO(b"MZ\x00\x00"), "application/octet-stream")},
            )
        assert response.status_code == 415

    def test_oversized_file_rejected_for_free_tier(self, client: TestClient, session: Session):
        user = _make_user(session, "free@test.com", account_type=0)
        client.app.dependency_overrides[get_current_user] = _auth_override(user)

        # 6 MB > 5 MB free limit
        big_content = b"x" * (6 * 1024 * 1024)
        response = client.post(
            "/api/files/upload",
            files={"file": ("big.txt", io.BytesIO(big_content), "text/plain")},
        )
        assert response.status_code == 413

    def test_successful_txt_upload_returns_file_id(self, client: TestClient, session: Session):
        user = _make_user(session, "txtuser@test.com")
        client.app.dependency_overrides[get_current_user] = _auth_override(user)

        response = client.post(
            "/api/files/upload",
            files={"file": ("brief.txt", io.BytesIO(b"My product idea"), "text/plain")},
        )
        assert response.status_code == 200
        data = response.json()
        assert "file_id" in data
        assert data["file_type"] == "txt"
        assert data["status"] == "ready"
        assert isinstance(data["warnings"], list)

    def test_successful_upload_stores_record(self, client: TestClient, session: Session):
        user = _make_user(session, "storecheck@test.com")
        client.app.dependency_overrides[get_current_user] = _auth_override(user)

        response = client.post(
            "/api/files/upload",
            files={"file": ("notes.txt", io.BytesIO(b"Some notes"), "text/plain")},
        )
        assert response.status_code == 200
        file_id = response.json()["file_id"]

        record = session.exec(
            __import__("sqlmodel").select(UploadedFile).where(UploadedFile.file_id == file_id)
        ).first()
        assert record is not None
        assert record.user_id == user.id
        assert record.status == "ready"
        assert record.extracted_text == "Some notes"


# ── send_message with file_id ─────────────────────────────────────────────────

class TestSendMessageWithFile:
    def _setup_conversation(self, client: TestClient, user: User) -> int:
        client.app.dependency_overrides[get_current_user] = _auth_override(user)
        with patch("src.routers.chat.generate_chat_name", return_value={"name": "Test Chat"}):
            resp = client.post("/api/conversations/", json={"title": "Test"})
        assert resp.status_code == 200
        return resp.json()["id"]

    def test_valid_file_id_passes_context_to_generator(self, client: TestClient, session: Session):
        user = _make_user(session, "sender@test.com")
        conv_id = self._setup_conversation(client, user)
        file_id = _insert_file_record(session, user.id, extracted_text="Product brief content")

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA) as mock_gen, \
             patch("src.file_utils.cleanup_gemini_file"):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Generate personas", "file_id": file_id},
            )

        assert resp.status_code == 200
        _, kwargs = mock_gen.call_args
        assert kwargs["file_context"] is not None
        assert kwargs["file_context"]["extracted_text"] == "Product brief content"

    def test_wrong_user_file_id_rejected(self, client: TestClient, session: Session):
        owner = _make_user(session, "owner@test.com")
        attacker = _make_user(session, "attacker@test.com")
        file_id = _insert_file_record(session, owner.id)

        conv_id = self._setup_conversation(client, attacker)

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Steal file", "file_id": file_id},
            )
        assert resp.status_code == 403

    def test_expired_file_id_rejected(self, client: TestClient, session: Session):
        user = _make_user(session, "expired@test.com")
        # expires_at in the past
        file_id = _insert_file_record(session, user.id, hours_from_now=-1)

        conv_id = self._setup_conversation(client, user)

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Use expired file", "file_id": file_id},
            )
        assert resp.status_code == 410

    def test_already_used_file_id_rejected(self, client: TestClient, session: Session):
        user = _make_user(session, "used@test.com")
        file_id = _insert_file_record(session, user.id, status="used")

        conv_id = self._setup_conversation(client, user)

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Replay attack", "file_id": file_id},
            )
        assert resp.status_code == 409

    def test_nonexistent_file_id_rejected(self, client: TestClient, session: Session):
        user = _make_user(session, "ghost@test.com")
        conv_id = self._setup_conversation(client, user)

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Nothing here", "file_id": str(uuid.uuid4())},
            )
        assert resp.status_code == 404

    def test_file_marked_used_after_generation(self, client: TestClient, session: Session):
        user = _make_user(session, "consume@test.com")
        conv_id = self._setup_conversation(client, user)
        file_id = _insert_file_record(session, user.id)

        with patch("src.routers.chat.generate_personas", return_value=_MOCK_PERSONA), \
             patch("src.file_utils.cleanup_gemini_file"):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Use it", "file_id": file_id},
            )
        assert resp.status_code == 200

        # Refresh the record from the session
        session.expire_all()
        record = session.exec(
            __import__("sqlmodel").select(UploadedFile).where(UploadedFile.file_id == file_id)
        ).first()
        assert record.status == "used"

    def test_degraded_mode_flag_in_response_for_image_with_groq(
        self, client: TestClient, session: Session
    ):
        user = _make_user(session, "degraded@test.com")
        conv_id = self._setup_conversation(client, user)

        # Insert image file (no extracted_text — Groq path will degrade)
        file_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        record = UploadedFile(
            user_id=user.id,
            file_id=file_id,
            original_filename="photo.png",
            file_type="png",
            file_size=500,
            status="ready",
            gemini_file_uri=None,
            extracted_text=None,
            extracted_char_count=None,
            truncated=False,
            created_at=now,
            expires_at=now + timedelta(hours=1),
        )
        session.add(record)
        session.commit()

        def mock_gen(text, generated_persona=None, file_context=None):
            # Simulate Groq setting degraded_mode on image
            if file_context:
                file_context["degraded_mode"] = True
            return _MOCK_PERSONA

        with patch("src.routers.chat.generate_personas", side_effect=mock_gen), \
             patch("src.file_utils.cleanup_gemini_file"):
            resp = client.post(
                f"/api/conversations/{conv_id}/messages",
                json={"content": "Describe users for this app", "file_id": file_id},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["degraded_mode"] is True
        assert any("text-extraction" in w for w in data.get("warnings", []))
