from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import Annotated

from src.database import get_session
from src.models import (
    User, Persona, Demographics, Goal,
    Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria, ResearchAssumption
)
from src.schemas import PersonaUpdate, PersonaResponse
from src.dependencies import get_current_user

router = APIRouter(prefix="/personas", tags=["personas"])

@router.put("/{persona_id}", response_model=PersonaResponse)
async def update_persona(
    persona_id: int,
    data: PersonaUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
):
    persona = session.get(Persona, persona_id)
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=404, detail="Persona not found")

    # Update top-level fields
    update_data = data.model_dump(exclude_unset=True)
    
    # Exclude nested fields from direct update
    nested_fields = ["demographics", "goals", "frustrations", "behavioral_patterns", "influence_networks", "recruitment_criteria", "research_assumptions"]
    for key, value in update_data.items():
        if key not in nested_fields:
            setattr(persona, key, value)
            
    # Update demographics if provided
    if "demographics" in update_data and update_data["demographics"] is not None:
        if persona.demographics:
            for k, v in update_data["demographics"].items():
                if v is not None:
                    setattr(persona.demographics, k, v)
        else:
            demo = Demographics(
                persona_id=persona.id,
                **update_data["demographics"]
            )
            session.add(demo)
            
    # Generic function to replace list items
    def replace_items(ItemType, attr_name, items_list):
        if items_list is not None:
            # Delete old items
            statement = select(ItemType).where(ItemType.persona_id == persona_id)
            old_items = session.exec(statement).all()
            for old in old_items:
                session.delete(old)
                
            # Add new items
            for i, text in enumerate(items_list):
                new_item = ItemType(
                    persona_id=persona_id,
                    **{attr_name: text},
                    order_index=i
                )
                session.add(new_item)

    if "goals" in update_data:
        replace_items(Goal, "goal_text", update_data["goals"])
        
    if "frustrations" in update_data:
        replace_items(Frustration, "frustration_text", update_data["frustrations"])
        
    if "behavioral_patterns" in update_data:
        replace_items(BehavioralPattern, "pattern_text", update_data["behavioral_patterns"])
        
    if "influence_networks" in update_data:
        replace_items(InfluenceNetwork, "network_text", update_data["influence_networks"])
        
    if "recruitment_criteria" in update_data:
        replace_items(RecruitmentCriteria, "criteria_text", update_data["recruitment_criteria"])
        
    if "research_assumptions" in update_data:
        replace_items(ResearchAssumption, "assumption_text", update_data["research_assumptions"])
        
    session.add(persona)
    session.commit()
    session.refresh(persona)
    
    return persona
