"""
Quota reservation lifecycle for generation features.

Every generation (quick AND think_hard) reserves before model calls, commits on
success, and refunds on terminal failure.  Reservations live in
``quota_reservations`` and are counted per (user, feature, period_key).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select, text

from src.database import engine
from src.models import QuotaReservation


# ── Limits ────────────────────────────────────────────────────────────────────

# Monthly limits per (account_type, feature).  0 = not available (tier-gated).
QUOTA_LIMITS: dict[str, dict[int, int]] = {
    "quick": {0: 10, 1: 50, 2: 9999, 99: 9999},
    "think_hard": {0: 0, 1: 10, 2: 9999, 99: 9999},
}

RESERVATION_TTL_S = 15 * 60  # 15 min — orphaned reserved rows are swept after this


class QuotaExhausted(Exception):
    """Raised when the user has hit their monthly quota for a feature."""

    def __init__(self, feature: str, used: int, limit: int):
        self.feature = feature
        self.used = used
        self.limit = limit
        super().__init__(f"Quota exhausted for '{feature}': {used}/{limit} this month.")


class TierRequired(Exception):
    """Raised when a free-tier user tries to use a paid-only feature."""

    def __init__(self, feature: str = "think_hard"):
        self.feature = feature
        super().__init__(f"Tier required: '{feature}' is a paid-only feature.")


def _period_key(now: Optional[datetime] = None) -> str:
    """Return the UTC year-month period key, e.g. '2026-07'."""
    if now is None:
        now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def _quota_limit(account_type: int, feature: str) -> int:
    """Return the monthly limit for (account_type, feature)."""
    return QUOTA_LIMITS.get(feature, {}).get(account_type, 0)


def count_reservations(session: Session, user_id: int, feature: str, period_key: str) -> int:
    """Count active (reserved + committed) reservations for the period."""
    from sqlalchemy import func
    result = session.exec(
        select(func.count(QuotaReservation.id)).where(
            QuotaReservation.user_id == user_id,
            QuotaReservation.feature == feature,
            QuotaReservation.state.in_(["reserved", "committed"]),
            QuotaReservation.period_key == period_key,
        )
    ).one()
    return int(result)


def reserve(
    user_id: int,
    *,
    feature: str,
    account_type: int,
    weight: int = 1,
) -> QuotaReservation:
    """
    Reserve a quota slot for *feature*.

    Runs inside ``BEGIN IMMEDIATE`` so the count + insert is atomic.  Raises
    ``TierRequired`` if the feature is not available for the account tier, and
    ``QuotaExhausted`` if the monthly limit has been reached.

    Returns the newly-created ``QuotaReservation`` (state='reserved').
    """
    limit = _quota_limit(account_type, feature)
    if limit == 0:
        raise TierRequired(feature)

    pk = _period_key()
    reservation_id = uuid.uuid4().hex

    with Session(engine) as session:
        session.exec(text("BEGIN IMMEDIATE"))
        try:
            used = count_reservations(session, user_id, feature, pk)
            if used + weight > limit:
                raise QuotaExhausted(feature, used, limit)

            reservation = QuotaReservation(
                id=reservation_id,
                user_id=user_id,
                feature=feature,
                state="reserved",
                period_key=pk,
                weight=weight,
            )
            session.add(reservation)
            session.commit()
            session.refresh(reservation)
            return reservation
        except Exception:
            session.rollback()
            raise


def commit_in_session(session: Session, reservation_id: str, *, message_id: int) -> bool:
    """
    Stage a reservation commit (state: reserved -> committed) into the caller's
    session without committing — the caller owns the transaction boundary.

    Idempotent: if already committed, returns True.  CAS-guarded: only
    transitions from 'reserved'.  Returns False if refunded or not found.
    """
    res = session.get(QuotaReservation, reservation_id)
    if res is None:
        return False
    if res.state == "committed":
        return True
    if res.state != "reserved":
        return False

    res.state = "committed"
    res.committed_message_id = message_id
    res.updated_at = datetime.now(timezone.utc)
    session.add(res)
    return True


def commit(reservation_id: str, *, message_id: int) -> bool:
    """Commit a reservation in a standalone transaction.  See commit_in_session."""
    with Session(engine) as session:
        ok = commit_in_session(session, reservation_id, message_id=message_id)
        if ok:
            session.commit()
        return ok


def refund(reservation_id: Optional[str]) -> bool:
    """
    Refund a reservation (state: reserved -> refunded).

    Idempotent: if already refunded, returns True.  If committed, returns False.
    """
    if not reservation_id:
        return False

    with Session(engine) as session:
        res = session.get(QuotaReservation, reservation_id)
        if res is None:
            return False
        if res.state == "refunded":
            return True
        if res.state != "reserved":
            return False

        res.state = "refunded"
        res.updated_at = datetime.now(timezone.utc)
        session.add(res)
        session.commit()
        return True


def sweep_orphaned_reservations(session: Session) -> int:
    """
    Sweep reserved rows older than RESERVATION_TTL_S with no committed_message_id.

    Returns the number of rows refunded.
    """
    now = datetime.now(timezone.utc)
    cutoff_ts = now.timestamp() - RESERVATION_TTL_S

    stmt = select(QuotaReservation).where(
        QuotaReservation.state == "reserved",
        QuotaReservation.committed_message_id.is_(None),
    )
    orphaned = session.exec(stmt).all()

    count = 0
    for res in orphaned:
        created = res.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created.timestamp() < cutoff_ts:
            res.state = "refunded"
            res.updated_at = now
            session.add(res)
            count += 1

    if count:
        session.commit()
    return count
