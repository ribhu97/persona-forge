from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session, select
from sqlalchemy import update
from datetime import timedelta, datetime, timezone
from typing import Annotated
import logging

from src.database import get_session
from src.models import User, OneTimePassword, OTP_MAX_ATTEMPTS
from src.schemas import UserCreate, UserLogin, OTPVerify, GoogleLogin, Token, UserResponse
from src.auth import (
    get_password_hash, verify_password, create_access_token,
    generate_otp, verify_google_token, ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user
)
from src.email_service import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)


def _claim_and_commit(session: Session, user: User, lead_token: str | None) -> int | None:
    """
    Fire the Lead Persona Set claim and commit it. Returns the claimed
    conversation id, or None when there is nothing to claim.

    A claim failure must never fail the auth request: by the time this runs
    verify-otp has already consumed the OTP, so an exception escaping here
    would lock the user out of the account they just created.
    """
    from src import lead_sets
    try:
        claimed = lead_sets.maybe_claim(session, user, token=lead_token)
    except Exception:
        logger.exception("[auth] lead-set claim failed for user %s", user.id)
        session.rollback()
        return None
    if not claimed:
        return None
    try:
        session.commit()
    except Exception:
        logger.exception("[auth] lead-set claim commit failed for user %s", user.id)
        session.rollback()
        return None
    return claimed.conversation_id

@router.post("/signup", response_model=dict)
@limiter.limit("5/minute")
async def signup(request: Request, user_in: UserCreate, session: Annotated[Session, Depends(get_session)]):
    # Check if user exists
    existing_user = session.exec(select(User).where(User.email == user_in.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user (unverified)
    hashed_pw = get_password_hash(user_in.password)
    user = User(
        email=user_in.email, 
        hashed_password=hashed_pw, 
        name=user_in.name,
        auth_provider="email"
    )
    session.add(user)
    # Flush to get user.id for the OTP FK — don't commit yet so we can roll back if email fails
    session.flush()

    otp_code = generate_otp()
    otp = OneTimePassword(
        user_id=user.id,
        code=otp_code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)
    )
    session.add(otp)
    session.flush()

    # Send email before committing — roll back both user and OTP if it fails
    try:
        send_otp_email(user.email, otp_code)
    except Exception:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please try again."
        )

    session.commit()
    return {"message": "User created. Please verify your email with the OTP sent."}

@router.post("/verify-otp", response_model=Token)
@limiter.limit("10/minute")
async def verify_otp(request: Request, data: OTPVerify, session: Annotated[Session, Depends(get_session)]):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Find the most recent non-expired OTP for this user (don't check code yet)
    otp = session.exec(
        select(OneTimePassword)
        .where(OneTimePassword.user_id == user.id)
        .where(OneTimePassword.expires_at > datetime.now(timezone.utc))
        .order_by(OneTimePassword.created_at.desc())
    ).first()

    if not otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Atomically claim one attempt slot BEFORE comparing the code. The
    # `attempts < OTP_MAX_ATTEMPTS` guard lives inside a single UPDATE, so
    # concurrent submissions cannot all read the same counter and overspend it:
    # the DB serializes the writes and at most OTP_MAX_ATTEMPTS requests can ever
    # win the slot, capping the number of code comparisons for a live code.
    result = session.execute(
        update(OneTimePassword)
        .where(OneTimePassword.id == otp.id)
        .where(OneTimePassword.attempts < OTP_MAX_ATTEMPTS)
        .values(attempts=OneTimePassword.attempts + 1)
    )
    session.commit()

    if result.rowcount == 0:
        # No slot left — the limit is already reached. Burn the code so it
        # can't be retried, then reject.
        session.delete(otp)
        session.commit()
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new OTP.")

    # Reload the freshly-incremented counter for an accurate "remaining" message.
    session.refresh(otp)

    if otp.code != data.otp:
        remaining = OTP_MAX_ATTEMPTS - otp.attempts
        raise HTTPException(
            status_code=400,
            detail=f"Invalid OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )

    # Code correct — mark verified and consume OTP
    user.is_verified = True
    session.add(user)
    session.delete(otp)
    session.commit()

    # Lead Persona Sets: fire the Claim (token-first, email fallback). None = nothing to claim.
    claimed_conversation_id = _claim_and_commit(session, user, data.lead_token)

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer",
            "claimed_conversation_id": claimed_conversation_id}

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, data: UserLogin, session: Annotated[Session, Depends(get_session)]):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Email not verified. Please verify OTP.")
        
    # Lead Persona Sets: fire the Claim (token-first, email fallback).
    claimed_conversation_id = _claim_and_commit(session, user, data.lead_token)

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer",
            "claimed_conversation_id": claimed_conversation_id}

@router.post("/google", response_model=Token)
@limiter.limit("10/minute")
async def google_login(request: Request, data: GoogleLogin, session: Annotated[Session, Depends(get_session)]):
    id_info = verify_google_token(data.token)
    if not id_info:
        raise HTTPException(status_code=400, detail="Invalid Google token")
        
    email = id_info.get("email")
    name = id_info.get("name")
    
    user = session.exec(select(User).where(User.email == email)).first()
    
    if not user:
        # Create new user
        user = User(
            email=email,
            name=name,
            auth_provider="google",
            is_verified=True # Google is trusted
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.auth_provider == "email":
        # Link account or just allow login? 
        # For simplicity, we allow login but don't change provider unless we want to support multiple.
        # We'll just mark verified if not already.
        if not user.is_verified:
            user.is_verified = True
            session.add(user)
            session.commit()
            
    # Lead Persona Sets: fire the Claim (token-first, email fallback).
    claimed_conversation_id = _claim_and_commit(session, user, data.lead_token)

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer",
            "claimed_conversation_id": claimed_conversation_id}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user
