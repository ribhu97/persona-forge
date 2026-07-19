"""
Generation job lifecycle: creation, atomic claims, CAS transitions, events, sweepers.

State machine:

    queued ──claim──► running ──► persisting ──► succeeded   (terminal)
                │
                ├──► failed                                   (terminal)
                └──► timed_out                                (terminal)

Atomic claim:
    UPDATE generation_jobs
       SET state='running', worker_id=?, claimed_at=now()
     WHERE id=? AND state='queued' AND expires_at > now()

Terminal transitions are compare-and-swap too — every terminal UPDATE carries
``WHERE state IN (<expected non-terminal states>)`` with a rowcount check.
The loser of a worker/sweeper race abandons its entire side-effect bundle.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlmodel import Session, select
from sqlalchemy import bindparam, text as sa_text

from src.database import engine
from src.models import GenerationJob, GenerationJobEvent, Message, Conversation, UploadedFile

logger = logging.getLogger(__name__)


# ── Constants ─────────────────────────────────────────────────────────────────

JOB_DEADLINE_S = 300  # 5 min total budget
STAGE_DEADLINE_S = 60
GEMINI_TIMEOUT_S = 30
RESERVATION_TTL_S = 15 * 60
FILE_SNAPSHOT_CHAR_CAP = 200_000
FILE_SNAPSHOT_RETENTION_DAYS = 7
EVENT_RETENTION_DAYS = 7
MAX_FREE_RETRY_DEPTH = 3

# State names
STATE_QUEUED = "queued"
STATE_RUNNING = "running"
STATE_PERSISTING = "persisting"
STATE_SUCCEEDED = "succeeded"
STATE_FAILED = "failed"
STATE_TIMED_OUT = "timed_out"

NON_TERMINAL_STATES = (STATE_QUEUED, STATE_RUNNING, STATE_PERSISTING)
TERMINAL_STATES = (STATE_SUCCEEDED, STATE_FAILED, STATE_TIMED_OUT)

# Error codes
ERR_TIER_REQUIRED = "tier_required"
ERR_QUOTA_EXHAUSTED = "quota_exhausted"
ERR_INSUFFICIENT_DRAFTS = "insufficient_drafts"
ERR_INVALID_OUTPUT = "invalid_output"
ERR_PROVIDER_CAPACITY = "provider_capacity"
ERR_SAFETY_BLOCK = "safety_block"
ERR_TIMEOUT = "timeout"
ERR_UNSUPPORTED_ATTACHMENT = "unsupported_attachment_for_fallback"
ERR_PERSISTENCE_FAILURE = "persistence_failure"
ERR_INTERNAL_ERROR = "internal_error"

FREE_RETRY_CODES = frozenset({
    ERR_TIMEOUT,
    ERR_PROVIDER_CAPACITY,
    ERR_PERSISTENCE_FAILURE,
    ERR_INTERNAL_ERROR,
})

# Client-facing messages per error code.  Raw exception detail is logged
# server-side only — it may contain provider responses, paths, or auth errors.
PUBLIC_ERROR_MESSAGES: dict[str, str] = {
    ERR_TIER_REQUIRED: "Think Hard is a paid feature. Upgrade to use it.",
    ERR_QUOTA_EXHAUSTED: "You've reached your monthly generation limit.",
    ERR_INSUFFICIENT_DRAFTS: "Generation produced too few usable drafts. Please retry.",
    ERR_INVALID_OUTPUT: "The model returned an unusable response. Please retry.",
    ERR_PROVIDER_CAPACITY: "The AI provider is at capacity. Please retry in a moment.",
    ERR_SAFETY_BLOCK: "The request was blocked by content safety filters.",
    ERR_TIMEOUT: "Generation timed out. Please retry.",
    ERR_UNSUPPORTED_ATTACHMENT: "The attached file type isn't supported for this mode.",
    ERR_PERSISTENCE_FAILURE: "Saving the results failed. Please retry.",
    ERR_INTERNAL_ERROR: "Something went wrong. Please retry.",
}

PUBLIC_ERROR_FALLBACK = "Something went wrong. Please retry."


def public_error_message(error_code: Optional[str]) -> Optional[str]:
    """Safe client-facing message for an error code (None passes through)."""
    if error_code is None:
        return None
    return PUBLIC_ERROR_MESSAGES.get(error_code, PUBLIC_ERROR_FALLBACK)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_job_id() -> str:
    """Generate a sortable, unique job ID (timestamp + random hex)."""
    ts = int(time.time() * 1000)
    rand = uuid.uuid4().hex[:16]
    return f"{ts:013x}{rand}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ── File snapshot ─────────────────────────────────────────────────────────────

def _build_file_snapshot(file_id: str, user_id: int, session: Session) -> Optional[dict]:
    """
    Resolve an uploaded file and build a snapshot dict for the job.
    Caps extracted text at FILE_SNAPSHOT_CHAR_CAP.  Called before the write
    transaction (file extraction is slow/CPU work).
    """
    record = session.exec(
        select(UploadedFile).where(
            UploadedFile.file_id == file_id,
            UploadedFile.user_id == user_id,
        )
    ).first()
    if not record:
        return None

    now = _now()
    expires = _utc(record.expires_at)
    if expires and now > expires:
        return None
    if record.status != "ready":
        return None

    extracted = record.extracted_text or ""
    truncated = False
    if len(extracted) > FILE_SNAPSHOT_CHAR_CAP:
        extracted = extracted[:FILE_SNAPSHOT_CHAR_CAP]
        truncated = True

    return {
        "file_id": record.file_id,
        "mime_type": record.file_type,
        "gemini_uri": record.gemini_file_uri,
        "extracted_text": extracted,
        "char_count": len(extracted),
        "truncated": truncated or record.truncated,
    }


# ── Event emission ────────────────────────────────────────────────────────────

def emit_event(session: Session, job_id: str, event_type: str, payload: dict) -> GenerationJobEvent:
    """Append an event row.  The caller owns the transaction boundary."""
    event = GenerationJobEvent(
        job_id=job_id,
        event_type=event_type,
        payload=json.dumps(payload),
    )
    session.add(event)
    session.flush()  # get event.id (monotonic — doubles as SSE Last-Event-ID)
    return event


def get_events_since(job_id: str, last_event_id: int = 0) -> list[GenerationJobEvent]:
    """Return events with id > last_event_id, ordered by id."""
    with Session(engine) as session:
        stmt = (
            select(GenerationJobEvent)
            .where(
                GenerationJobEvent.job_id == job_id,
                GenerationJobEvent.id > last_event_id,
            )
            .order_by(GenerationJobEvent.id)
        )
        return list(session.exec(stmt).all())


# ── Job creation ──────────────────────────────────────────────────────────────

def create_job(
    user_id: int,
    conversation_id: int,
    *,
    mode: str,
    input_text: str,
    file_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    account_type: int = 0,
    parent_job_id: Optional[str] = None,
    is_free_retry: bool = False,
) -> GenerationJob:
    """
    Create a generation job.

    Before the transaction: resolve and snapshot file context (cap 200KB).
    Then: tier gate, quota reserve, and a single transaction for messages +
    job row + initial event.

    Raises TierRequired / QuotaExhausted as needed.
    """
    from src import quota
    from fastapi import HTTPException

    job_id = _generate_job_id()
    now = _now()
    expires_at = now + timedelta(seconds=JOB_DEADLINE_S)

    # ── Idempotency dedup (pre-check; unique constraint is the safety net) ──
    if idempotency_key:
        with Session(engine) as session:
            existing = session.exec(
                select(GenerationJob).where(
                    GenerationJob.user_id == user_id,
                    GenerationJob.conversation_id == conversation_id,
                    GenerationJob.idempotency_key == idempotency_key,
                )
            ).first()
            if existing:
                return existing

    # ── Tier gate ──
    if mode == "think_hard" and account_type == 0:
        raise quota.TierRequired("think_hard")

    # ── File snapshot (before any write transaction) ──
    file_snapshot: Optional[dict] = None
    if file_id:
        with Session(engine) as session:
            file_snapshot = _build_file_snapshot(file_id, user_id, session)

    # ── Quota reservation (separate BEGIN IMMEDIATE transaction) ──
    reservation_id: Optional[str] = None
    if not is_free_retry:
        reservation = quota.reserve(user_id, feature=mode, account_type=account_type)
        reservation_id = reservation.id

    # ── Single transaction: messages + job + initial event ──
    try:
        with Session(engine) as session:
            conv = session.get(Conversation, conversation_id)
            if not conv or conv.user_id != user_id:
                if reservation_id:
                    quota.refund(reservation_id)
                raise HTTPException(status_code=404, detail="Conversation not found")

            user_msg = Message(
                conversation_id=conversation_id,
                role="user",
                content=input_text,
            )
            session.add(user_msg)
            session.flush()

            asst_msg = Message(
                conversation_id=conversation_id,
                role="assistant",
                content="",
                is_pending=True,
                pending_generation_job_id=job_id,
            )
            session.add(asst_msg)
            session.flush()

            job = GenerationJob(
                id=job_id,
                user_id=user_id,
                conversation_id=conversation_id,
                parent_job_id=parent_job_id,
                mode=mode,
                state=STATE_QUEUED,
                input_text=input_text,
                file_snapshot=json.dumps(file_snapshot) if file_snapshot else None,
                idempotency_key=idempotency_key,
                reservation_id=reservation_id,
                expires_at=expires_at,
                user_message_id=user_msg.id,
                assistant_message_id=asst_msg.id,
            )
            session.add(job)

            emit_event(session, job_id, "state_changed", {"state": STATE_QUEUED, "mode": mode})

            conv.last_message_at = now
            session.add(conv)

            session.commit()
            session.refresh(job)
            return job
    except Exception:
        if reservation_id:
            quota.refund(reservation_id)
        raise


# ── Atomic claim & transitions ────────────────────────────────────────────────

def claim_next_queued(worker_id: str) -> Optional[GenerationJob]:
    """
    Atomically claim the next queued job.

    Uses a CAS UPDATE:
        UPDATE generation_jobs
           SET state='running', worker_id=?, claimed_at=now()
         WHERE id=? AND state='queued' AND expires_at > now()

    Only the winner (rowcount=1) proceeds.  Expired-queued jobs are left for
    the sweeper.
    """
    now = _now()
    with Session(engine) as session:
        # Find the oldest queued, non-expired job
        job = session.exec(
            select(GenerationJob)
            .where(
                GenerationJob.state == STATE_QUEUED,
                GenerationJob.expires_at > now,
            )
            .order_by(GenerationJob.created_at)
            .limit(1)
        ).first()

        if not job:
            return None

        # Atomic CAS claim — use SQLAlchemy execute() for proper rowcount
        result = session.execute(
            sa_text(
                "UPDATE generation_jobs "
                "SET state=:running, worker_id=:wid, claimed_at=:now, "
                "    started_at=:now, updated_at=:now "
                "WHERE id=:jid AND state='queued' AND expires_at > :now"
            ).bindparams(
                running=STATE_RUNNING,
                wid=worker_id,
                now=now,
                jid=job.id,
            )
        )
        rowcount = result.rowcount if result.rowcount is not None else 0
        session.commit()

        if not rowcount:
            return None  # lost the race or expired

        session.refresh(job)
        return job


def transition_in_session(
    session: Session,
    job_id: str,
    target_state: str,
    *,
    expected_states: tuple[str, ...] = NON_TERMINAL_STATES,
    error_code: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> bool:
    """
    Stage a CAS transition to *target_state* in the caller's session.  The
    caller owns the transaction boundary (commit/rollback).

    Returns True if the transition succeeded (rowcount=1), False if the job
    was already in a terminal state or the expected state didn't match.
    """
    now = _now()

    if target_state in TERMINAL_STATES:
        result = session.execute(
            sa_text(
                "UPDATE generation_jobs "
                "SET state=:target, finished_at=:now, updated_at=:now, "
                "    error_code=:ec, error_detail=:ed "
                "WHERE id=:jid AND state IN :states"
            ).bindparams(
                bindparam("states", expanding=True),
                target=target_state,
                now=now,
                ec=error_code,
                ed=error_detail,
                jid=job_id,
            ),
            {"states": list(expected_states)},
        )
    else:
        result = session.execute(
            sa_text(
                "UPDATE generation_jobs "
                "SET state=:target, updated_at=:now "
                "WHERE id=:jid AND state IN :states"
            ).bindparams(
                bindparam("states", expanding=True),
                target=target_state,
                now=now,
                jid=job_id,
            ),
            {"states": list(expected_states)},
        )
    rowcount = result.rowcount if result.rowcount is not None else 0
    return bool(rowcount)


def transition(
    job_id: str,
    target_state: str,
    *,
    expected_states: tuple[str, ...] = NON_TERMINAL_STATES,
    error_code: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> bool:
    """CAS transition in a standalone transaction.  See transition_in_session."""
    with Session(engine) as session:
        ok = transition_in_session(
            session, job_id, target_state,
            expected_states=expected_states,
            error_code=error_code,
            error_detail=error_detail,
        )
        session.commit()
        return ok


def get_job(job_id: str) -> Optional[GenerationJob]:
    """Return the job row, or None if not found."""
    with Session(engine) as session:
        return session.get(GenerationJob, job_id)


# ── Terminal transition with event + quota ────────────────────────────────────

def fail_job(
    job_id: str,
    error_code: str,
    error_detail: Optional[str] = None,
    reservation_id: Optional[str] = None,
) -> bool:
    """
    Transition a job to 'failed', emit a terminal event, and refund the
    reservation.  CAS-guarded — only one caller wins.

    *error_detail* may contain raw exception text; it is logged server-side
    only.  The row and the terminal event carry the safe public message.
    """
    from src import quota

    if error_detail:
        logger.error("[jobs] job %s failed (%s): %s", job_id, error_code, error_detail)
    safe_detail = public_error_message(error_code)

    ok = transition(
        job_id, STATE_FAILED,
        expected_states=NON_TERMINAL_STATES,
        error_code=error_code,
        error_detail=safe_detail,
    )
    if not ok:
        return False

    # Emit terminal event
    with Session(engine) as session:
        emit_event(session, job_id, "terminal", {
            "state": STATE_FAILED,
            "error_code": error_code,
            "error_detail": safe_detail,
            "assistant_message_id": None,
            "persona_count": None,
        })
        # Convert pending assistant message to error placeholder
        job = session.get(GenerationJob, job_id)
        if job:
            msg = session.get(Message, job.assistant_message_id)
            if msg and msg.is_pending:
                msg.is_pending = False
                msg.content = f"Generation failed: {error_code}"
                msg.pending_generation_job_id = None
                session.add(msg)
        session.commit()

    # Refund reservation
    if reservation_id:
        quota.refund(reservation_id)
    return True


def timeout_job(job_id: str, reservation_id: Optional[str] = None) -> bool:
    """Transition a job to 'timed_out' and refund.  CAS-guarded."""
    from src import quota

    ok = transition(
        job_id, STATE_TIMED_OUT,
        expected_states=(STATE_QUEUED, STATE_RUNNING, STATE_PERSISTING),
        error_code=ERR_TIMEOUT,
        error_detail=public_error_message(ERR_TIMEOUT),
    )
    if not ok:
        return False

    with Session(engine) as session:
        emit_event(session, job_id, "terminal", {
            "state": STATE_TIMED_OUT,
            "error_code": ERR_TIMEOUT,
            "assistant_message_id": None,
            "persona_count": None,
        })
        job = session.get(GenerationJob, job_id)
        if job:
            msg = session.get(Message, job.assistant_message_id)
            if msg and msg.is_pending:
                msg.is_pending = False
                msg.content = "Generation timed out."
                msg.pending_generation_job_id = None
                session.add(msg)
        session.commit()

    if reservation_id:
        quota.refund(reservation_id)
    return True


# ── Sweepers ──────────────────────────────────────────────────────────────────

def sweep_timed_out_jobs(session: Session) -> int:
    """
    Sweep running/queued jobs past expires_at -> timed_out + refund.
    CAS-guarded.  Returns count of jobs timed out.
    """
    now = _now()
    stmt = select(GenerationJob).where(
        GenerationJob.state.in_([STATE_QUEUED, STATE_RUNNING, STATE_PERSISTING]),
        GenerationJob.expires_at < now,
    )
    stale = session.exec(stmt).all()
    count = 0
    for job in stale:
        if timeout_job(job.id, job.reservation_id):
            count += 1
    return count


def sweep_old_file_snapshots(session: Session) -> int:
    """Null file_snapshot for terminal jobs older than FILE_SNAPSHOT_RETENTION_DAYS."""
    cutoff = _now() - timedelta(days=FILE_SNAPSHOT_RETENTION_DAYS)
    stmt = select(GenerationJob).where(
        GenerationJob.state.in_(TERMINAL_STATES),
        GenerationJob.finished_at < cutoff,
        GenerationJob.file_snapshot.is_not(None),
    )
    jobs = session.exec(stmt).all()
    count = 0
    for job in jobs:
        job.file_snapshot = None
        job.updated_at = _now()
        session.add(job)
        count += 1
    if count:
        session.commit()
    return count


def sweep_old_events(session: Session) -> int:
    """Delete events for terminal jobs older than EVENT_RETENTION_DAYS."""
    cutoff = _now() - timedelta(days=EVENT_RETENTION_DAYS)
    old_jobs = session.exec(
        select(GenerationJob.id).where(
            GenerationJob.state.in_(TERMINAL_STATES),
            GenerationJob.finished_at < cutoff,
        )
    ).all()
    if not old_jobs:
        return 0

    from sqlalchemy import delete
    result = session.exec(
        delete(GenerationJobEvent).where(
            GenerationJobEvent.job_id.in_(old_jobs)
        )
    )
    session.commit()
    return result.rowcount if hasattr(result, "rowcount") else 0


def recover_orphaned_running_jobs(session: Session) -> int:
    """
    On startup (single-instance), any 'running' or 'persisting' row is provably
    orphaned.

    'persisting' orphans: the final transaction is atomic (personas + quota
    commit + succeeded transition in one txn), so an orphan here means nothing
    was persisted — fail with persistence_failure and refund.  The user gets a
    free retry.

    'running' orphans: reset to 'queued' if not expired, else 'timed_out' + refund.
    """
    stmt = select(GenerationJob).where(
        GenerationJob.state.in_([STATE_RUNNING, STATE_PERSISTING])
    )
    orphans = session.exec(stmt).all()
    count = 0
    now = _now()
    for job in orphans:
        if job.state == STATE_PERSISTING:
            if fail_job(
                job.id, ERR_PERSISTENCE_FAILURE,
                error_detail="orphaned in persisting state at startup",
                reservation_id=job.reservation_id,
            ):
                count += 1
            continue
        expires = _utc(job.expires_at) or now
        if now > expires:
            timeout_job(job.id, job.reservation_id)
        else:
            job.state = STATE_QUEUED
            job.worker_id = None
            job.claimed_at = None
            job.started_at = None
            job.updated_at = now
            session.add(job)
            emit_event(session, job.id, "state_changed", {
                "state": STATE_QUEUED, "reason": "orphan_recovery",
            })
            count += 1
    if count:
        session.commit()
    return count


def run_all_sweeps(session: Session) -> dict:
    """Run all sweepers.  Returns a summary dict."""
    from src import quota
    orphaned = recover_orphaned_running_jobs(session)
    timed_out = sweep_timed_out_jobs(session)
    snapshots = sweep_old_file_snapshots(session)
    events = sweep_old_events(session)
    reservations = quota.sweep_orphaned_reservations(session)
    return {
        "orphaned_running_recovered": orphaned,
        "timed_out": timed_out,
        "file_snapshots_nulled": snapshots,
        "events_deleted": events,
        "reservations_refunded": reservations,
    }


# ── Retry ─────────────────────────────────────────────────────────────────────

def _retry_chain_depth(job: GenerationJob) -> int:
    """Walk parent_job_id chain to compute retry depth."""
    depth = 0
    current = job
    while current.parent_job_id:
        parent = get_job(current.parent_job_id)
        if not parent:
            break
        current = parent
        depth += 1
    return depth


def retry_job(
    parent_job: GenerationJob,
    *,
    account_type: int,
) -> GenerationJob:
    """
    Create a child job for retry.

    Free iff parent's error_code is a free-retry code AND chain depth <
    MAX_FREE_RETRY_DEPTH; otherwise reserves new quota.

    Returns the new child GenerationJob.
    """
    is_free = (
        parent_job.error_code in FREE_RETRY_CODES
        and _retry_chain_depth(parent_job) < MAX_FREE_RETRY_DEPTH
    )

    # Parse file snapshot if present
    file_id = None
    if parent_job.file_snapshot:
        try:
            snap = json.loads(parent_job.file_snapshot)
            file_id = snap.get("file_id")
        except (json.JSONDecodeError, TypeError):
            pass

    # Server-generated idempotency key for the child
    child_idempotency = f"retry-{uuid.uuid4().hex}"

    return create_job(
        user_id=parent_job.user_id,
        conversation_id=parent_job.conversation_id,
        mode=parent_job.mode,
        input_text=parent_job.input_text,
        file_id=file_id,
        idempotency_key=child_idempotency,
        account_type=account_type,
        parent_job_id=parent_job.id,
        is_free_retry=is_free,
    )
