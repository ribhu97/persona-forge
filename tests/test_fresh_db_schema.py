"""
Regression tests for a *freshly created* database file.

The rest of this suite runs on in-memory engines: no ``PRAGMA
foreign_keys`` and no migrated-table history, so it cannot see schema-shape
problems. These tests build a real file DB with foreign keys enforced — the
shape a brand-new deployment gets — and exercise job creation against it.

Context: ``messages.pending_generation_job_id`` originally declared a
ForeignKey to ``generation_jobs.id``. ``create_job`` inserts the assistant
message (carrying that job id) before the job row exists, so with foreign
keys enforced every job creation failed on a fresh DB. Databases migrated by
the ``ALTER TABLE`` branch in ``src/database.py`` never had the constraint,
which is why the bug only appeared on new deployments.
"""
import sqlite3

import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from src import jobs, quota, think_hard
from src.models import Conversation, GenerationJob, Message, User


@pytest.fixture(name="file_engine")
def file_engine_fixture(tmp_path, monkeypatch):
    """File-backed engine carrying the same pragmas src/database.py applies."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'fresh.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    SQLModel.metadata.create_all(engine)
    for module in (jobs, quota, think_hard):
        monkeypatch.setattr(module, "engine", engine)
    return engine


def test_create_job_succeeds_on_fresh_file_db(file_engine):
    """The whole generation pipeline starts here: a queued job plus its messages."""
    with Session(file_engine) as session:
        user = User(email="fresh@example.com", is_verified=True)
        session.add(user)
        session.flush()
        conv = Conversation(user_id=user.id, title="Fresh")
        session.add(conv)
        session.commit()
        user_id, conv_id = user.id, conv.id

    job = jobs.create_job(
        user_id, conv_id, mode="quick", input_text="hello", account_type=1
    )

    assert job.id
    assert jobs.get_job(job.id).state == jobs.STATE_QUEUED
    with Session(file_engine) as session:
        messages = session.exec(
            select(Message).where(Message.conversation_id == conv_id).order_by(Message.id)
        ).all()
        assert [m.role for m in messages] == ["user", "assistant"]
        # The pending pointer is set before the job row is written — the exact
        # ordering that used to violate the foreign key.
        assert messages[1].pending_generation_job_id == job.id
        assert session.get(GenerationJob, job.id) is not None


def test_fresh_messages_schema_matches_migrated_shape(file_engine):
    """
    Existing databases got this column via ALTER TABLE (no constraint), so a
    fresh database must not add one either — otherwise the same code works on
    old deployments and fails on new ones.
    """
    db_path = file_engine.url.database
    ddl = sqlite3.connect(db_path).execute(
        "select sql from sqlite_master where type='table' and name='messages'"
    ).fetchone()[0]

    assert "pending_generation_job_id" in ddl
    assert "REFERENCES generation_jobs" not in ddl
