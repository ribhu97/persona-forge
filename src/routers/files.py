"""
File upload endpoint.

NOTE: Rate limiting here is in-memory and per-process only.
In a multi-worker or multi-instance deployment this does NOT prevent
cross-process quota bypass. This is an MVP constraint — replace with
Redis-backed counters before scaling horizontally.
"""
import asyncio
import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from src.database import get_session
from src.dependencies import get_current_user, effective_account_type
from src.file_utils import (
    FILE_UPLOAD_TTL_HOURS,
    process_uploaded_file,
)
from src.models import UploadedFile, User
from src.schemas import UploadedFileResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/files", tags=["files"])

# ── In-memory rate limiter (single-worker MVP) ────────────────────────────────
# Tracks (user_id -> [(timestamp, bytes)]) for a sliding 60-second window.
# Limit: 10 MB per minute per user.
_rate_limit_lock = asyncio.Lock()
_upload_history: dict[int, list[tuple[datetime, int]]] = defaultdict(list)
RATE_LIMIT_WINDOW_S = 60
RATE_LIMIT_BYTES = 10 * 1024 * 1024  # 10 MB / minute


async def check_rate_limit(user_id: int, file_size: int) -> None:
    async with _rate_limit_lock:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=RATE_LIMIT_WINDOW_S)
        history = [entry for entry in _upload_history[user_id] if entry[0] > cutoff]
        total = sum(b for _, b in history) + file_size
        if total > RATE_LIMIT_BYTES:
            raise HTTPException(
                status_code=429,
                detail="Upload rate limit exceeded (10 MB/minute). Please wait before uploading more files.",
            )
        history.append((now, file_size))
        _upload_history[user_id] = history


# ── Upload endpoint ───────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadedFileResponse)
async def upload_file(
    file: UploadFile,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UploadedFileResponse:
    """
    Upload a file for use in persona generation.

    Returns an opaque file_id. Pass this file_id to the message endpoint
    alongside your text prompt. File context (extracted text, Gemini URI)
    is stored server-side and expires after 1 hour or after first use.
    """
    account_type = effective_account_type(user)

    # Quick pre-check on Content-Length before reading the body
    content_length = file.size
    if content_length:
        from src.file_utils import TIER_SIZE_LIMITS, validate_size
        validate_size(content_length, account_type)

    # Rate limit check (pre-read; actual size verified after read)
    if content_length:
        await check_rate_limit(user.id, content_length)

    result = await process_uploaded_file(file, account_type)

    # Post-read rate limit update if Content-Length was unavailable
    if not content_length:
        await check_rate_limit(user.id, result["file_size"])

    file_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    record = UploadedFile(
        user_id=user.id,
        file_id=file_id,
        original_filename=result["original_filename"],
        file_type=result["file_type"],
        file_size=result["file_size"],
        status="ready",
        gemini_file_uri=result["gemini_file_uri"],
        extracted_text=result["extracted_text"],
        extracted_char_count=result["extracted_char_count"],
        truncated=result["truncated"],
        created_at=now,
        expires_at=now + timedelta(hours=FILE_UPLOAD_TTL_HOURS),
    )
    session.add(record)
    session.commit()

    return UploadedFileResponse(
        file_id=file_id,
        filename=result["original_filename"],
        file_type=result["file_type"],
        size=result["file_size"],
        status="ready",
        truncated=result["truncated"],
        char_count=result["extracted_char_count"],
        warnings=result["warnings"],
    )
