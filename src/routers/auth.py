from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from datetime import timedelta, datetime, timezone
from typing import Annotated

from src.database import get_session
from src.models import User, OneTimePassword
from src.schemas import UserCreate, UserLogin, OTPVerify, GoogleLogin, Token
from src.auth import (
    get_password_hash, verify_password, create_access_token, 
    generate_otp, verify_google_token, ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_user
)
from src.email_service import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=dict)
async def signup(user_in: UserCreate, session: Annotated[Session, Depends(get_session)]):
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
    session.commit()
    session.refresh(user)
    
    # Generate and send OTP
    otp_code = generate_otp()
    otp = OneTimePassword(
        user_id=user.id, 
        code=otp_code, 
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)
    )
    session.add(otp)
    session.commit()
    
    send_otp_email(user.email, otp_code)
    
    return {"message": "User created. Please verify your email with the OTP sent."}

@router.post("/verify-otp", response_model=Token)
async def verify_otp(data: OTPVerify, session: Annotated[Session, Depends(get_session)]):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Find valid OTP
    otp = session.exec(
        select(OneTimePassword)
        .where(OneTimePassword.user_id == user.id)
        .where(OneTimePassword.code == data.otp)
        .where(OneTimePassword.expires_at > datetime.now(timezone.utc))
    ).first()
    
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    # Mark verified
    user.is_verified = True
    session.add(user)
    # Delete used OTP
    session.delete(otp)
    session.commit()
    
    # Generate Token
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(data: UserLogin, session: Annotated[Session, Depends(get_session)]):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    if not user.is_verified:
        raise HTTPException(status_code=401, detail="Email not verified. Please verify OTP.")
        
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/google", response_model=Token)
async def google_login(data: GoogleLogin, session: Annotated[Session, Depends(get_session)]):
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
            
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=User)
async def read_users_me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user
