from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
import json
from typing import Annotated, List
from datetime import datetime, timezone

from src.database import get_session
from src.models import (
    User, Conversation, Message, Persona, Demographics, Goal,
    Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria, ResearchAssumption,
    Payment
)
from src.schemas import ConversationCreate, ConversationResponse, MessageCreate, MessageResponse
from src.dependencies import get_current_user
from src.generator import generate_personas, generate_chat_name
from sqlalchemy import func
from datetime import timedelta

router = APIRouter(prefix="/conversations", tags=["chat"])

@router.post("/", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    # LIMIT CHECK: Threads per month
    # Free: 3, Plus: 20, Pro: Unlimited (9999)
    # Account types: 0=Free, 1=Plus, 2=Pro
    
    limit = 3
    if user.account_type == 1:
        limit = 20
    elif user.account_type >= 2:
        limit = 9999
        
    # Count conversations in current month
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # We need to filter by created_at >= start_of_month
    # Note: SQLModel might need specific syntax for datetime comparison depending on DB, but standard operators usually work
    # We'll fetch count using func.count
    statement = select(func.count(Conversation.id)).where(
        Conversation.user_id == user.id,
        Conversation.created_at >= start_of_month
    )
    count = session.exec(statement).one()
    
    if count >= limit:
        friendly_limit = "Unlimited" if limit > 100 else limit
        raise HTTPException(
            status_code=403, 
            detail=f"Monthly conversation limit reached ({count}/{friendly_limit}). Upgrade to create more."
        )

    # If a title (first message) is provided, generate a chat name
    if data.title:
        try:
            # Generate a short name based on the first message
            name_data = generate_chat_name(data.title)
            title = name_data.get("name", data.title[:50])
        except Exception as e:
            print(f"Error generating chat name: {e}")
            title = data.title[:50] # Fallback to first 50 chars
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
        
    # LIMIT CHECK: Messages per thread
    # Free: 3, Plus: 10, Pro: Unlimited
    msg_limit = 3
    if user.account_type == 1:
        msg_limit = 10
    elif user.account_type >= 2:
        msg_limit = 9999
        
    # Count user messages in this conversation
    statement = select(func.count(Message.id)).where(
        Message.conversation_id == conversation_id,
        Message.role == "user"
    )
    msg_count = session.exec(statement).one()
    
    if msg_count >= msg_limit:
        friendly_limit = "Unlimited" if msg_limit > 100 else msg_limit
        raise HTTPException(
            status_code=403,
            detail=f"Message limit for this thread reached ({msg_count}/{friendly_limit}). Upgrade to continue or start a new thread."
        )
        
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
        # Check for history to context
        # Find last assistant message with personas to use as context
        statement = select(Message).where(Message.conversation_id == conversation_id).where(Message.role == "assistant").order_by(Message.created_at.desc()).limit(1)
        last_assistant_msg = session.exec(statement).first()
        
        generated_persona_str = None
        if last_assistant_msg and last_assistant_msg.personas:
             # Serialize personas
             personas_list = []
             for p in last_assistant_msg.personas:
                 p_dict = {
                     "name": p.name,
                     "status": p.status,
                     "role": p.role,
                     "tech_comfort": p.tech_comfort,
                     "scenario_context": p.scenario_context,
                 }
                 if p.demographics:
                      p_dict["demographics"] = {
                          "age": p.demographics.age,
                          "location": p.demographics.location,
                          "education": p.demographics.education,
                          "industry": p.demographics.industry,
                      }
                 # Lists
                 p_dict["goals"] = sorted([g.goal_text for g in p.goals]) # Order might matter but usually list is enough
                 # Actually goals has order_index, we should respect that if possible, but simplistic list is likely fine for LLM context
                 # Let's try to be precise if we can, but accessing relationships directly gives list.
                 # To be fast, simple list comprehension is fine as models usually load in DB order or we can sort by ID.
                 # But wait, we have order_index in models.
                 # Let's simple sort by order_index if possible, or just default list. 
                 # The relationship `p.goals` is a list. SQLModel doesn't automatically sort by default unless configured.
                 # Let's just take the text, the LLM is robust enough.
                 
                 # Helper to extract ordered text
                 def get_ordered_text(items, text_attr):
                     # Sort by order_index if present/loaded, else roughly order
                     return [getattr(item, text_attr) for item in sorted(items, key=lambda x: x.order_index)]

                 p_dict["goals"] = get_ordered_text(p.goals, "goal_text")
                 p_dict["frustrations"] = get_ordered_text(p.frustrations, "frustration_text")
                 p_dict["behavioral_patterns"] = get_ordered_text(p.behavioral_patterns, "pattern_text")
                 p_dict["influence_networks"] = get_ordered_text(p.influence_networks, "network_text")
                 p_dict["recruitment_criteria"] = get_ordered_text(p.recruitment_criteria, "criteria_text")
                 p_dict["research_assumptions"] = get_ordered_text(p.research_assumptions, "assumption_text")
                 
                 personas_list.append(p_dict)
             
             if personas_list:
                generated_persona_str = json.dumps({"personas": personas_list})

        # Call the generator
        persona_data = generate_personas(data.content, generated_persona=generated_persona_str)
        
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
        conv.last_message_at = datetime.now(timezone.utc)
        session.add(conv)
        session.commit()
        
        session.refresh(asst_msg)
        return asst_msg
        
    except Exception as e:
        print(f"Error generating personas: {e}")
        # Even if generation fails, we might want to return the user message or an error message.
        # But here we raise 500.
        raise HTTPException(status_code=500, detail=f"Error generating personas: {str(e)}")

@router.post("/generate-personas")
async def generate_personas_api(
    data: dict,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # LIMIT CHECK: Threads per month (Check again here since this creates a conversation)
    limit = 3
    if user.account_type == 1:
        limit = 20
    elif user.account_type >= 2:
        limit = 9999
        
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    statement = select(func.count(Conversation.id)).where(
        Conversation.user_id == user.id,
        Conversation.created_at >= start_of_month
    )
    count = session.exec(statement).one()
    
    if count >= limit:
        friendly_limit = "Unlimited" if limit > 100 else limit
        raise HTTPException(
            status_code=403, 
            detail=f"Monthly conversation limit reached ({count}/{friendly_limit}). Upgrade to create more."
        )

    # Create conversation
    conv = Conversation(user_id=user.id, title=text[:50])
    session.add(conv)
    session.commit()
    session.refresh(conv)

    # Save user message
    user_msg = Message(conversation_id=conv.id, role="user", content=text)
    session.add(user_msg)
    session.commit()

    try:
        # Generate
        persona_data = generate_personas(text)

        # Save assistant message
        asst_msg = Message(conversation_id=conv.id, role="assistant", content="Generated personas")
        session.add(asst_msg)
        session.commit()
        session.refresh(asst_msg)

        # Save personas
        saved_personas = []
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
            saved_personas.append(p_data)

        return {"success": True, "data": {"personas": saved_personas}}

    except Exception as e:
        print(f"Error generating personas: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating personas: {str(e)}")

@router.post("/generate-chat-name")
async def generate_chat_name_api(
    data: dict,
):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        # Generate
        chat_name = generate_chat_name(text)["name"]

        return {"success": True, "data": {"chat_name": chat_name}}

    except Exception as e:
        print(f"Error generating chat name: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating chat name: {str(e)}")

@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    session.delete(conv)
    session.commit()
    return {"message": "Conversation deleted"}