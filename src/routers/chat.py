from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
import json
from typing import Annotated, List
from datetime import datetime, timezone, timedelta

from src.database import get_session
from src.models import (
    User, Conversation, Message, Persona, Demographics, Goal,
    Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria, ResearchAssumption,
)
from src.schemas import ConversationCreate, ConversationResponse, MessageCreate, MessageResponse
from src.dependencies import get_current_user, effective_account_type
from src.generator import generate_personas, generate_chat_name
from sqlalchemy import func

router = APIRouter(prefix="/conversations", tags=["chat"])



def check_conversation_limit(user: User, session: Session):
    """Raise 403 if the user has hit their monthly conversation limit."""
    account_type = effective_account_type(user)
    limit = 3
    if account_type == 1:
        limit = 20
    elif account_type >= 2:
        limit = 9999

    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    count = session.exec(
        select(func.count(Conversation.id)).where(
            Conversation.user_id == user.id,
            Conversation.created_at >= start_of_month,
        )
    ).one()

    if count >= limit:
        friendly_limit = "Unlimited" if limit > 100 else limit
        raise HTTPException(
            status_code=403,
            detail=f"Monthly conversation limit reached ({count}/{friendly_limit}). Upgrade to create more.",
        )


def _get_ordered_text(items, text_attr: str) -> list:
    return [getattr(item, text_attr) for item in sorted(items, key=lambda x: x.order_index)]


def save_personas_to_db(session: Session, message_id: int, user_id: int, personas_data: list) -> None:
    """
    Persist a list of persona dicts (as returned by generate_personas) to the DB.
    All inserts are batched and committed in a single transaction; rolls back on any error.
    """
    try:
        for p_data in personas_data:
            persona = Persona(
                message_id=message_id,
                user_id=user_id,
                name=p_data["name"],
                status=p_data["status"],
                role=p_data["role"],
                tech_comfort=p_data["tech_comfort"],
                scenario_context=p_data.get("scenario_context", ""),
            )
            session.add(persona)
            session.flush()  # get persona.id without committing

            if "demographics" in p_data and isinstance(p_data["demographics"], dict):
                demo = p_data["demographics"]
                session.add(Demographics(
                    persona_id=persona.id,
                    age=str(demo.get("age")),
                    location=demo.get("location"),
                    education=demo.get("education"),
                    industry=demo.get("industry"),
                ))

            for i, text in enumerate(p_data.get("goals", [])):
                session.add(Goal(persona_id=persona.id, goal_text=text, order_index=i))

            for i, text in enumerate(p_data.get("frustrations", [])):
                session.add(Frustration(persona_id=persona.id, frustration_text=text, order_index=i))

            for i, text in enumerate(p_data.get("behavioral_patterns", [])):
                session.add(BehavioralPattern(persona_id=persona.id, pattern_text=text, order_index=i))

            for i, text in enumerate(p_data.get("influence_networks", [])):
                session.add(InfluenceNetwork(persona_id=persona.id, network_text=text, order_index=i))

            for i, text in enumerate(p_data.get("recruitment_criteria", [])):
                session.add(RecruitmentCriteria(persona_id=persona.id, criteria_text=text, order_index=i))

            for i, text in enumerate(p_data.get("research_assumptions", [])):
                session.add(ResearchAssumption(persona_id=persona.id, assumption_text=text, order_index=i))

        session.commit()
    except Exception:
        session.rollback()
        raise


@router.post("/", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    check_conversation_limit(user, session)

    if data.title:
        try:
            name_data = generate_chat_name(data.title)
            title = name_data.get("name", data.title[:50])
        except Exception as e:
            print(f"Error generating chat name: {e}")
            title = data.title[:50]
    else:
        title = "New Conversation"

    conv = Conversation(user_id=user.id, title=title)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv


@router.get("/", response_model=List[ConversationResponse])
async def list_conversations(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.last_message_at.desc())
    )
    return session.exec(stmt).all()


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv.messages


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: int,
    data: MessageCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # LIMIT CHECK: Messages per thread — Free: 3, Plus: 10, Pro: Unlimited
    account_type = effective_account_type(user)
    msg_limit = 3
    if account_type == 1:
        msg_limit = 10
    elif account_type >= 2:
        msg_limit = 9999

    msg_count = session.exec(
        select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id,
            Message.role == "user",
        )
    ).one()

    if msg_count >= msg_limit:
        friendly_limit = "Unlimited" if msg_limit > 100 else msg_limit
        raise HTTPException(
            status_code=403,
            detail=f"Message limit for this thread reached ({msg_count}/{friendly_limit}). Upgrade to continue or start a new thread.",
        )

    # Build context from the last assistant message (for follow-up refinement)
    generated_persona_str = None
    last_asst = session.exec(
        select(Message)
        .where(Message.conversation_id == conversation_id, Message.role == "assistant")
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()

    if last_asst and last_asst.personas:
        personas_list = []
        for p in last_asst.personas:
            p_dict = {
                "name": p.name,
                "status": p.status,
                "role": p.role,
                "tech_comfort": p.tech_comfort,
                "scenario_context": p.scenario_context,
                "goals": _get_ordered_text(p.goals, "goal_text"),
                "frustrations": _get_ordered_text(p.frustrations, "frustration_text"),
                "behavioral_patterns": _get_ordered_text(p.behavioral_patterns, "pattern_text"),
                "influence_networks": _get_ordered_text(p.influence_networks, "network_text"),
                "recruitment_criteria": _get_ordered_text(p.recruitment_criteria, "criteria_text"),
                "research_assumptions": _get_ordered_text(p.research_assumptions, "assumption_text"),
            }
            if p.demographics:
                p_dict["demographics"] = {
                    "age": p.demographics.age,
                    "location": p.demographics.location,
                    "education": p.demographics.education,
                    "industry": p.demographics.industry,
                }
            personas_list.append(p_dict)
        if personas_list:
            generated_persona_str = json.dumps({"personas": personas_list})

    # Call Gemini — do this BEFORE writing anything to the DB so a failed generation
    # doesn't consume the user's message quota.
    try:
        persona_data = generate_personas(data.content, generated_persona=generated_persona_str)
    except Exception as e:
        print(f"Error calling generation API: {e}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")

    if not persona_data.get("personas"):
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty or invalid response. Your message was not counted. Please try again.",
        )

    # Generation succeeded — now persist everything in one transaction
    try:
        user_msg = Message(conversation_id=conv.id, role="user", content=data.content)
        session.add(user_msg)
        session.flush()

        num_personas = len(persona_data["personas"])
        asst_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=f"Generated {num_personas} personas based on your request.",
        )
        session.add(asst_msg)
        session.flush()

        save_personas_to_db(session, asst_msg.id, user.id, persona_data["personas"])

        conv.last_message_at = datetime.now(timezone.utc)
        session.add(conv)
        session.commit()
        session.refresh(asst_msg)
        return asst_msg
    except Exception as e:
        session.rollback()
        print(f"Error persisting personas: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred while saving personas.")


@router.post("/generate-personas")
async def generate_personas_api(
    data: dict,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    check_conversation_limit(user, session)

    # Call Gemini before writing to DB — don't consume the thread slot on a failed generation
    try:
        persona_data = generate_personas(text)
    except Exception as e:
        print(f"Error calling generation API: {e}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")

    if not persona_data.get("personas"):
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty or invalid response. Please try again.",
        )

    try:
        conv = Conversation(user_id=user.id, title=text[:50])
        session.add(conv)
        session.flush()

        user_msg = Message(conversation_id=conv.id, role="user", content=text)
        session.add(user_msg)
        session.flush()

        asst_msg = Message(conversation_id=conv.id, role="assistant", content="Generated personas")
        session.add(asst_msg)
        session.flush()

        save_personas_to_db(session, asst_msg.id, user.id, persona_data["personas"])

        session.commit()
        return {"success": True, "data": {"personas": persona_data["personas"]}}
    except Exception as e:
        session.rollback()
        print(f"Error persisting personas: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred while saving personas.")


@router.post("/generate-chat-name")
async def generate_chat_name_api(
    data: dict,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        chat_name = generate_chat_name(text)["name"]
        return {"success": True, "data": {"chat_name": chat_name}}
    except Exception as e:
        print(f"Error generating chat name: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred while generating the chat name.")


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    session.delete(conv)
    session.commit()
    return {"message": "Conversation deleted"}
