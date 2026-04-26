from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import event
from typing import Generator
import logging
import os

logger = logging.getLogger(__name__)

sqlite_file_name = os.getenv("SQLITE_PATH", "/data/database.db")
sqlite_url = os.getenv("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

if sqlite_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        try:
            cur.execute("PRAGMA journal_mode=WAL")
            result = cur.fetchone()
            if result and result[0].lower() != "wal":
                logger.warning("SQLite WAL mode not set (got %s). Continuing without WAL.", result[0])
        except Exception as e:
            logger.warning("Failed to set WAL mode: %s. Continuing.", e)
        try:
            cur.execute("PRAGMA busy_timeout=10000")  # 10 s queue before raising OperationalError
        except Exception as e:
            logger.warning("Failed to set busy_timeout: %s", e)
        cur.close()

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    
    # Manual migration helper for existing databases
    # SQLModel create_all doesn't add new columns to existing tables
    import sqlite3
    
    # Only run the manual SQLite migration if we're actually using SQLite
    if not sqlite_url.startswith("sqlite"):
        return

    # Extract the file path from the sqlite:/// URL using the same logic SQLAlchemy uses.
    # sqlite:////data/database.db → strip "sqlite:///" → "/data/database.db" (absolute)
    # sqlite:///database.db       → strip "sqlite:///" → "database.db" (relative, resolve from CWD)
    url_body = sqlite_url[len("sqlite:///"):]
    if url_body.startswith("/"):
        db_path = url_body  # absolute path
    else:
        db_path = os.path.abspath(url_body)  # resolve relative path

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check for account_type
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'account_type' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN account_type INTEGER DEFAULT 0")
            print("Successfully added account_type column to users table")

        if 'subscription_active' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN subscription_active BOOLEAN DEFAULT 0")
            print("Successfully added subscription_active column to users table")

        if 'subscription_expires_at' not in columns:
            # SQLite handles datetime as strings/integers, so we don't need special default here
            cursor.execute("ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME")
            print("Successfully added subscription_expires_at column to users table")
            
        if 'last_export_at' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN last_export_at DATETIME")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_users_last_export_at ON users (last_export_at)")
            print("Successfully added last_export_at column and index to users table")

        # payments table migrations
        cursor.execute("PRAGMA table_info(payments)")
        payment_columns = [col[1] for col in cursor.fetchall()]

        if payment_columns and 'plan_type' not in payment_columns:
            cursor.execute("ALTER TABLE payments ADD COLUMN plan_type TEXT")
            print("Successfully added plan_type column to payments table")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Migration check failed (this is normal for fresh DBs): {e}")

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
