"""Lead Persona Set module — the Lead lifecycle end-to-end.

Domain terms per CONTEXT.md: a Lead Persona Set is an ownerless set of
personas generated for a Lead before signup, reachable only through an
unguessable token link. Claiming converts it one-way into the claimer's
first Conversation.

Interface (four verbs). Transaction ownership differs per verb and is stated
on each: `create_for_marketing` commits (the set row must be durable before
create_job's own transaction); `get_public_view` opens its own read-only
session; `maybe_claim` and `capture_job_result` only stage — the caller commits.
  - create_for_marketing: enqueue think-hard generation under the ghost
    admin user; mint the token link.
  - get_public_view: the complete view model (full / blurred / generating /
    failed) — the router's return value.
  - maybe_claim: fire the Claim from an auth handler (or the explicit claim
    endpoint). Token-first, email fallback, CAS-guarded, one set per call.
    Returns None when there is nothing to claim.
  - capture_job_result: eager freeze of the raw persona JSON inside the
    job's final transaction. Returns False for a normal job (the caller
    persists its persona rows) and True when the job belongs to a lead set.

State machine (one-way): generating -> ready -> claimed
                                   -> failed
"""

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import update
from sqlmodel import Session, select

from . import jobs
from .database import engine
from .models import Conversation, GenerationJob, LeadPersonaSet, Message, User
from .persona_persistence import save_personas

logger = logging.getLogger(__name__)

GHOST_USER_EMAIL = "leads@persona-forge.internal"
PRODUCT_DESCRIPTION_MAX_CHARS = 20_000
# A link is only worth minting if the description can produce personas at all:
# the provider answers a meaningless input ("test") with an empty persona array,
# which fails the job ~1s later and leaves a dead link in the lead's inbox.
PRODUCT_DESCRIPTION_MIN_CHARS = 20

# A 'generating' set whose job was never linked is provably orphaned after this
# long — the reconcile sweep flips it to 'failed'. See reconcile_stuck_sets.
RECONCILE_GRACE_SECONDS = 300

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


class _ClaimRaceLost(Exception):
    """Internal: the CAS found the set is no longer 'ready'."""


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


def _link_job(session: Session, lead_set_id: int, job_id: str) -> None:
    """
    Link a lead set to its job from inside the job's own transaction.

    Called through jobs.create_job(on_created=...), so it must not touch the
    caller's ORM instance — that object belongs to a different session. A Core
    UPDATE on ids is the only safe way in.
    """
    session.execute(
        update(LeadPersonaSet)
        .where(LeadPersonaSet.id == lead_set_id)
        .values(job_id=job_id)
    )


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
    if len(description) < PRODUCT_DESCRIPTION_MIN_CHARS:
        raise LeadSetValidationError(
            f"product_description must be at least {PRODUCT_DESCRIPTION_MIN_CHARS} "
            "characters — say what the product does and who it is for"
        )
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
    lead_set_id = lead_set.id

    # create_job opens and commits its own transaction (messages + job +
    # quota), so the job_id link rides *that* transaction via on_created. A
    # worker can otherwise claim the job and finish it before a second, later
    # commit could link it — the freeze hook would then never find the set.
    # On failure nothing may be left behind: the set row and the ghost
    # conversation are already durable.
    try:
        jobs.create_job(
            ghost.id, conv.id,
            mode="think_hard",
            input_text=description,
            idempotency_key=f"lead-set-{lead_set_id}",
            account_type=99,
            on_created=lambda job_session, created: _link_job(
                job_session, lead_set_id, created.id
            ),
        )
    except Exception:
        session.delete(lead_set)
        session.delete(conv)
        session.commit()
        logger.exception("[lead_sets] create_for_marketing failed; rolled back set %s", lead_set_id)
        raise

    # The job's transaction already wrote job_id. Drop the caller's stale
    # in-memory copy (job_id=None) so a later flush cannot write NULL back.
    session.expire(lead_set)
    session.refresh(lead_set)
    return lead_set


# ── Verb 2: public read ──────────────────────────────────────────────────────

def _load_personas(raw: Optional[str]) -> Optional[list]:
    """
    Parse the frozen persona JSON. Returns None when the payload is missing,
    corrupt or not a list — callers treat that as "no usable personas" rather
    than letting a JSONDecodeError reach a public endpoint.
    """
    try:
        data = json.loads(raw or "[]")
    except (ValueError, TypeError):
        logger.error("[lead_sets] unparseable raw_personas payload")
        return None
    if not isinstance(data, list):
        logger.error("[lead_sets] raw_personas is not a list")
        return None
    return data


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
            personas = _load_personas(lead_set.raw_personas)
            if personas is None:
                # Frozen payload is unusable: report the terminal state rather
                # than serving a 500 or an empty-but-ready page.
                return LeadSetView(state=STATE_FAILED, product_description=None,
                                   personas=None, persona_count=0)
            return LeadSetView(
                state=STATE_READY,
                product_description=lead_set.product_description,
                personas=personas,
                persona_count=len(personas),
            )

        if lead_set.state == STATE_CLAIMED:
            # Fully blurred: only the count leaks, never the content.
            personas = _load_personas(lead_set.raw_personas) or []
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

    Match order: explicit token first, then email fallback — the *newest*
    ready unclaimed set addressed to the claimer's email. One claim per call:
    an older set stays ready and claims on a later login.

    Claim transaction (caller commits): new Conversation owned by the
    claimer, user message = the frozen product description, assistant
    message = persona summary, persona rows via the shared persistence
    module, then a CAS UPDATE ... WHERE state='ready' inside a SAVEPOINT — a
    lost race returns None with the caller's transaction intact.
    """
    match: Optional[LeadPersonaSet] = None
    if token:
        m = session.exec(
            select(LeadPersonaSet).where(LeadPersonaSet.token == token)
        ).first()
        if m and m.state == STATE_READY:
            match = m
        elif m and m.state == STATE_CLAIMED and m.claimed_by_user_id == user.id:
            # Idempotent re-login: already theirs — point back at the conversation.
            return ClaimOutcome(m.claimed_conversation_id, m.token)

    if match is None and user.email:
        match = session.exec(
            select(LeadPersonaSet)
            .where(LeadPersonaSet.lead_email == user.email.strip().lower())
            .where(LeadPersonaSet.state == STATE_READY)
            .order_by(LeadPersonaSet.created_at.desc())
            .limit(1)
        ).first()

    if match is None:
        return None
    return _claim_one(session, user, match)


def _claim_one(session: Session, user: User, lead_set: LeadPersonaSet) -> Optional[ClaimOutcome]:
    """
    Claim a single set: build the Conversation, seed messages, CAS the row.

    Runs inside a SAVEPOINT so a lost CAS discards only this claim — a plain
    session.rollback() here would also throw away whatever else the caller
    staged in its transaction. Claims are deliberately exempt from
    check_conversation_limit: the conversation is pre-paid by marketing.
    """
    personas_data = _load_personas(lead_set.raw_personas)
    if personas_data is None:
        logger.error("[lead_sets] set %s has unusable personas; not claimable", lead_set.id)
        return None

    try:
        with session.begin_nested():
            outcome = _build_claim(session, user, lead_set, personas_data)
    except _ClaimRaceLost:
        logger.info("[lead_sets] CAS lost for set %s — savepoint rolled back", lead_set.id)
        return None
    return outcome


def _build_claim(session: Session, user: User, lead_set: LeadPersonaSet,
                 personas_data: list) -> ClaimOutcome:
    """Stage the claimed Conversation + messages + personas, then CAS the row."""
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

    # CAS: only one claimer can flip ready->claimed.
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
        raise _ClaimRaceLost

    return ClaimOutcome(conv.id, lead_set.token)


# ── Verb 4: generation capture hook ─────────────────────────────────────────

def _personas_are_well_formed(personas_data: list) -> bool:
    """
    The keys save_personas indexes without a default. Freezing anything else
    would turn a bad generator payload into a 500 at claim time, so it is
    rejected here — where the data is produced.
    """
    required = ("name", "status", "role", "tech_comfort")
    if not isinstance(personas_data, list) or not personas_data:
        return False
    return all(
        isinstance(p, dict) and all(k in p for k in required)
        for p in personas_data
    )


def capture_job_result(
    session: Session,
    job_id: str,
    personas_data: list,
) -> bool:
    """
    Eager freeze inside the job's final transaction: write raw_personas and
    flip state to 'ready', staged in the caller's session (caller owns the
    transaction boundary).

    Returns False when the job is a normal one — the caller must then persist
    the persona rows itself. Returns True when the job belongs to a lead set:
    the frozen JSON is the single source of truth, so the caller persists
    nothing (the claim writes the one real copy into the claimer's
    conversation).

    A payload missing save_personas' required keys is never frozen; the set
    goes straight to 'failed'.
    """
    lead_set = session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.job_id == job_id)
    ).first()
    if not lead_set:
        return False

    if lead_set.state == STATE_GENERATING:
        if not _personas_are_well_formed(personas_data):
            logger.error(
                "[lead_sets] job %s produced personas missing required keys; failing set %s",
                job_id, lead_set.id,
            )
            lead_set.state = STATE_FAILED
        else:
            lead_set.raw_personas = json.dumps(personas_data)
            lead_set.state = STATE_READY
            lead_set.ready_at = datetime.now(timezone.utc)
        session.add(lead_set)

    return True


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


def reconcile_stuck_sets(session: Session) -> int:
    """
    Backstop for sets no hook can resolve. Flips a 'generating' set to
    'failed' when:

      - its job was never linked (job_id IS NULL) and it is older than
        RECONCILE_GRACE_SECONDS — create_for_marketing failed after the set
        row became durable, or its cleanup failed too; or
      - its linked job is already terminal while the set is still
        'generating' — a terminal transition that missed the hooks.

    Returns the number of sets failed. Caller commits.
    """
    stuck = list(session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.state == STATE_GENERATING)
    ).all())
    if not stuck:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=RECONCILE_GRACE_SECONDS)
    count = 0
    for lead_set in stuck:
        created = jobs._utc(lead_set.created_at)
        if lead_set.job_id is None:
            if created is None or created > cutoff:
                continue
        else:
            job = session.get(GenerationJob, lead_set.job_id)
            if job is not None and job.state not in jobs.TERMINAL_STATES:
                continue
            if job is None and (created is None or created > cutoff):
                continue
        logger.warning(
            "[lead_sets] reconciling stuck set %s (job %s) -> failed",
            lead_set.id, lead_set.job_id,
        )
        lead_set.state = STATE_FAILED
        session.add(lead_set)
        count += 1
    return count
