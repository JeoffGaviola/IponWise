"""Database session management for IponWise."""
import os
from collections.abc import Generator
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from .config import load_environment

load_environment()


def normalize_database_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


raw_database_url = os.getenv("DATABASE_URL", "").strip()
engine = None
SessionLocal = None
if raw_database_url:
    engine = create_engine(
        normalize_database_url(raw_database_url),
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"connect_timeout": 8, "sslmode": "require"},
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database is not configured. Set DATABASE_URL in backend/.env.")
    db = SessionLocal()
    try:
        db.connection()
        yield db
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The database is unreachable. Copy the current Supabase Session pooler "
                "URI into DATABASE_URL, keep sslmode=require, and restart the backend."
            ),
        ) from exc
    finally:
        db.close()
