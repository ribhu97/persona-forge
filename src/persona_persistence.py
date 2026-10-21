"""Shared persona persistence.

One writer for Persona rows and their nested rows (Demographics, Goal,
Frustration, BehavioralPattern, InfluenceNetwork, RecruitmentCriteria,
ResearchAssumption). Callers stage into their own session and own the
transaction boundary (commit + rollback) — this module never commits.
"""

from sqlmodel import Session

from .models import (
    BehavioralPattern,
    Demographics,
    Frustration,
    Goal,
    InfluenceNetwork,
    Persona,
    RecruitmentCriteria,
    ResearchAssumption,
)


def save_personas(session: Session, message_id: int, user_id: int, personas_data: list) -> None:
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

        if isinstance(p_data.get("demographics"), dict):
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
