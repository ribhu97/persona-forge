"""Lead Persona Set HTTP surface (thin adapters over src/lead_sets.py).

Three endpoints:
  - POST /api/lead-sets              (X-Service-Token) - marketing create
  - GET  /api/lead-sets/{token}      (public, no auth)  - the link view
  - POST /api/lead-sets/{token}/claim (JWT)              - explicit claim for
    an already-logged-in Lead

The service token is checked FIRST - before any user/quota machinery -
using secrets.compare_digest; fail-closed (503) if the env var is unset.
"""

import os
import secrets as py_secrets
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session, select

from src.database import get_session
from src.dependencies import get_current_user
from src.lead_sets import (
    STATE_CLAIMED,
    STATE_FAILED,
    STATE_GENERATING,
    LeadSetValidationError,
    create_for_marketing,
    get_public_view,
    maybe_claim,
)
from src.models import LeadPersonaSet, User


router = APIRouter(prefix="/lead-sets", tags=["lead-sets"])
limiter = Limiter(key_func=get_remote_address)


def require_service_token(
    x_service_token: Optional[str] = Header(default=None),
) -> None:
    """Compare against env LEAD_SERVICE_TOKEN; fail-closed when unset."""
    expected = os.environ.get("LEAD_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Service token not configured")
    # Encode first: compare_digest raises TypeError on non-ASCII str, which
    # would turn a hostile header into a 500 instead of a 401.
    if not x_service_token or not py_secrets.compare_digest(
        x_service_token.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid service token")



class LeadSetCreateRequest(BaseModel):
    product_description: str
    lead_email: Optional[str] = None
    channel: Optional[str] = None


class LeadSetCreatedResponse(BaseModel):
    token: str
    public_url: str

@router.post("", status_code=201, response_model=LeadSetCreatedResponse)
async def create_lead_set(
    data: LeadSetCreateRequest,
    _svc: Annotated[None, Depends(require_service_token)],
    session: Annotated[Session, Depends(get_session)],
):
    """Marketing create: one call -> generation job + public link."""
    try:
        lead_set = create_for_marketing(
            session,
            product_description=data.product_description,
            lead_email=data.lead_email,
            channel=data.channel,
        )
    except LeadSetValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return LeadSetCreatedResponse(
        token=lead_set.token,
        public_url=f"/p/{lead_set.token}",
    )


@router.get("/{token}")
@limiter.limit("60/minute")
async def view_lead_set(request: Request, token: str):
    """
    Public read: the token is the capability. No auth, no expiry.

    Rate-limited and uncacheable: the URL is a bearer capability, so it must
    never land in a shared or on-disk cache.
    """
    try:
        view = get_public_view(token)
    except LookupError:
        raise HTTPException(status_code=404, detail="Lead persona set not found")
    return JSONResponse(content=view.dict(), headers={"Cache-Control": "no-store"})


@router.post("/{token}/claim")
async def claim_lead_set(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """
    Explicit claim for an already-logged-in Lead. Idempotent per owner.

    Non-claimable states are distinguished so the client can render the right
    thing: 425 while generating, 410 when generation failed, 409 when someone
    else already claimed it.
    """
    claimed = maybe_claim(session, user, token=token)
    if claimed:
        session.commit()
        return {"claimed": True,
                "conversation_id": claimed.conversation_id}

    # Nothing claimed: either already claimed (by this user or another), or
    # not claimable yet. The row itself says which.
    lead_set = session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.token == token)
    ).first()
    if lead_set is None:
        raise HTTPException(status_code=404, detail={"state": None})
    if lead_set.state == STATE_CLAIMED and lead_set.claimed_by_user_id == user.id:
        # Lost the CAS to our own concurrent request: still ours.
        return {"claimed": True, "conversation_id": lead_set.claimed_conversation_id}
    if lead_set.state == STATE_GENERATING:
        raise HTTPException(status_code=425, detail={"state": STATE_GENERATING})
    if lead_set.state == STATE_FAILED:
        raise HTTPException(status_code=410, detail={"state": STATE_FAILED})
    # 'claimed' by another user, or 'ready' but unclaimable (unusable frozen
    # payload, or another request won the CAS).
    raise HTTPException(status_code=409, detail={"state": lead_set.state})
