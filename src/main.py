from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from generator import generate_personas
import uvicorn

app = FastAPI(
    title="User Persona Generator API",
    description="Generate user personas based on product descriptions using AI",
    version="1.0.0"
)

class PersonaRequest(BaseModel):
    text: str

class PersonaResponse(BaseModel):
    success: bool
    data: dict
    message: str = ""

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "User Persona Generator API",
        "endpoints": {
            "POST /generate-personas": "Generate user personas from text",
            "GET /health": "Health check endpoint"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "persona-generator"}

@app.post("/generate-personas", response_model=PersonaResponse)
async def generate_personas_endpoint(request: PersonaRequest):
    """
    Generate user personas based on the provided text description.
    
    This endpoint takes a product description or concept text and returns
    generated user personas including primary and secondary user types.
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        # Call the generate_personas function
        personas = generate_personas(request.text)
        
        if not personas or "personas" not in personas:
            return PersonaResponse(
                success=False,
                data={},
                message="Failed to generate personas. Please try again."
            )
        
        return PersonaResponse(
            success=True,
            data=personas,
            message=f"Successfully generated {len(personas['personas'])} personas"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error generating personas: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
