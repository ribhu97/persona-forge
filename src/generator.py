import os
import json
from google import genai
from google.genai import types
from src.prompts import refined_generation_prompt, chat_naming_prompt, user_follow_up_prompt
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

def parse_json(json_str: str, is_chat_name: bool = False) -> dict:
    """
    Parse JSON string output from Gemini API into structured data.
    
    Parameters
    ----------
    json_str : str
        Raw JSON string from the API response
    is_chat_name : bool
        Whether the JSON string is a chat name or persona data
        
    Returns
    -------
    dict
        Parsed JSON data with personas, or empty dict if parsing fails
        
    Raises
    ------
    json.JSONDecodeError
        If JSON parsing fails
    KeyError
        If required schema fields are missing
    ValueError
        If data types or values don't match expected schema
        
    Notes
    -----
    This function validates the JSON response against the expected persona schema
    defined in the refined_generation_prompt. It ensures all required fields
    are present and have the correct data types.
    """
    try:
        # Parse the JSON string
        parsed_data = json.loads(json_str)
        
        # Validate basic structure
        if not isinstance(parsed_data, dict):
            raise ValueError("Expected JSON object, got: " + str(type(parsed_data)))
        
        if not is_chat_name:
            if "personas" not in parsed_data:
                raise KeyError("Missing 'personas' key in JSON response")
            
            if not isinstance(parsed_data["personas"], list):
                raise ValueError("'personas' must be an array")
        
        # Validate each persona has required fields
        if is_chat_name:
            required_fields = ["name"]
        else:
            required_fields = [
                "name", "status", "role", "demographics", "goals", 
                "frustrations", "behavioral_patterns", "tech_comfort",
                "scenario_context", "influence_networks", "recruitment_criteria",
                "research_assumptions"
            ]
        
        if not is_chat_name:
            required_demographics = ["age", "location", "education", "industry"]
        
            for i, persona in enumerate(parsed_data["personas"]):
                if not isinstance(persona, dict):
                    raise ValueError(f"Persona {i} must be an object")
                
                # Check required fields
                for field in required_fields:
                    if field not in persona:
                        raise KeyError(f"Persona {i} missing required field: {field}")
                
                # Validate demographics structure
                if not isinstance(persona["demographics"], dict):
                    raise ValueError(f"Persona {i} demographics must be an object")
                
                for demo_field in required_demographics:
                    if demo_field not in persona["demographics"]:
                        raise KeyError(f"Persona {i} demographics missing: {demo_field}")
                
                # Validate status values
                if persona["status"] not in ["primary", "secondary"]:
                    raise ValueError(f"Persona {i} status must be 'primary' or 'secondary', got: {persona['status']}")
                
                # Validate tech_comfort values
                if persona["tech_comfort"] not in ["low", "medium", "high"]:
                    raise ValueError(f"Persona {i} tech_comfort must be 'low', 'medium', or 'high', got: {persona['tech_comfort']}")
                
                # Validate array fields
                array_fields = ["goals", "frustrations", "behavioral_patterns", "influence_networks", "recruitment_criteria", "research_assumptions"]
                for field in array_fields:
                    if not isinstance(persona[field], list):
                        raise ValueError(f"Persona {i} {field} must be an array")
        
        return parsed_data
        
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {e}")
        print(f"Raw output: {json_str}")
        return {}
    except (KeyError, ValueError) as e:
        print(f"Schema validation failed: {e}")
        print(f"Parsed data: {parsed_data}")
        return {}

def generate_chat_name(first_message: str) -> dict:
    """
    Generate chat name based on the provided text using Gemini API.
    
    Parameters
    ----------
    text : str
        First chat message to generate name for
        
    Returns
    -------
    dict
        Parsed and validated chat name data, or empty dict if parsing fails
        
    Notes
    -----
    This function calls the Gemini API with the refined generation prompt to
    create a chat name based on the first chat message. The response is
    automatically parsed and validated against the expected schema before
    being returned.
    """
    client = genai.Client(
        api_key=os.environ.get("GOOGLE_API_KEY"),
    )

    model = "gemini-2.5-flash-lite"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=first_message),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        thinking_config = types.ThinkingConfig(
            thinking_budget=0,
        ),
        response_mime_type="application/json",
        system_instruction=[
            types.Part.from_text(text=chat_naming_prompt),
        ],
    )
    output = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )

    raw_output_str = output.candidates[0].content.parts[0].text

    # Parse and validate the JSON output
    parsed_chat_name = parse_json(raw_output_str, is_chat_name=True)
    return parsed_chat_name 

def generate_personas(text: str, generated_persona: Optional[str] = None) -> dict:
    """
    Generate user personas based on the provided text using Gemini API.
    
    Parameters
    ----------
    text : str
        Product description or concept text to generate personas for
    generated_persona : Optional[str]
        Optional generated persona to be used for follow-up requests
        
    Returns
    -------
    dict
        Parsed and validated persona data, or empty dict if parsing fails
        
    Notes
    -----
    This function calls the Gemini API with the refined generation prompt to
    create hypothetical user personas. The response is automatically parsed
    and validated against the expected schema before being returned.
    
    The generated personas include primary and secondary user types with
    detailed information about demographics, goals, frustrations, and
    research assumptions for user validation studies.
    """
    client = genai.Client(
        api_key=os.environ.get("GOOGLE_API_KEY"),
    )

    model = "gemini-2.5-flash-lite"
    if generated_persona == None:   
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=text),
                ],
            ),
        ]
        generate_content_config = types.GenerateContentConfig(
            thinking_config = types.ThinkingConfig(
                thinking_budget=0,
            ),
            response_mime_type="application/json",
            system_instruction=[
                types.Part.from_text(text=refined_generation_prompt),
            ],
        )
    else:
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=f"User Follow-up request: {text}"),
                    types.Part.from_text(text=f"Last generated persona json: {generated_persona}"),
                ],
            ),
        ]
        generate_content_config = types.GenerateContentConfig(
            thinking_config = types.ThinkingConfig(
                thinking_budget=0,
            ),
            response_mime_type="application/json",
            system_instruction=[
                types.Part.from_text(text=user_follow_up_prompt),
            ],
        )
    
    output = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )

    raw_output_str = output.candidates[0].content.parts[0].text

    # Parse and validate the JSON output
    parsed_personas = parse_json(raw_output_str)
    return parsed_personas

if __name__ == "__main__":
    print("Hey there! What are you building today?")
    user_input = input()
    output = generate_personas(user_input)
    
    if output and "personas" in output:
        print(f"\nGenerated {len(output['personas'])} personas:")
        for i, persona in enumerate(output["personas"], 1):
            print(f"\n--- Persona {i}: {persona['name']} ({persona['status']}) ---")
            print(f"Role: {persona['role']}")
            print(f"Demographics: {persona['demographics']['age']} year old from {persona['demographics']['location']}")
            print(f"Education: {persona['demographics']['education']}")
            print(f"Industry: {persona['demographics']['industry']}")
            print(f"Tech Comfort: {persona['tech_comfort']}")
            print(f"Goals: {', '.join(persona['goals'])}")
            print(f"Frustrations: {', '.join(persona['frustrations'])}")
            print(f"Scenario: {persona['scenario_context']}")
    else:
        print("Failed to generate personas. Please check the API response and try again.")
