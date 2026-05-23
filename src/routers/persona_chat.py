import json
from datetime import datetime, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from src.database import get_session
from src.models import Persona, PersonaChatSession, PersonaChatMessage
from src.schemas import (
    PersonaChatRequest, PersonaChatResponse, PersonaChatMessageResponse,
    PersonaChatFeedbackRequest, PersonaChatTagsRequest,
    PERSONA_CHAT_MOODS,
)
from src.dependencies import get_current_user, effective_account_type
from src.generator import generate_persona_chat_response
from src.exceptions import AllProvidersRateLimitedError
from src.models import User

router = APIRouter(prefix="/persona-chat", tags=["persona-chat"])

# Monthly message limits per account type
_RATE_LIMITS = {0: 20, 1: 100}  # Free=20, Plus=100, Pro/Admin=unlimited


def _load_persona_profile(persona: Persona) -> dict:
    """Build a flat profile dict suitable for the system prompt."""
    demo = persona.demographics
    return {
        "name": persona.name,
        "role": persona.role,
        "tech_comfort": persona.tech_comfort,
        "scenario_context": persona.scenario_context or "",
        "demographics": {
            "age": demo.age if demo else "",
            "location": demo.location if demo else "",
            "education": demo.education if demo else "",
            "industry": demo.industry if demo else "",
        },
        "goals": [g.goal_text for g in sorted(persona.goals, key=lambda x: x.order_index)],
        "frustrations": [f.frustration_text for f in sorted(persona.frustrations, key=lambda x: x.order_index)],
        "behavioral_patterns": [b.pattern_text for b in sorted(persona.behavioral_patterns, key=lambda x: x.order_index)],
        "influence_networks": [n.network_text for n in sorted(persona.influence_networks, key=lambda x: x.order_index)],
    }


def _find_or_create_session(user_id: int, persona_id: int, session: Session) -> PersonaChatSession:
    """Return the existing session for (user_id, persona_id) or create a new one."""
    stmt = select(PersonaChatSession).where(
        PersonaChatSession.user_id == user_id,
        PersonaChatSession.persona_id == persona_id,
    )
    existing = session.exec(stmt).first()
    if existing:
        return existing

    chat_session = PersonaChatSession(user_id=user_id, persona_id=persona_id)
    session.add(chat_session)
    try:
        session.flush()
        return chat_session
    except IntegrityError:
        session.rollback()
        # Another request beat us to it — re-select the winner
        existing = session.exec(stmt).first()
        if existing:
            return existing
        raise


def _check_rate_limit(user: User, session: Session):
    """Raise 403 if the user has hit their monthly persona-chat message limit."""
    acct = effective_account_type(user)
    if acct not in _RATE_LIMITS:
        return  # Pro / Admin — unlimited

    limit = _RATE_LIMITS[acct]
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    stmt = (
        select(PersonaChatMessage)
        .join(PersonaChatSession, PersonaChatMessage.session_id == PersonaChatSession.id)
        .where(
            PersonaChatSession.user_id == user.id,
            PersonaChatMessage.role == "user",
            PersonaChatMessage.created_at >= start_of_month,
        )
    )
    count = len(session.exec(stmt).all())
    if count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"MONTHLY_LIMIT: You have used all {limit} persona chat messages for this month.",
        )


@router.post("/{persona_id}/send", response_model=PersonaChatResponse)
async def send_persona_chat_message(
    persona_id: int,
    data: PersonaChatRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    # Ownership check
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    _check_rate_limit(user, session)

    chat_session = _find_or_create_session(user.id, persona_id, session)

    # Load the 20 most-recent messages, then reverse to chronological order
    stmt = (
        select(PersonaChatMessage)
        .where(PersonaChatMessage.session_id == chat_session.id)
        .order_by(PersonaChatMessage.created_at.desc())
        .limit(20)
    )
    history_rows = list(reversed(session.exec(stmt).all()))
    message_history = [{"role": m.role, "content": m.content} for m in history_rows]

    persona_profile = _load_persona_profile(persona)

    # Call AI — failure raises before any DB writes
    try:
        result = generate_persona_chat_response(persona_profile, message_history, data.message)
    except AllProvidersRateLimitedError:
        raise HTTPException(
            status_code=503,
            detail="AT_CAPACITY: We are currently at capacity. Please try again in a moment.",
        )
    except Exception as e:
        print(f"[persona_chat] generation error: {e}")
        raise HTTPException(status_code=500, detail="An error occurred generating the response.")

    mood = result.get("mood", "neutral")
    if mood not in PERSONA_CHAT_MOODS:
        mood = "neutral"

    trait = result.get("trait")
    trait_source_type = None
    trait_text = None
    trait_source_index = None
    if isinstance(trait, dict):
        trait_source_type = trait.get("source_type")
        trait_text = trait.get("text")
        trait_source_index = trait.get("source_index", 0)

    # Persist user message + persona response
    user_msg = PersonaChatMessage(
        session_id=chat_session.id,
        role="user",
        content=data.message,
    )
    session.add(user_msg)

    persona_msg = PersonaChatMessage(
        session_id=chat_session.id,
        role="persona",
        content=result["content"],
        mood=mood,
        trait_source_type=trait_source_type,
        trait_text=trait_text,
        trait_source_index=trait_source_index,
    )
    session.add(persona_msg)

    chat_session.last_message_at = datetime.now(timezone.utc)
    session.add(chat_session)
    session.commit()
    session.refresh(persona_msg)

    return PersonaChatResponse(
        message_id=persona_msg.id,
        content=persona_msg.content,
        mood=persona_msg.mood,
        trait=PersonaChatMessageResponse.model_validate(persona_msg).trait,
    )


@router.get("/{persona_id}/messages", response_model=List[PersonaChatMessageResponse])
async def get_persona_chat_messages(
    persona_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    stmt = select(PersonaChatSession).where(
        PersonaChatSession.user_id == user.id,
        PersonaChatSession.persona_id == persona_id,
    )
    chat_session = session.exec(stmt).first()
    if not chat_session:
        return []

    msg_stmt = (
        select(PersonaChatMessage)
        .where(PersonaChatMessage.session_id == chat_session.id)
        .order_by(PersonaChatMessage.created_at.asc())
    )
    messages = session.exec(msg_stmt).all()
    return [PersonaChatMessageResponse.model_validate(m) for m in messages]


@router.post("/{persona_id}/feedback")
async def set_persona_chat_feedback(
    persona_id: int,
    data: PersonaChatFeedbackRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    msg = session.get(PersonaChatMessage, data.message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Verify ownership via session
    chat_session = session.get(PersonaChatSession, msg.session_id)
    if not chat_session or chat_session.user_id != user.id or chat_session.persona_id != persona_id:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.feedback = data.rating  # None clears the rating
    session.add(msg)
    session.commit()
    return {"success": True}


@router.post("/{persona_id}/message/{message_id}/tags", response_model=PersonaChatMessageResponse)
async def set_persona_chat_tags(
    persona_id: int,
    message_id: int,
    data: PersonaChatTagsRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    msg = session.get(PersonaChatMessage, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    chat_session = session.get(PersonaChatSession, msg.session_id)
    if not chat_session or chat_session.user_id != user.id or chat_session.persona_id != persona_id:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.tags = json.dumps(data.tags)
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return PersonaChatMessageResponse.model_validate(msg)


@router.delete("/{persona_id}/session")
async def clear_persona_chat_session(
    persona_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    stmt = select(PersonaChatSession).where(
        PersonaChatSession.user_id == user.id,
        PersonaChatSession.persona_id == persona_id,
    )
    chat_session = session.exec(stmt).first()
    if chat_session:
        # Manual delete for belt-and-suspenders (don't rely solely on CASCADE)
        msg_stmt = select(PersonaChatMessage).where(
            PersonaChatMessage.session_id == chat_session.id
        )
        for m in session.exec(msg_stmt).all():
            session.delete(m)
        session.delete(chat_session)
        session.commit()

    return {"success": True}
