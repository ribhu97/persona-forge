from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: Optional[str] = None
    auth_provider: str = Field(default="email") # email or google
    name: Optional[str] = None
    is_verified: bool = Field(default=False)
    account_type: int = Field(default=0)  # 0=Free, 1=Admin, future: 2=Pro, 3=Enterprise
    last_export_at: Optional[datetime] = None  # Track monthly export limit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    otps: List["OneTimePassword"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    conversations: List["Conversation"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    personas: List["Persona"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})

class OneTimePassword(SQLModel, table=True):
    __tablename__ = "one_time_passwords"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    code: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    user: User = Relationship(back_populates="otps")

class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    title: Optional[str] = None
    last_message_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    user: User = Relationship(back_populates="conversations")
    messages: List["Message"] = Relationship(back_populates="conversation", sa_relationship_kwargs={"cascade": "all, delete"})

class Message(SQLModel, table=True):
    __tablename__ = "messages"
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversations.id", ondelete="CASCADE")
    role: str # user or assistant
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    conversation: Conversation = Relationship(back_populates="messages")
    personas: List["Persona"] = Relationship(back_populates="message", sa_relationship_kwargs={"cascade": "all, delete"})

class Persona(SQLModel, table=True):
    __tablename__ = "personas"
    id: Optional[int] = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="messages.id", ondelete="CASCADE")
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE")
    name: str
    status: str # primary or secondary
    role: str
    tech_comfort: str
    scenario_context: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    message: Message = Relationship(back_populates="personas")
    user: User = Relationship(back_populates="personas")
    
    demographics: Optional["Demographics"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete", "uselist": False})
    goals: List["Goal"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})
    frustrations: List["Frustration"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})
    behavioral_patterns: List["BehavioralPattern"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})
    influence_networks: List["InfluenceNetwork"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})
    recruitment_criteria: List["RecruitmentCriteria"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})
    research_assumptions: List["ResearchAssumption"] = Relationship(back_populates="persona", sa_relationship_kwargs={"cascade": "all, delete"})

class Demographics(SQLModel, table=True):
    __tablename__ = "demographics"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE", unique=True)
    age: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    industry: Optional[str] = None
    
    persona: Persona = Relationship(back_populates="demographics")

class Goal(SQLModel, table=True):
    __tablename__ = "goals"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    goal_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="goals")

class Frustration(SQLModel, table=True):
    __tablename__ = "frustrations"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    frustration_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="frustrations")

class BehavioralPattern(SQLModel, table=True):
    __tablename__ = "behavioral_patterns"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    pattern_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="behavioral_patterns")

class InfluenceNetwork(SQLModel, table=True):
    __tablename__ = "influence_networks"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    network_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="influence_networks")

class RecruitmentCriteria(SQLModel, table=True):
    __tablename__ = "recruitment_criteria"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    criteria_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="recruitment_criteria")

class ResearchAssumption(SQLModel, table=True):
    __tablename__ = "research_assumptions"
    id: Optional[int] = Field(default=None, primary_key=True)
    persona_id: int = Field(foreign_key="personas.id", ondelete="CASCADE")
    assumption_text: str
    order_index: int
    
    persona: Persona = Relationship(back_populates="research_assumptions")
