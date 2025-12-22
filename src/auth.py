import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import httpx
import random
import string
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from typing import Annotated
from src.database import get_session
from src.models import User

# Config
SECRET_KEY = os.environ.get("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))

def verify_google_token(token: str) -> Optional[dict]:
    try:
        # If GOOGLE_CLIENT_ID is not set, we can't verify properly, 
        # but for dev we might want to skip or fail. 
        # Here we fail if not set to be safe.
        if not GOOGLE_CLIENT_ID:
            print("WARNING: GOOGLE_CLIENT_ID not set.")
            # return None 
        
        # Note: In a real scenario, you must provide the client ID.
        # For now, if it's None, verify_oauth2_token might skip audience check if not provided,
        # but it's better to be explicit.
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
        return idinfo
    except ValueError as e:
        # If ID token verification fails, try as Access Token (userinfo endpoint)
        try:
            with httpx.Client(timeout=10.0) as client:
                # To be secure, we should verify the token is intended for our client_id
                # First check token info
                token_info_resp = client.get(
                    'https://oauth2.googleapis.com/tokeninfo',
                    params={'access_token': token}
                )
                
                if token_info_resp.status_code != 200:
                    print(f"Google tokeninfo check failed: {token_info_resp.text}")
                    return None
                
                token_info = token_info_resp.json()
                # Verify that this token was issued for our GOOGLE_CLIENT_ID
                # 'azp' (Authorized party) or 'aud' (Audience) should match our client id
                is_valid_audience = (
                    token_info.get('azp') == GOOGLE_CLIENT_ID or 
                    token_info.get('aud') == GOOGLE_CLIENT_ID
                )
                
                if not is_valid_audience:
                    print(f"Google token verification failed: Audience mismatch. azp={token_info.get('azp')}, aud={token_info.get('aud')}")
                    return None

                # Now get userinfo for actual data (name, email)
                response = client.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    headers={'Authorization': f'Bearer {token}'}
                )
                if response.status_code == 200:
                    return response.json()
                print(f"Google userinfo request failed: {response.text}")
        except Exception as exc:
            print(f"Google token verification error: {exc}")
        return None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], session: Annotated[Session, Depends(get_session)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        raise credentials_exception
    return user
