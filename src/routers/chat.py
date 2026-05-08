from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
import json
from typing import Annotated, List
from datetime import datetime, timezone, timedelta

from src.database import get_session
from sqlalchemy.exc import OperationalError
from src.models import (
    User, Conversation, Message, Persona, Demographics, Goal,
    Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria, ResearchAssumption,
    UploadedFile,
)
from src.schemas import ConversationCreate, ConversationResponse, MessageCreate, MessageResponse, AttachmentInfo
from src.dependencies import get_current_user, effective_account_type
from src.generator import generate_personas, generate_chat_name
from src.exceptions import AllProvidersRateLimitedError
from src.file_utils import cleanup_gemini_file
from google.genai import errors as genai_errors
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


def resolve_file_context(file_id: str, user_id: int, session) -> dict:
    """
    Look up an UploadedFile by file_id and user_id, validate it is usable,
    and return a file_context dict for the generator.

    Raises HTTPException on: not found, wrong owner, expired, already used.
    """
    from datetime import datetime, timezone
    record = session.exec(
        select(UploadedFile).where(UploadedFile.file_id == file_id)
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="Uploaded file not found or already expired.")
    if record.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    now = datetime.now(timezone.utc)
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=410, detail="Uploaded file has expired. Please upload again.")
    if record.status != "ready":
        raise HTTPException(
            status_code=409,
            detail="This file has already been used or is not ready. Please upload again.",
        )

    return {
        "file_type": record.file_type,
        "gemini_file_uri": record.gemini_file_uri,
        "extracted_text": record.extracted_text,
        "degraded_mode": False,
        # Metadata for attachment recording
        "_record": record,
    }


def mark_file_used(record: UploadedFile, session) -> None:
    """Mark a file record as used and trigger best-effort Gemini cleanup."""
    record.status = "used"
    session.add(record)
    # Gemini cleanup happens after commit — best effort, outside transaction
    if record.gemini_file_uri:
        cleanup_gemini_file(record.gemini_file_uri)


def _get_ordered_text(items, text_attr: str) -> list:
    return [getattr(item, text_attr) for item in sorted(items, key=lambda x: x.order_index)]


def save_personas_to_db(session: Session, message_id: int, user_id: int, personas_data: list) -> None:
    """
    Stage persona rows into the session without committing.

    All adds and flushes are performed here so the caller can get persona IDs,
    but the transaction boundary (commit + rollback) is owned entirely by the
    caller. This prevents a double-commit bug where an inner commit would
    durably write personas even if the outer transaction later failed.
    """
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

    # Resolve optional file attachment
    file_context = None
    file_record = None
    if data.file_id:
        file_context = resolve_file_context(data.file_id, user.id, session)
        file_record = file_context.pop("_record")

    # Call generation API — do this BEFORE writing anything to the DB so a failed
    # generation doesn't consume the user's message quota.
    try:
        persona_data = generate_personas(
            data.content,
            generated_persona=generated_persona_str,
            file_context=file_context,
        )
    except AllProvidersRateLimitedError:
        raise HTTPException(
            status_code=503,
            detail="AT_CAPACITY: All AI providers are currently rate-limited. Please try again in a moment.",
        )
    except genai_errors.ClientError as e:
        print(f"Gemini client error {e.code} ({e.status}): {e.message}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")
    except Exception as e:
        print(f"Error calling generation API: {e}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")

    if not persona_data.get("personas"):
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty or invalid response. Your message was not counted. Please try again.",
        )

    degraded_mode = bool(file_context and file_context.get("degraded_mode"))
    warnings: list[str] = []
    if degraded_mode:
        ft = file_context.get("file_type", "file") if file_context else "file"
        warnings.append(
            f"File processed in text-extraction mode — complex layouts, tables, and images "
            f"in your {ft.upper()} may not be fully represented."
        )
        if ft in ("png", "jpg", "webp"):
            warnings.append("Image attachments are not supported with the current AI provider. The image was skipped.")

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
            attachment_filename=file_record.original_filename if file_record else None,
            attachment_file_type=file_record.file_type if file_record else None,
            attachment_degraded_mode=degraded_mode,
            attachment_truncated=file_record.truncated if file_record else False,
            attachment_char_count=file_record.extracted_char_count if file_record else None,
        )
        session.add(asst_msg)
        session.flush()

        save_personas_to_db(session, asst_msg.id, user.id, persona_data["personas"])

        if file_record:
            mark_file_used(file_record, session)

        conv.last_message_at = datetime.now(timezone.utc)
        session.add(conv)
        session.commit()
        session.refresh(asst_msg)

        # Attach runtime warnings to response (not persisted — use attachment fields for history)
        response = MessageResponse.model_validate(asst_msg)
        response.degraded_mode = degraded_mode
        response.warnings = warnings
        if file_record:
            response.attachment = AttachmentInfo(
                filename=file_record.original_filename,
                file_type=file_record.file_type,
                degraded_mode=degraded_mode,
                truncated=file_record.truncated,
                char_count=file_record.extracted_char_count,
            )
        return response
    except OperationalError:
        session.rollback()
        raise  # propagates to @app.exception_handler(OperationalError) → 503
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

    file_context = None
    file_record = None
    file_id = data.get("file_id")
    if file_id:
        file_context = resolve_file_context(file_id, user.id, session)
        file_record = file_context.pop("_record")

    # Call generation API before writing to DB — don't consume the thread slot on failure
    try:
        persona_data = generate_personas(text, file_context=file_context)
    except AllProvidersRateLimitedError:
        raise HTTPException(
            status_code=503,
            detail="AT_CAPACITY: All AI providers are currently rate-limited. Please try again in a moment.",
        )
    except genai_errors.ClientError as e:
        print(f"Gemini client error {e.code} ({e.status}): {e.message}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")
    except Exception as e:
        print(f"Error calling generation API: {e}")
        raise HTTPException(status_code=500, detail="Persona generation failed. Please try again.")

    if not persona_data.get("personas"):
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty or invalid response. Please try again.",
        )

    degraded_mode = bool(file_context and file_context.get("degraded_mode"))

    try:
        conv = Conversation(user_id=user.id, title=text[:50])
        session.add(conv)
        session.flush()

        user_msg = Message(conversation_id=conv.id, role="user", content=text)
        session.add(user_msg)
        session.flush()

        asst_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content="Generated personas",
            attachment_filename=file_record.original_filename if file_record else None,
            attachment_file_type=file_record.file_type if file_record else None,
            attachment_degraded_mode=degraded_mode,
            attachment_truncated=file_record.truncated if file_record else False,
            attachment_char_count=file_record.extracted_char_count if file_record else None,
        )
        session.add(asst_msg)
        session.flush()

        save_personas_to_db(session, asst_msg.id, user.id, persona_data["personas"])

        if file_record:
            mark_file_used(file_record, session)

        session.commit()
        return {"success": True, "data": {"personas": persona_data["personas"]}, "degraded_mode": degraded_mode}
    except OperationalError:
        session.rollback()
        raise  # propagates to @app.exception_handler(OperationalError) → 503
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
