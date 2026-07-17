"""
Job API endpoints for Think Hard and Quick mode generation.

    POST   /conversations/{cid}/jobs                 → create job
    GET    /conversations/{cid}/jobs/{job_id}        → job status
    GET    /conversations/{cid}/jobs/{job_id}/events → SSE stream
    POST   /conversations/{cid}/jobs/{job_id}/retry  → retry failed job
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from src.database import get_session
from src.dependencies import get_current_user, effective_account_type, ACCOUNT_ADMIN
from src.models import User, Conversation, GenerationJob
from src.schemas import JobCreateRequest, JobResponse, JobEventResponse
from src import jobs as jobs_mod
from src import quota

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["jobs"])

SSE_HEARTBEAT_S = 15
SSE_POLL_INTERVAL_S = 1.0
SSE_MAX_DURATION_S = 360  # 6 min — slightly longer than JOB_DEADLINE


def _verify_conversation(session: Session, conversation_id: int, user: User) -> Conversation:
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _job_to_response(job: GenerationJob) -> dict:
    """Convert a GenerationJob to a response dict."""
    return {
        "id": job.id,
        "state": job.state,
        "mode": job.mode,
        "error_code": job.error_code,
        "error_detail": job.error_detail,
        "assistant_message_id": job.assistant_message_id,
        "created_at": job.created_at,
        "expires_at": job.expires_at,
    }


@router.post("/{conversation_id}/jobs", response_model=JobResponse)
async def create_job_endpoint(
    conversation_id: int,
    data: JobCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Create a generation job (quick or think_hard)."""
    _verify_conversation(session, conversation_id, user)
    account_type = effective_account_type(user)

    try:
        job = jobs_mod.create_job(
            user_id=user.id,
            conversation_id=conversation_id,
            mode=data.mode,
            input_text=data.text,
            file_id=data.file_id,
            idempotency_key=data.idempotency_key,
            account_type=account_type,
        )
    except quota.TierRequired:
        raise HTTPException(
            status_code=402,
            detail="tier_required: Think Hard is a paid feature. Upgrade to use it.",
        )
    except quota.QuotaExhausted as e:
        raise HTTPException(
            status_code=429,
            detail=f"quota_exhausted: You've used {e.used}/{e.limit} Think Hard generations this month.",
        )

    return _job_to_response(job)


@router.get("/{conversation_id}/jobs/{job_id}", response_model=JobResponse)
async def get_job_endpoint(
    conversation_id: int,
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Get the current status of a job."""
    _verify_conversation(session, conversation_id, user)
    job = jobs_mod.get_job(job_id)
    if not job or job.conversation_id != conversation_id or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


def _format_sse_event(event_id: int, event_type: str, payload: str) -> str:
    """Format a single SSE event."""
    return f"id: {event_id}\nevent: {event_type}\ndata: {payload}\n\n"


@router.get("/{conversation_id}/jobs/{job_id}/events")
async def stream_job_events(
    conversation_id: int,
    job_id: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """
    SSE stream of job events. Supports reconnection via Last-Event-ID.
    Polls the events table, sends heartbeats, closes on terminal state.
    """
    _verify_conversation(session, conversation_id, user)
    job = jobs_mod.get_job(job_id)
    if not job or job.conversation_id != conversation_id or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    last_event_id = 0
    lei_header = request.headers.get("last-event-id")
    if lei_header:
        try:
            last_event_id = int(lei_header)
        except ValueError:
            last_event_id = 0

    async def event_stream() -> AsyncGenerator[str, None]:
        start_time = datetime.now(timezone.utc)
        last_heartbeat = datetime.now(timezone.utc)
        cursor = last_event_id
        terminal_sent = False

        while True:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            if elapsed > SSE_MAX_DURATION_S:
                yield _format_sse_event(0, "stream_timeout", json.dumps({"reason": "max_duration"}))
                break

            if await request.is_disconnected():
                break

            events = jobs_mod.get_events_since(job_id, cursor)
            for event in events:
                cursor = event.id
                yield _format_sse_event(event.id, event.event_type, event.payload)
                if event.event_type == "terminal":
                    terminal_sent = True

            if terminal_sent:
                break

            now = datetime.now(timezone.utc)
            if (now - last_heartbeat).total_seconds() >= SSE_HEARTBEAT_S:
                yield ": keepalive\n\n"
                last_heartbeat = now

            current_job = jobs_mod.get_job(job_id)
            if current_job and current_job.state in jobs_mod.TERMINAL_STATES and not terminal_sent:
                yield _format_sse_event(cursor, "terminal", json.dumps({
                    "state": current_job.state,
                    "error_code": current_job.error_code,
                    "assistant_message_id": current_job.assistant_message_id,
                    "persona_count": None,
                }))
                break

            await asyncio.sleep(SSE_POLL_INTERVAL_S)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/{conversation_id}/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job_endpoint(
    conversation_id: int,
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Retry a failed or timed-out job by creating a child job."""
    _verify_conversation(session, conversation_id, user)
    parent = jobs_mod.get_job(job_id)
    if not parent or parent.conversation_id != conversation_id or parent.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    if parent.state not in (jobs_mod.STATE_FAILED, jobs_mod.STATE_TIMED_OUT):
        raise HTTPException(status_code=409, detail="Can only retry failed or timed-out jobs")

    account_type = effective_account_type(user)
    try:
        child = jobs_mod.retry_job(parent, account_type=account_type)
    except quota.TierRequired:
        raise HTTPException(status_code=402, detail="tier_required: Upgrade to retry.")
    except quota.QuotaExhausted as e:
        raise HTTPException(status_code=429, detail=f"quota_exhausted: {e}")

    return _job_to_response(child)

