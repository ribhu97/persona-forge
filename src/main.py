from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.database import create_db_and_tables
from src.routers.auth import router as auth_router
from src.routers.chat import router as chat_router
import uvicorn

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(
    title="User Persona Generator API",
    description="Generate user personas based on product descriptions using AI",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "User Persona Generator API",
        "endpoints": {
            "POST /auth/signup": "Sign up",
            "POST /auth/login": "Login",
            "POST /conversations": "Start conversation",
            "GET /health": "Health check endpoint"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "persona-generator"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
