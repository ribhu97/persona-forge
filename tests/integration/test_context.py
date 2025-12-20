from unittest.mock import patch
from fastapi.testclient import TestClient
from src.models import User
from src.dependencies import get_current_user
import json

def test_context_injection(client: TestClient, session):
    # Mock auth
    user = User(email="test@example.com", is_verified=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    
    app = client.app
    app.dependency_overrides[get_current_user] = lambda: user

    # 1. Create Conversation
    response = client.post("/conversations/", json={"title": "Test Chat"})
    assert response.status_code == 200
    conv_id = response.json()["id"]

    # 2. Mock generator for first turn
    mock_persona_1 = {
        "personas": [{
            "name": "Persona 1",
            "status": "primary",
            "role": "Role 1",
            "tech_comfort": "high",
            "scenario_context": "Context 1",
            "demographics": {"age": "25", "location": "NY", "education": "Uni", "industry": "Tech"},
            "goals": ["Goal 1"],
            "frustrations": ["Frustration 1"],
            "behavioral_patterns": [],
            "influence_networks": [],
            "recruitment_criteria": [],
            "research_assumptions": []
        }]
    }

    with patch("src.routers.chat.generate_personas") as mock_gen:
        mock_gen.return_value = mock_persona_1
        
        # Send first message
        response = client.post(f"/conversations/{conv_id}/messages", json={"content": "First request"})
        if response.status_code != 200:
            print(response.json())
        assert response.status_code == 200
        
        # Verify generator called without context
        args, kwargs = mock_gen.call_args
        assert args[0] == "First request"
        assert kwargs.get("generated_persona") is None

    # 3. Mock generator for second turn
    mock_persona_2 = {
         "personas": [{
            "name": "Persona 2",
            "status": "primary",
            "role": "Role 2",
            "tech_comfort": "medium",
            "scenario_context": "Context 2",
             "demographics": {},
             "goals": [],
             "frustrations": [],
             "behavioral_patterns": [],
             "influence_networks": [],
             "recruitment_criteria": [],
             "research_assumptions": []
         }]
    }

    with patch("src.routers.chat.generate_personas") as mock_gen:
        mock_gen.return_value = mock_persona_2
        
        # Send follow-up message
        response = client.post(f"/conversations/{conv_id}/messages", json={"content": "Follow up"})
        if response.status_code != 200:
            print(response.json())
        assert response.status_code == 200
        
        # Verify generator called WITH context
        args, kwargs = mock_gen.call_args
        assert args[0] == "Follow up"
        
        context_str = kwargs.get("generated_persona")
        assert context_str is not None
        
        context_json = json.loads(context_str)
        assert len(context_json["personas"]) == 1
        assert context_json["personas"][0]["name"] == "Persona 1"
        assert context_json["personas"][0]["goals"][0] == "Goal 1"
