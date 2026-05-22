from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
import json

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

class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    auth_provider: str
    is_verified: bool
    account_type: int
    subscription_active: bool
    subscription_expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

# File Upload Schemas
class UploadedFileResponse(BaseModel):
    file_id: str
    filename: str
    file_type: str
    size: int
    status: str
    truncated: bool
    char_count: Optional[int] = None
    warnings: List[str] = []

class AttachmentInfo(BaseModel):
    filename: str
    file_type: str
    degraded_mode: bool = False
    truncated: bool = False
    char_count: Optional[int] = None

    model_config = {"from_attributes": True}

# Chat Schemas
class ConversationCreate(BaseModel):
    title: Optional[str] = None

class MessageCreate(BaseModel):
    content: str
    file_id: Optional[str] = None

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

class DemographicsUpdate(BaseModel):
    age: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    industry: Optional[str] = None

class PersonaUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    role: Optional[str] = None
    tech_comfort: Optional[str] = None
    scenario_context: Optional[str] = None
    demographics: Optional[DemographicsUpdate] = None
    goals: Optional[List[str]] = None
    frustrations: Optional[List[str]] = None
    behavioral_patterns: Optional[List[str]] = None
    influence_networks: Optional[List[str]] = None
    recruitment_criteria: Optional[List[str]] = None
    research_assumptions: Optional[List[str]] = None


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    personas: List[PersonaResponse] = []
    attachment: Optional[AttachmentInfo] = None
    degraded_mode: bool = False
    warnings: List[str] = []

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

# Blog Schemas
class BlogPostResponse(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    author: str
    read_time: str
    tags: List[str]  # Converted from comma-separated string
    content: str
    meta_title: str
    meta_description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class BlogPostSummary(BaseModel):
    """Lighter response for listing (excludes full content)."""
    id: int
    slug: str
    title: str
    description: str
    author: str
    read_time: str
    tags: List[str]
    meta_title: str
    meta_description: str
    created_at: datetime

    model_config = {"from_attributes": True}

class BlogListResponse(BaseModel):
    posts: List[BlogPostSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


# --- Persona Chat Schemas ---

PERSONA_CHAT_MOODS = [
    "deadpan", "thoughtful", "neutral", "matter-of-fact",
    "frustrated", "skeptical", "blunt", "dry",
    "curious", "driven", "enthused",
]

PERSONA_CHAT_TRAIT_SOURCE_TYPES = ["DEMOGRAPHICS", "SCENARIO_CONTEXT"]


class PersonaChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class TraitAttribution(BaseModel):
    source_type: str
    text: str
    source_index: int = 0


class PersonaChatResponse(BaseModel):
    message_id: int
    content: str
    mood: str
    trait: Optional[TraitAttribution] = None


class PersonaChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    mood: Optional[str] = None
    trait: Optional[TraitAttribution] = None
    feedback: Optional[str] = None
    tags: List[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode='before')
    @classmethod
    def normalize_fields(cls, data):
        if hasattr(data, '__dict__'):
            d = {k: v for k, v in data.__dict__.items() if not k.startswith('_')}
        else:
            d = dict(data)

        src_type = d.pop('trait_source_type', None)
        txt = d.pop('trait_text', None)
        src_idx = d.pop('trait_source_index', None)
        if src_type and txt:
            d['trait'] = {'source_type': src_type, 'text': txt, 'source_index': src_idx or 0}
        else:
            d['trait'] = None

        raw_tags = d.get('tags')
        if isinstance(raw_tags, str):
            try:
                d['tags'] = json.loads(raw_tags)
            except (json.JSONDecodeError, TypeError):
                d['tags'] = []
        elif raw_tags is None:
            d['tags'] = []

        return d


class PersonaChatFeedbackRequest(BaseModel):
    message_id: int
    rating: Literal["up", "down"]


class PersonaChatTagsRequest(BaseModel):
    tags: List[Literal["insight", "friction", "quote"]]

