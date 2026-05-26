from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from sqlalchemy.exc import OperationalError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging
import os

# Load environment variables early
load_dotenv()

limiter = Limiter(key_func=get_remote_address)

from src.database import create_db_and_tables, get_session
from src.routers.auth import router as auth_router
from src.routers.chat import router as chat_router
from src.routers.export import router as export_router
from src.routers.files import router as files_router
from src.routers.payments import router as payments_router
from src.routers.personas import router as personas_router
from src.routers.blog import router as blog_router
from src.routers.persona_chat import router as persona_chat_router
import uvicorn

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    if not os.environ.get("GROQ_API_KEY"):
        logger.warning(
            "GROQ_API_KEY is not set. Groq fallback is disabled. "
            "Gemini rate-limit failures will surface as 503 with no fallback."
        )
    # Clean up any orphaned upload records / Gemini files from previous runs
    try:
        from src.file_utils import sweep_expired_uploads
        session = next(get_session())
        sweep_expired_uploads(session)
        session.close()
    except Exception as e:
        logger.warning("Startup file sweep failed (non-fatal): %s", e)
    yield

app = FastAPI(
    title="User Persona Generator API",
    description="Generate user personas based on product descriptions using AI",
    version="1.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(OperationalError)
async def db_error_handler(request, exc):
    if "database is locked" in str(exc).lower():
        logger.warning("SQLite lock hit on %s", request.url.path)
        return JSONResponse(
            status_code=503,
            content={"detail": "AT_CAPACITY: We are currently at capacity. Please try again in a moment."},
        )
    logger.error("DB OperationalError on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred."})

DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    # Production: use only what's explicitly configured
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    # Development fallback
    origins = DEV_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(personas_router, prefix="/api")
app.include_router(blog_router, prefix="/api")
app.include_router(persona_chat_router, prefix="/api")

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
