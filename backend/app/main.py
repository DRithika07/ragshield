"""
main.py — Sentinel-RAG FastAPI Application Entry Point
═══════════════════════════════════════════════════════
Assembles the complete application:
  1. Lifespan (startup / shutdown hooks)
  2. FastAPI instance with metadata
  3. CORS middleware
  4. Request ID + timing middleware
  5. Global exception handlers
  6. API router mounting
  7. Health check endpoints

Run with:
    uvicorn app.main:app --reload --port 8000
"""

import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.db.database import init_db
from app.utils.logger import get_logger

log = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Startup and shutdown hooks.
    Code before `yield` runs at startup.
    Code after `yield` runs at shutdown.

    Startup sequence:
      1. Init DB (create tables if not exist)
      2. Pre-warm embedding model (optional — avoids first-request latency)
      3. Verify ChromaDB connection

    All heavy initialisation is lazy (in dependencies.py) so the
    startup completes in <1 second. Services load on first request.
    """
    log.info(f"Starting {settings.app_name} v{settings.app_version}")
    log.info(f"Environment: {settings.app_env} | Debug: {settings.debug}")

    # 1. Initialise database
    await init_db()
    log.info("✓ Database ready")

    # 2. Ensure report output directory exists
    import os
    os.makedirs(settings.report_output_dir, exist_ok=True)
    os.makedirs(settings.chroma_persist_dir, exist_ok=True)
    log.info("✓ Output directories ready")

    log.info(f"✓ {settings.app_name} is running on {settings.api_prefix}")
    log.info("✓ Startup complete — services will load on first request")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────
    log.info(f"Shutting down {settings.app_name}...")


# ── FastAPI Application ───────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI-powered security platform for detecting and mitigating "
        "prompt injection and memory poisoning attacks in RAG systems. "
        "Built with LangGraph agents, ChromaDB, and Google Gemini."
    ),
    docs_url="/docs" if settings.debug else None,   # disable Swagger in prod
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
    lifespan=lifespan,
)


# ── CORS Middleware ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Request ID + Timing Middleware ────────────────────────────────────
@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    """
    Attach a unique request_id to every request.
    Log request entry and exit with timing.
    Add X-Request-ID to the response header.

    This lets you trace a single request through all logs:
      grep "req_abc123" sentinel.log
    """
    request_id = str(uuid.uuid4())[:8]   # short ID for readable logs
    request.state.request_id = request_id

    bound_log = log.bind(request_id=request_id)
    bound_log.info(f"→ {request.method} {request.url.path}")

    start_time = time.perf_counter()

    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        bound_log.info(
            f"← {response.status_code} {request.url.path} "
            f"[{duration_ms}ms]"
        )
        return response

    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        bound_log.error(
            f"✗ Unhandled exception on {request.url.path} "
            f"[{duration_ms}ms]: {exc}"
        )
        raise


# ── Global Exception Handlers ─────────────────────────────────────────
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": "Validation error",
            "detail": str(exc),
        },
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    log.error(f"RuntimeError on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "Internal server error",
            "detail": str(exc) if settings.debug else "An error occurred",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error(f"Unhandled exception: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An unexpected error occurred",
            "detail": str(exc) if settings.debug else None,
        },
    )


# ── API Router ────────────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.api_prefix)


# ── Health Check Endpoints ────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Basic liveness probe.
    Returns 200 if the server is running (used by Docker / load balancers).
    """
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """
    Readiness probe — checks that all services are available.
    Returns 503 if any critical service is down.
    """
    issues = []

    # Check ChromaDB
    try:
        from app.dependencies import get_chroma_service
        chroma = get_chroma_service()
        count = chroma.get_threat_library_count()
        chroma_status = {"status": "ok", "threat_library_docs": count}
    except Exception as e:
        chroma_status = {"status": "error", "detail": str(e)}
        issues.append("chromadb")

    # Check DB
    try:
        from app.db.database import AsyncSessionFactory
        async with AsyncSessionFactory() as session:
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))
        db_status = {"status": "ok"}
    except Exception as e:
        db_status = {"status": "error", "detail": str(e)}
        issues.append("database")

    overall = "ready" if not issues else "degraded"
    status_code = 200 if not issues else 503

    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "services": {
                "chromadb": chroma_status,
                "database": db_status,
                "gemini": "configured" if settings.gemini_api_key else "not_configured",
            },
            "issues": issues,
        },
    )


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "api": settings.api_prefix,
    }
