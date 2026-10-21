"""
Think Hard orchestrator: draft -> judge -> critique -> revise.

This module runs inside a worker thread (via ThreadPoolExecutor) and owns the
entire lifecycle of a single job:

  1. Draft (x3 parallel, each with a different analytical lens)
  2. Judge (pick the best draft)
  3. Critique (identify issues in the winner)
  4. Revise (fix the issues)
  5. Final transaction (save personas, commit quota, fill assistant message)

Soft-fail policy: if judge/critique/revise fails, the pipeline degrades
gracefully — it uses the best available output and emits a stage_failed_soft
warning.  Only draft failure is hard (need >= 2 valid drafts).

All terminal state transitions are CAS-guarded via jobs.transition().
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Callable, Optional

from src import jobs, quota
from src.database import engine
from src.generator import (
    ProviderResult,
    SafetyBlockError,
    InvalidOutputError,
    UnsupportedAttachmentError,
    call_with_fallback,
    parse_json,
    _extract_json_object,
)
from src.exceptions import AllProvidersRateLimitedError
from src.models import GenerationJob, GenerationJobEvent, Message
from src.persona_persistence import save_personas
from src.prompts import (
    refined_generation_prompt,
    DRAFT_ANGLE_SUFFIXES,
    think_hard_judge_prompt,
    think_hard_critique_prompt,
    think_hard_revise_prompt,
)
from sqlmodel import Session

logger = logging.getLogger(__name__)

MAX_DRAFT_RETRIES = 1
DRAFT_TIMEOUT_S = 60
DRAFT_PARALLELISM = 4  # ThreadPoolExecutor for parallel drafts (unrelated to the job worker pool)


# ── Retry wrapper ─────────────────────────────────────────────────────────────

def _with_retry(fn: Callable, max_retries: int = MAX_DRAFT_RETRIES) -> object:
    """
    Wrap a stage call: catch -> classify -> retry once -> raise typed exception.

    Retryable: AllProvidersRateLimitedError (capacity).
    Non-retryable: SafetyBlockError, InvalidOutputError, UnsupportedAttachmentError.
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except AllProvidersRateLimitedError as e:
            last_exc = e
            if attempt < max_retries:
                logger.warning("[think_hard] capacity error, retrying (attempt %d)", attempt + 1)
                continue
            raise
        except (SafetyBlockError, InvalidOutputError, UnsupportedAttachmentError):
            raise  # non-retryable
    raise last_exc  # type: ignore[misc]


# ── Stage validators ──────────────────────────────────────────────────────────

def _validate_personas(parsed: dict) -> dict:
    """Validate a persona draft. Raises InvalidOutputError on failure."""
    if not isinstance(parsed, dict):
        raise InvalidOutputError("Expected JSON object")
    personas = parsed.get("personas")
    if not isinstance(personas, list) or len(personas) == 0:
        raise InvalidOutputError("Missing or empty 'personas' array")
    for i, p in enumerate(personas):
        if not isinstance(p, dict):
            raise InvalidOutputError(f"Persona {i} is not an object")
        for field in ("name", "status", "role", "tech_comfort"):
            if field not in p or not p.get(field):
                raise InvalidOutputError(f"Persona {i} missing '{field}'")
        if p.get("status") not in ("primary", "secondary"):
            raise InvalidOutputError(f"Persona {i} invalid status: {p.get('status')}")
        if p.get("tech_comfort") not in ("low", "medium", "high"):
            raise InvalidOutputError(f"Persona {i} invalid tech_comfort: {p.get('tech_comfort')}")
        demos = p.get("demographics")
        if not isinstance(demos, dict):
            raise InvalidOutputError(f"Persona {i} missing demographics")
    return parsed


def _validate_judge(parsed: dict, num_drafts: int) -> dict:
    """Validate judge output. Raises InvalidOutputError on failure."""
    if not isinstance(parsed, dict):
        raise InvalidOutputError("Judge output is not an object")
    winner = parsed.get("winner_index")
    if not isinstance(winner, int) or winner < 0 or winner >= num_drafts:
        raise InvalidOutputError(f"Judge winner_index invalid: {winner}")
    return parsed


def _validate_critique(parsed: dict) -> dict:
    """Validate critique output. Raises InvalidOutputError on failure."""
    if not isinstance(parsed, dict):
        raise InvalidOutputError("Critique output is not an object")
    issues = parsed.get("issues")
    if issues is not None and not isinstance(issues, list):
        raise InvalidOutputError("Critique 'issues' must be a list")
    return parsed


# ── Stage functions ───────────────────────────────────────────────────────────

def _render_prompt(template: str, **subs: str) -> str:
    """
    Fill {name} placeholders via replace (values contain JSON, so .format()
    would choke on braces).  Asserts each placeholder exists in the template
    so a renamed placeholder fails loudly instead of silently no-oping.
    """
    for name, value in subs.items():
        placeholder = "{" + name + "}"
        if placeholder not in template:
            raise ValueError(f"Prompt template missing placeholder {placeholder}")
        template = template.replace(placeholder, value)
    return template


def _run_draft(
    input_text: str,
    file_context: Optional[dict],
    angle_suffix: str,
    angle_index: int,
) -> dict:
    """Run a single draft stage. Returns validated parsed personas dict."""
    def _call():
        system_prompt = refined_generation_prompt + angle_suffix
        result = call_with_fallback(
            system_prompt, input_text,
            file_context=file_context,
        )
        parsed = parse_json(result.raw_text)
        return _validate_personas(parsed)

    return _with_retry(_call)


def _run_judge(drafts: list[dict]) -> dict:
    """Run the judge stage. Returns validated judge output with winner_index."""
    candidates_json = json.dumps(
        [{"index": i, "draft": d} for i, d in enumerate(drafts)],
        indent=2,
    )
    prompt = _render_prompt(think_hard_judge_prompt, candidates=candidates_json)

    def _call():
        result = call_with_fallback(prompt, "Evaluate the candidate drafts and select the best.")
        parsed = json.loads(_extract_json_object(result.raw_text))
        return _validate_judge(parsed, len(drafts))

    return _with_retry(_call)


def _run_critique(winner: dict) -> dict:
    """Run the critique stage. Returns validated critique output."""
    candidate_json = json.dumps(winner, indent=2)
    prompt = _render_prompt(think_hard_critique_prompt, candidate=candidate_json)

    def _call():
        result = call_with_fallback(prompt, "Critique the candidate persona set.")
        parsed = json.loads(_extract_json_object(result.raw_text))
        return _validate_critique(parsed)

    return _with_retry(_call)


def _run_revise(winner: dict, critique: dict) -> dict:
    """Run the revise stage. Returns validated revised personas."""
    candidate_json = json.dumps(winner, indent=2)
    critique_json = json.dumps(critique, indent=2)
    prompt = _render_prompt(think_hard_revise_prompt, candidate=candidate_json, critique=critique_json)

    def _call():
        result = call_with_fallback(prompt, "Revise the persona draft based on critique.")
        parsed = parse_json(result.raw_text)
        return _validate_personas(parsed)

    return _with_retry(_call)


# ── Event helper ──────────────────────────────────────────────────────────────

def _emit(job_id: str, event_type: str, payload: dict) -> None:
    """Emit an event in a standalone session (worker-thread safe)."""
    with Session(engine) as session:
        jobs.emit_event(session, job_id, event_type, payload)
        session.commit()


def _emit_soft_failure(job_id: str, stage: str, exc: Exception, **extra) -> None:
    """
    Emit a stage_failed_soft event with a sanitized payload.  Event payloads
    stream to the client verbatim, so raw exception text stays in the log.
    """
    code, raw_detail = _classify_error(exc)
    logger.warning("[think_hard] job %s stage %s soft-failed (%s): %s",
                   job_id, stage, code, raw_detail)
    _emit(job_id, "stage_failed_soft", {
        "stage": stage,
        "error_code": code,
        "error": jobs.public_error_message(code),
        **extra,
    })


# ── Final transaction ─────────────────────────────────────────────────────────

def _final_transaction(job: GenerationJob, personas_data: list) -> bool:
    """
    Persist the job's results atomically.

    After the CAS claim of 'persisting' (its own small txn — just a guard),
    everything happens in ONE transaction: save personas, fill the assistant
    message, commit the quota reservation, CAS-transition to 'succeeded', and
    emit the terminal event.  A crash at any point before commit leaves the job
    in 'persisting' with nothing persisted and the reservation still 'reserved',
    so orphan recovery can safely fail + refund it.
    """
    if not jobs.transition(job.id, jobs.STATE_PERSISTING):
        return False

    try:
        with Session(engine) as session:
            msg = session.get(Message, job.assistant_message_id)
            if not msg:
                raise RuntimeError(f"Assistant message {job.assistant_message_id} not found")

            msg.is_pending = False
            msg.content = f"Generated {len(personas_data)} personas"
            msg.pending_generation_job_id = None
            session.add(msg)
            session.flush()

            save_personas(session, msg.id, job.user_id, personas_data)

            # Lead Persona Sets: eager freeze of raw JSON inside this same txn
            # (no-op for normal jobs). See src/lead_sets.py.
            from src import lead_sets
            lead_sets.capture_job_result(session, job.id, personas_data)

            from src.models import Conversation
            conv = session.get(Conversation, job.conversation_id)
            if conv:
                conv.last_message_at = datetime.now(timezone.utc)
                session.add(conv)

            if job.reservation_id:
                quota.commit_in_session(
                    session, job.reservation_id,
                    message_id=job.assistant_message_id,
                )

            if not jobs.transition_in_session(
                session, job.id, jobs.STATE_SUCCEEDED,
                expected_states=(jobs.STATE_PERSISTING,),
            ):
                logger.error("[think_hard] job %s CAS failed on success", job.id)
                session.rollback()
                return False

            jobs.emit_event(session, job.id, "terminal", {
                "state": jobs.STATE_SUCCEEDED,
                "error_code": None,
                "assistant_message_id": job.assistant_message_id,
                "persona_count": len(personas_data),
            })

            session.commit()
        return True

    except Exception as e:
        logger.error("[think_hard] final txn failed for job %s: %s", job.id, e)
        jobs.fail_job(
            job.id, jobs.ERR_PERSISTENCE_FAILURE,
            error_detail=str(e),
            reservation_id=job.reservation_id,
        )
        return False


# ── Deadline check ────────────────────────────────────────────────────────────

def _deadline_expired(job: GenerationJob) -> bool:
    """Check if the job's deadline has passed."""
    now = datetime.now(timezone.utc)
    expires = jobs._utc(job.expires_at) or now
    return now > expires


def _classify_error(exc: Exception) -> tuple[str, str]:
    """Map an exception to (error_code, error_detail)."""
    if isinstance(exc, AllProvidersRateLimitedError):
        return jobs.ERR_PROVIDER_CAPACITY, str(exc)
    if isinstance(exc, SafetyBlockError):
        return jobs.ERR_SAFETY_BLOCK, str(exc)
    if isinstance(exc, UnsupportedAttachmentError):
        return jobs.ERR_UNSUPPORTED_ATTACHMENT, str(exc)
    if isinstance(exc, InvalidOutputError):
        return jobs.ERR_INVALID_OUTPUT, str(exc)
    return jobs.ERR_INTERNAL_ERROR, str(exc)


# ── Quick mode ────────────────────────────────────────────────────────────────

def _run_quick(job: GenerationJob, file_context: Optional[dict]) -> None:
    """Quick mode: single generate_personas call + save."""
    from src.generator import generate_personas

    _emit(job.id, "stage_started", {"stage": "generate", "mode": "quick"})
    try:
        fc = None
        if file_context:
            fc = {
                "file_type": file_context.get("mime_type", ""),
                "gemini_file_uri": file_context.get("gemini_uri"),
                "extracted_text": file_context.get("extracted_text"),
                "degraded_mode": False,
            }
        persona_data = generate_personas(job.input_text, file_context=fc)
        if not persona_data.get("personas"):
            jobs.fail_job(job.id, jobs.ERR_INVALID_OUTPUT,
                          "Quick generation returned no personas",
                          reservation_id=job.reservation_id)
            return
        _emit(job.id, "stage_completed", {"stage": "generate", "mode": "quick"})
        _final_transaction(job, persona_data["personas"])
    except Exception as e:
        code, detail = _classify_error(e)
        logger.error("[think_hard] quick job %s failed: %s", job.id, e)
        jobs.fail_job(job.id, code, detail, reservation_id=job.reservation_id)


# ── Think Hard mode ───────────────────────────────────────────────────────────

def _run_think_hard(job: GenerationJob, file_context: Optional[dict]) -> None:
    """Think Hard: draft -> judge -> critique -> revise pipeline."""
    # ── Stage 1: Draft (x3 parallel) ──
    _emit(job.id, "stage_started", {"stage": "draft", "count": len(DRAFT_ANGLE_SUFFIXES)})

    drafts: list[dict] = []
    draft_errors: list[str] = []

    with ThreadPoolExecutor(max_workers=min(DRAFT_PARALLELISM, len(DRAFT_ANGLE_SUFFIXES))) as pool:
        futures = {
            pool.submit(
                _run_draft, job.input_text, file_context, suffix, idx
            ): idx
            for idx, suffix in enumerate(DRAFT_ANGLE_SUFFIXES)
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                draft = future.result(timeout=jobs.STAGE_DEADLINE_S)
                drafts.append(draft)
                _emit(job.id, "stage_completed", {
                    "stage": "draft", "angle_index": idx,
                    "drafts_so_far": len(drafts),
                })
            except Exception as e:
                draft_errors.append(f"angle {idx}: {e}")
                _emit_soft_failure(job.id, "draft", e, angle_index=idx)

    if len(drafts) < 2:
        code = jobs.ERR_INSUFFICIENT_DRAFTS
        detail = f"Only {len(drafts)} valid drafts (need >= 2). Errors: {'; '.join(draft_errors)}"
        jobs.fail_job(job.id, code, detail, reservation_id=job.reservation_id)
        return

    if _deadline_expired(job):
        jobs.timeout_job(job.id, job.reservation_id)
        return

    # ── Stage 2: Judge ──
    _emit(job.id, "stage_started", {"stage": "judge"})
    winner: dict
    try:
        judge_result = _run_judge(drafts)
        winner_idx = judge_result["winner_index"]
        winner = drafts[winner_idx]
        _emit(job.id, "stage_completed", {
            "stage": "judge", "winner_index": winner_idx,
            "reasoning": judge_result.get("reasoning", ""),
        })
    except Exception as e:
        # Soft-fail: use the first draft
        winner = drafts[0]
        _emit_soft_failure(job.id, "judge", e, fallback="using first draft")

    if _deadline_expired(job):
        jobs.timeout_job(job.id, job.reservation_id)
        return

    # ── Stage 3: Critique ──
    _emit(job.id, "stage_started", {"stage": "critique"})
    critique: Optional[dict] = None
    try:
        critique = _run_critique(winner)
        _emit(job.id, "stage_completed", {
            "stage": "critique",
            "issue_count": len(critique.get("issues", [])),
        })
    except Exception as e:
        _emit_soft_failure(job.id, "critique", e, fallback="skipping revision")

    if _deadline_expired(job):
        jobs.timeout_job(job.id, job.reservation_id)
        return

    # ── Stage 4: Revise ──
    final_personas = winner
    if critique:
        _emit(job.id, "stage_started", {"stage": "revise"})
        try:
            revised = _run_revise(winner, critique)
            final_personas = revised
            _emit(job.id, "stage_completed", {"stage": "revise"})
        except Exception as e:
            _emit_soft_failure(job.id, "revise", e, fallback="using pre-revision winner")

    # ── Final transaction ──
    _final_transaction(job, final_personas.get("personas", []))


# ── Main entry point ──────────────────────────────────────────────────────────

def run_job(job_id: str) -> None:
    """
    Entry point called by the worker.  Dispatches to quick or think_hard
    based on job.mode.  Handles all error paths with appropriate error codes.
    """
    job = jobs.get_job(job_id)
    if not job:
        logger.error("[think_hard] job %s not found", job_id)
        return

    # Double-check state (should be 'running' after claim)
    if job.state not in (jobs.STATE_RUNNING, jobs.STATE_QUEUED):
        logger.warning("[think_hard] job %s in state %s, skipping", job_id, job.state)
        return

    # Check deadline
    if _deadline_expired(job):
        jobs.timeout_job(job.id, job.reservation_id)
        return

    # Parse file snapshot
    file_context: Optional[dict] = None
    if job.file_snapshot:
        try:
            file_context = json.loads(job.file_snapshot)
        except (json.JSONDecodeError, TypeError):
            file_context = None

    _emit(job.id, "state_changed", {"state": jobs.STATE_RUNNING})

    try:
        if job.mode == "think_hard":
            _run_think_hard(job, file_context)
        else:
            _run_quick(job, file_context)
    except Exception as e:
        # Unhandled exception — force-fail the job
        code, detail = _classify_error(e)
        logger.error("[think_hard] unhandled error for job %s: %s", job_id, e, exc_info=True)
        jobs.fail_job(job.id, code, detail, reservation_id=job.reservation_id)


