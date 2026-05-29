"""
dependencies.py — FastAPI Dependency Injection Registry
═══════════════════════════════════════════════════════
All shared dependencies used via Depends() live here.

This module is the ONLY place that instantiates services.
Routes import from here; services never import from routes.

Dependency tree (no circular deps):
  config  ──► logger
  config  ──► db session
  config  ──► ChromaDB service
  config  ──► Embedding service
  Embedding + ChromaDB ──► Classifier service
  Classifier + Gemini  ──► Detection route
"""

from typing import AsyncGenerator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.utils.logger import get_logger

log = get_logger(__name__)


# ── Re-export DB dependency ───────────────────────────────────────────
# Routes import get_db from here (not from db.database) for clean imports
async def get_database() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session. Commit on success, rollback on error."""
    async for session in get_db():
        yield session


# ── Optional API Key Auth ─────────────────────────────────────────────
async def verify_api_key(
    x_api_key: str = Header(default=None, alias="X-API-Key"),
) -> str | None:
    """
    Optional header-based API key authentication.
    If APP_SECRET_KEY is the default dev value, auth is skipped.
    In production, all requests must supply a valid X-API-Key header.

    Usage:
        @router.post("/detect")
        async def detect(auth=Depends(verify_api_key)):
            ...
    """
    dev_key = "dev-secret-key-change-in-production"
    if settings.app_secret_key == dev_key:
        # Development mode — auth bypassed
        return None

    if not x_api_key or x_api_key != settings.app_secret_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return x_api_key


# ── Gemini availability check ─────────────────────────────────────────
def require_gemini() -> None:
    """
    Dependency that raises 503 if Gemini API key is not configured.
    Attach to any route that calls the Gemini service.

    Usage:
        @router.post("/analyze")
        async def analyze(_=Depends(require_gemini)):
            ...
    """
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI explanation service unavailable: "
                "GEMINI_API_KEY is not configured."
            ),
        )


# ── Service singletons (lazy-initialised) ────────────────────────────
# We use module-level variables so services are only instantiated once
# (not once per request). The first request triggers initialisation.

_embedding_service = None
_chroma_service = None
_classifier_service = None
_gemini_service = None


def get_embedding_service():
    """
    Return the singleton EmbeddingService.
    The model is loaded from disk on first call (~2-3 seconds).
    Subsequent calls return the already-loaded instance immediately.
    """
    global _embedding_service
    if _embedding_service is None:
        from app.services.embedding_service import EmbeddingService
        log.info("Initialising EmbeddingService (first request)...")
        _embedding_service = EmbeddingService()
    return _embedding_service


def get_chroma_service():
    """
    Return the singleton ChromaDBService.
    ChromaDB is initialised on first call; collections are created if absent.
    """
    global _chroma_service
    if _chroma_service is None:
        from app.services.chromadb_service import ChromaDBService
        log.info("Initialising ChromaDBService (first request)...")
        _chroma_service = ChromaDBService()
    return _chroma_service


def get_classifier_service():
    """
    Return the singleton ClassifierService.
    Loads the trained sklearn/XGBoost model from disk on first call.
    If no model file exists, falls back to pure vector-similarity scoring.
    """
    global _classifier_service
    if _classifier_service is None:
        from app.services.classifier_service import ClassifierService
        log.info("Initialising ClassifierService (first request)...")
        _classifier_service = ClassifierService(
            embedding_svc=get_embedding_service(),
            chroma_svc=get_chroma_service(),
        )
    return _classifier_service


def get_gemini_service():
    """
    Return the singleton GeminiService.
    Raises RuntimeError if GEMINI_API_KEY is not set.
    Use require_gemini() dependency on routes instead of catching here.
    """
    global _gemini_service
    if _gemini_service is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        from app.services.gemini_service import GeminiService
        log.info("Initialising GeminiService (first request)...")
        _gemini_service = GeminiService()
    return _gemini_service
