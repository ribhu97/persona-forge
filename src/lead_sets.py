"""Lead Persona Set module — the Lead lifecycle end-to-end.

Domain terms per CONTEXT.md: a Lead Persona Set is an ownerless set of
personas generated for a Lead before signup, reachable only through an
unguessable token link. Claiming converts it one-way into the claimer's
first Conversation.

Interface (four verbs, sessions passed in — caller owns the transaction):
  - create_for_marketing: enqueue think-hard generation under the ghost
    admin user; mint the token link.
  - get_public_view: the complete view model (full / blurred / generating /
    failed) — the router's return value.
  - maybe_claim: fire the Claim from an auth handler (or the explicit claim
    endpoint). Token-first, email fallback, CAS-guarded. Returns None when
    there is nothing to claim.
  - capture_job_result: eager freeze of the raw persona JSON inside the
    job's final transaction. No-op unless the job belongs to a lead set.

State machine (one-way): generating -> ready -> claimed
                                   -> failed
"""

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from . import jobs
from .database import engine
from .models import Conversation, LeadPersonaSet, Message, User
from .persona_persistence import save_personas

logger = logging.getLogger(__name__)

GHOST_USER_EMAIL = "leads@persona-forge.internal"
PRODUCT_DESCRIPTION_MAX_CHARS = 20_000

STATE_GENERATING = "generating"
STATE_READY = "ready"
STATE_CLAIMED = "claimed"
STATE_FAILED = "failed"

# View models returned directly by get_public_view.


class LeadSetView:
    """Complete response model for the public read. Built by get_public_view."""

    def __init__(self, state: str, product_description: Optional[str],
                 personas: Optional[list], persona_count: int,
                 sign_in_cta: bool = False):
        self.state = state
        self.product_description = product_description
        self.personas = personas
        self.persona_count = persona_count
        self.sign_in_cta = sign_in_cta

    def dict(self) -> dict:
        return {
            "state": self.state,
            "product_description": self.product_description,
            "personas": self.personas,
            "persona_count": self.persona_count,
            "sign_in_cta": self.sign_in_cta,
        }


class ClaimOutcome:
    def __init__(self, conversation_id: int, lead_token: str):
        self.conversation_id = conversation_id
        self.lead_token = lead_token


class LeadSetValidationError(ValueError):
    """Bad input to create_for_marketing (blank description, oversized input)."""


# ── Ghost admin user ──────────────────────────────────────────────────────────

def ensure_ghost_user(session: Session) -> User:
    """Lazily ensure the singleton ghost admin user that owns lead generation jobs."""
    ghost = session.exec(select(User).where(User.email == GHOST_USER_EMAIL)).first()
    if ghost:
        return ghost
    ghost = User(
        email=GHOST_USER_EMAIL,
        name="Lead Generation (system)",
        auth_provider="system",
        is_verified=True,
        account_type=99,  # admin — unlimited quota, think_hard allowed
    )
    session.add(ghost)
    session.flush()
    return ghost


# ── Verb 1: create (marketing) ────────────────────────────────────────────────

def create_for_marketing(
    session: Session,
    product_description: str,
    lead_email: Optional[str] = None,
    channel: Optional[str] = None,
) -> LeadPersonaSet:
    """
    Create a Lead Persona Set and enqueue think-hard generation.

    The set row is inserted before the job so capture_job_result can find it
    by job_id. Raises LeadSetValidationError on blank/oversized description.
    """
    description = (product_description or "").strip()
    if not description:
        raise LeadSetValidationError("product_description must not be blank")
    if len(description) > PRODUCT_DESCRIPTION_MAX_CHARS:
        raise LeadSetValidationError(
            f"product_description exceeds {PRODUCT_DESCRIPTION_MAX_CHARS} characters"
        )

    email = (lead_email or "").strip().lower() or None

    ghost = ensure_ghost_user(session)
    conv = Conversation(
        user_id=ghost.id,
        title=f"Lead generation — {email or 'unknown lead'}",
    )
    session.add(conv)
    session.flush()

    lead_set = LeadPersonaSet(
        token=secrets.token_urlsafe(24),
        lead_email=email,
        product_description=description,
        state=STATE_GENERATING,
        channel=channel,
    )
    session.add(lead_set)
    session.commit()  # durable before create_job — it commits its own txn

    # create_job opens and commits its own transaction (messages + job +
    # quota); the lead set must already be durable so its job_id link is
    # never orphaned by a rollback of the caller's session.
    job = jobs.create_job(
        ghost.id, conv.id,
        mode="think_hard",
        input_text=description,
        idempotency_key=f"lead-set-{lead_set.id}",
        account_type=99,
    )
    lead_set.job_id = job.id
    session.add(lead_set)
    session.commit()
    session.refresh(lead_set)
    return lead_set


# ── Verb 2: public read ──────────────────────────────────────────────────────

def get_public_view(token: str) -> LeadSetView:
    """
    Build the complete public view for a link token. Opens its own session
    (read-only); safe on the open web — the token is the capability.

    ready     -> full view: personas + product description
    claimed   -> blurred: persona_count only, sign-in CTA
    generating-> state only (frontend shows progress / polls)
    failed    -> state only (frontend shows error copy)
    """
    with Session(engine) as session:
        lead_set = session.exec(
            select(LeadPersonaSet).where(LeadPersonaSet.token == token)
        ).first()
        if not lead_set:
            raise LookupError("Lead persona set not found")

        if lead_set.state == STATE_READY:
            personas = json.loads(lead_set.raw_personas or "[]")
            return LeadSetView(
                state=STATE_READY,
                product_description=lead_set.product_description,
                personas=personas,
                persona_count=len(personas),
            )

        if lead_set.state == STATE_CLAIMED:
            # Fully blurred: only the count leaks, never the content.
            personas = json.loads(lead_set.raw_personas or "[]")
            return LeadSetView(
                state=STATE_CLAIMED,
                product_description=None,
                personas=None,
                persona_count=len(personas),
                sign_in_cta=True,
            )

        return LeadSetView(state=lead_set.state, product_description=None,
                           personas=None, persona_count=0)


# ── Verb 3: claim ────────────────────────────────────────────────────────────

def maybe_claim(
    session: Session,
    user: User,
    token: Optional[str] = None,
) -> Optional[ClaimOutcome]:
    """
    Fire the Claim for a lead, if one is pending. Never raises for "nothing
    to claim" — returns None.

    Match order: explicit token first, then email fallback (every ready
    unclaimed set addressed to the claimer's email, oldest first).

    Claim transaction (caller commits): new Conversation owned by the
    claimer, user message = the frozen product description, assistant
    message = persona summary, persona rows via the shared persistence
    module, then a CAS UPDATE ... WHERE state='ready' — a lost race returns
    None with nothing half-committed.
    """
    matches: list[LeadPersonaSet] = []
    if token:
        m = session.exec(
            select(LeadPersonaSet).where(LeadPersonaSet.token == token)
        ).first()
        if m and m.state == STATE_READY:
            matches = [m]
        elif m and m.state == STATE_CLAIMED and m.claimed_by_user_id == user.id:
            # Idempotent re-login: already theirs — point back at the conversation.
            return ClaimOutcome(m.claimed_conversation_id, m.token)

    if not matches and user.email:
        matches = list(session.exec(
            select(LeadPersonaSet)
            .where(LeadPersonaSet.lead_email == user.email.strip().lower())
            .where(LeadPersonaSet.state == STATE_READY)
            .order_by(LeadPersonaSet.created_at)
        ).all())

    outcome: Optional[ClaimOutcome] = None
    for lead_set in matches:
        result = _claim_one(session, user, lead_set)
        if result:
            outcome = result  # latest wins (mirrors chronological claim order)
    return outcome


def _claim_one(session: Session, user: User, lead_set: LeadPersonaSet) -> Optional[ClaimOutcome]:
    """Claim a single set: build the Conversation, seed messages, CAS the row."""
    personas_data = json.loads(lead_set.raw_personas or "[]")

    conv = Conversation(
        user_id=user.id,
        title="Your personas (from your link)",
    )
    session.add(conv)
    session.flush()

    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=lead_set.product_description,
    )
    session.add(user_msg)
    session.flush()

    asst_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=f"Generated {len(personas_data)} personas",
    )
    session.add(asst_msg)
    session.flush()

    save_personas(session, asst_msg.id, user.id, personas_data)

    conv.last_message_at = datetime.now(timezone.utc)
    session.add(conv)

    # CAS: only one claimer can flip generating->claimed->...
    from sqlalchemy import update
    result = session.execute(
        update(LeadPersonaSet)
        .where(LeadPersonaSet.id == lead_set.id)
        .where(LeadPersonaSet.state == STATE_READY)
        .values(
            state=STATE_CLAIMED,
            claimed_by_user_id=user.id,
            claimed_conversation_id=conv.id,
            claimed_at=datetime.now(timezone.utc),
        )
    )
    if result.rowcount == 0:
        logger.info("[lead_sets] CAS lost for set %d — rolling back", lead_set.id)
        session.rollback()
        return None

    return ClaimOutcome(conv.id, lead_set.token)


# ── Verb 4: generation capture hook ─────────────────────────────────────────

def capture_job_result(
    session: Session,
    job_id: str,
    personas_data: list,
) -> None:
    """
    Eager freeze inside the job's final transaction: write raw_personas and
    flip state to 'ready', staged in the caller's session (caller owns the
    transaction boundary). No-op unless the job belongs to a lead set.
    """
    lead_set = session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.job_id == job_id)
    ).first()
    if not lead_set or lead_set.state != STATE_GENERATING:
        return
    lead_set.raw_personas = json.dumps(personas_data)
    lead_set.state = STATE_READY
    lead_set.ready_at = datetime.now(timezone.utc)
    session.add(lead_set)


def mark_job_failed(session: Session, job_id: str) -> None:
    """
    Failure/timeout flip, staged in the caller's session. No-op unless the
    job belongs to a still-generating lead set.
    """
    lead_set = session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.job_id == job_id)
    ).first()
    if not lead_set or lead_set.state != STATE_GENERATING:
        return
    lead_set.state = STATE_FAILED
    session.add(lead_set)
