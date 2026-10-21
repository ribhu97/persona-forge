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

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from src.database import get_session
from src.dependencies import get_current_user
from src.lead_sets import (
    LeadSetValidationError,
    create_for_marketing,
    get_public_view,
    maybe_claim,
)
from src.models import User


router = APIRouter(prefix="/lead-sets", tags=["lead-sets"])


def require_service_token(
    x_service_token: Optional[str] = Header(default=None),
) -> None:
    """Compare against env LEAD_SERVICE_TOKEN; fail-closed when unset."""
    expected = os.environ.get("LEAD_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Service token not configured")
    if not x_service_token or not py_secrets.compare_digest(x_service_token, expected):
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
async def view_lead_set(token: str):
    """Public read: the token is the capability. No auth, no expiry."""
    try:
        view = get_public_view(token)
    except LookupError:
        raise HTTPException(status_code=404, detail="Lead persona set not found")
    return view.dict()


@router.post("/{token}/claim")
async def claim_lead_set(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Explicit claim for an already-logged-in Lead. Idempotent per owner."""
    claimed = maybe_claim(session, user, token=token)
    if claimed:
        session.commit()
        return {"claimed": True,
                "conversation_id": claimed.conversation_id}
    # Nothing to claim: either already claimed (by this user or another)
    # or the token is unknown. Distinguish for the frontend redirect.
    from sqlmodel import select
    from src.models import LeadPersonaSet
    lead_set = session.exec(
        select(LeadPersonaSet).where(LeadPersonaSet.token == token)
    ).first()
    if lead_set and lead_set.state == "claimed" and lead_set.claimed_by_user_id == user.id:
        return {"claimed": True, "conversation_id": lead_set.claimed_conversation_id}
    if lead_set:
        raise HTTPException(status_code=409, detail="Already claimed by another user")
    raise HTTPException(status_code=404, detail="Lead persona set not found")
