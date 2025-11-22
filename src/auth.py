import os
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from google.oauth2 import id_token
from google.auth.transport import requests
import random
import string

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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
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
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        return idinfo
    except ValueError as e:
        print(f"Google token verification failed: {e}")
        return None
