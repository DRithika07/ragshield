"""
database.py — Async SQLAlchemy Engine and Session Factory
══════════════════════════════════════════════════════════
Provides:
  - Async engine (aiosqlite driver for SQLite)
  - Async session factory
  - Base class for all ORM models
  - init_db() called once at startup to create all tables

Design: session-per-request pattern.
  Each FastAPI request gets its own AsyncSession,
  committed on success and rolled back on exception.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings
from app.utils.logger import get_logger

log = get_logger(__name__)


class Base(DeclarativeBase):
    """
    All ORM models inherit from this Base.
    SQLAlchemy uses it to discover tables at init_db() time.
    """
    pass


# ── Engine ────────────────────────────────────────────────────────────
# pool_pre_ping=True automatically reconnects on stale connections.
# echo=settings.db_echo_sql logs every SQL statement (dev only).
engine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo_sql,
    pool_pre_ping=True,
    # SQLite-specific: enable WAL mode for better concurrent reads
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

# ── Session Factory ───────────────────────────────────────────────────
# expire_on_commit=False: keeps model attributes accessible after commit,
# which matters when returning Pydantic models from async endpoints.
AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def init_db() -> None:
    """
    Create all tables defined in ORM models.
    Called once from main.py lifespan startup.
    Safe to call on every restart — CREATE TABLE IF NOT EXISTS.
    """
    # Import models here to ensure they are registered with Base
    # before create_all is called. This is the correct import order
    # to avoid circular dependencies.
    import app.db.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    log.info("Database tables initialised successfully")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an AsyncSession per request.
    Automatically commits on success, rolls back on any exception,
    and always closes the session when the request is done.

    Usage in route:
        @router.post("/detect")
        async def detect(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception as exc:
            await session.rollback()
            log.error(f"DB session rolled back due to: {exc}")
            raise
        finally:
            await session.close()
