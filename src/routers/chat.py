from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import Annotated, List
from datetime import datetime

from src.database import get_session
from src.models import (
    User, Conversation, Message, Persona, Demographics, Goal, 
    Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria, ResearchAssumption
)
from src.schemas import ConversationCreate, ConversationResponse, MessageCreate, MessageResponse
from src.dependencies import get_current_user
from src.generator import generate_personas

router = APIRouter(prefix="/conversations", tags=["chat"])

@router.post("/", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    title = data.title if data.title else "New Conversation"
    conv = Conversation(user_id=user.id, title=title)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv

@router.get("/", response_model=List[ConversationResponse])
async def list_conversations(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    return user.conversations

@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
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
    session: Annotated[Session, Depends(get_session)]
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # 1. Save User Message
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=data.content
    )
    session.add(user_msg)
    session.commit()
    
    # 2. Generate Personas
    try:
        # Call the generator
        persona_data = generate_personas(data.content)
        
        # 3. Save Assistant Message
        num_personas = len(persona_data.get("personas", []))
        assistant_content = f"Generated {num_personas} personas based on your request."
        
        asst_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=assistant_content
        )
        session.add(asst_msg)
        session.commit()
        session.refresh(asst_msg)
        
        # 4. Save Personas linked to Assistant Message
        for p_data in persona_data.get("personas", []):
            persona = Persona(
                message_id=asst_msg.id,
                user_id=user.id,
                name=p_data["name"],
                status=p_data["status"],
                role=p_data["role"],
                tech_comfort=p_data["tech_comfort"],
                scenario_context=p_data.get("scenario_context", "")
            )
            session.add(persona)
            session.commit()
            session.refresh(persona)
            
            # Save sub-tables
            if "demographics" in p_data and isinstance(p_data["demographics"], dict):
                demo = Demographics(
                    persona_id=persona.id,
                    age=str(p_data["demographics"].get("age")),
                    location=p_data["demographics"].get("location"),
                    education=p_data["demographics"].get("education"),
                    industry=p_data["demographics"].get("industry")
                )
                session.add(demo)
                
            for i, goal in enumerate(p_data.get("goals", [])):
                session.add(Goal(persona_id=persona.id, goal_text=goal, order_index=i))
                
            for i, frust in enumerate(p_data.get("frustrations", [])):
                session.add(Frustration(persona_id=persona.id, frustration_text=frust, order_index=i))
                
            for i, pat in enumerate(p_data.get("behavioral_patterns", [])):
                session.add(BehavioralPattern(persona_id=persona.id, pattern_text=pat, order_index=i))
                
            for i, net in enumerate(p_data.get("influence_networks", [])):
                session.add(InfluenceNetwork(persona_id=persona.id, network_text=net, order_index=i))
                
            for i, crit in enumerate(p_data.get("recruitment_criteria", [])):
                session.add(RecruitmentCriteria(persona_id=persona.id, criteria_text=crit, order_index=i))
                
            for i, assump in enumerate(p_data.get("research_assumptions", [])):
                session.add(ResearchAssumption(persona_id=persona.id, assumption_text=assump, order_index=i))
                
            session.commit()
            
        # Update conversation timestamp
        conv.last_message_at = datetime.utcnow()
        session.add(conv)
        session.commit()
        
        session.refresh(asst_msg)
        return asst_msg
        
    except Exception as e:
        print(f"Error generating personas: {e}")
        # Even if generation fails, we might want to return the user message or an error message.
        # But here we raise 500.
        raise HTTPException(status_code=500, detail=f"Error generating personas: {str(e)}")
