from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

# Auth Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class GoogleLogin(BaseModel):
    token: str

class Token(BaseModel):
    access_token: str
    token_type: str

# Chat Schemas
class ConversationCreate(BaseModel):
    title: Optional[str] = None

class MessageCreate(BaseModel):
    content: str

# Sub-item Schemas
class DemographicsResponse(BaseModel):
    age: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    industry: Optional[str] = None
    
    model_config = {"from_attributes": True}

class GoalResponse(BaseModel):
    goal_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class FrustrationResponse(BaseModel):
    frustration_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class BehavioralPatternResponse(BaseModel):
    pattern_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class InfluenceNetworkResponse(BaseModel):
    network_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class RecruitmentCriteriaResponse(BaseModel):
    criteria_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class ResearchAssumptionResponse(BaseModel):
    assumption_text: str
    order_index: int
    
    model_config = {"from_attributes": True}

class PersonaResponse(BaseModel):
    id: int
    name: str
    status: str
    role: str
    tech_comfort: str
    scenario_context: Optional[str]
    demographics: Optional[DemographicsResponse] = None
    goals: List[GoalResponse] = []
    frustrations: List[FrustrationResponse] = []
    behavioral_patterns: List[BehavioralPatternResponse] = []
    influence_networks: List[InfluenceNetworkResponse] = []
    recruitment_criteria: List[RecruitmentCriteriaResponse] = []
    research_assumptions: List[ResearchAssumptionResponse] = []
    
    model_config = {"from_attributes": True}

class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    personas: List[PersonaResponse] = []
    
    model_config = {"from_attributes": True}

class ConversationResponse(BaseModel):
    id: int
    title: Optional[str]
    last_message_at: datetime
    created_at: datetime

# Export Schemas
class ExportRequest(BaseModel):
    format: Literal["pdf", "json"]
    persona_ids: List[int] = Field(..., min_length=1)  # At least one persona required

class ExportStatusResponse(BaseModel):
    can_export: bool
    account_type: int  # 0=Free, 1=Admin, etc.
    exports_remaining: int  # For free users: 0 or 1
    last_export_at: Optional[datetime] = None
    next_export_available: Optional[datetime] = None  # When rate limit resets
