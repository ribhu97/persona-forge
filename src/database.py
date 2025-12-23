from sqlmodel import SQLModel, create_engine, Session
from typing import Generator

import os

sqlite_file_name = "database.db"
sqlite_url = os.getenv("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    
    # Manual migration helper for existing databases
    # SQLModel create_all doesn't add new columns to existing tables
    import sqlite3
    from urllib.parse import urlparse
    
    # Extract path from sqlite:///database.db
    parsed = urlparse(sqlite_url)
    db_path = parsed.path.lstrip('/')
    if not db_path: # Handle cases like sqlite:///database.db vs sqlite:///../database.db
        db_path = sqlite_file_name

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check for account_type
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'account_type' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN account_type INTEGER DEFAULT 0")
            print("Successfully added account_type column to users table")
            
        if 'last_export_at' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN last_export_at DATETIME")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_users_last_export_at ON users (last_export_at)")
            print("Successfully added last_export_at column and index to users table")
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Migration check failed (this is normal for fresh DBs): {e}")

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
