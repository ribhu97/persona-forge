from sqlmodel import SQLModel, create_engine, Session
from typing import Generator

import os

sqlite_file_name = "database.db"
sqlite_url = os.getenv("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
