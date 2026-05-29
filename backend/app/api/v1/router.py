"""
router.py — API v1 Route Aggregator
═════════════════════════════════════
Central registration point for all v1 API routes.
main.py mounts this single router under /api/v1.

Adding a new feature = create a new route file + one line here.
"""

from fastapi import APIRouter

# Import individual route modules
# Routes are registered lazily — import order doesn't matter here
# because each module only defines routers, not run code at import time.

# We use try/except so the app starts even if a route file has an error —
# missing routes fail gracefully rather than crashing the entire server.

api_router = APIRouter()


def _register_routes() -> None:
    """Attach all sub-routers to the main api_router."""

    try:
        from app.api.v1 import detection
        api_router.include_router(
            detection.router,
            prefix="/detect",
            tags=["Detection"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Detection routes not loaded: {e}")

    try:
        from app.api.v1 import analysis
        api_router.include_router(
            analysis.router,
            prefix="/analyze",
            tags=["Analysis"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Analysis routes not loaded: {e}")

    try:
        from app.api.v1 import agents
        api_router.include_router(
            agents.router,
            prefix="/agents",
            tags=["Agents"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Agent routes not loaded: {e}")

    try:
        from app.api.v1 import rag
        api_router.include_router(
            rag.router,
            prefix="/rag",
            tags=["RAG Memory"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"RAG routes not loaded: {e}")

    try:
        from app.api.v1 import logs
        api_router.include_router(
            logs.router,
            prefix="/logs",
            tags=["Attack Logs"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Log routes not loaded: {e}")

    try:
        from app.api.v1 import reports
        api_router.include_router(
            reports.router,
            prefix="/reports",
            tags=["Reports"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Report routes not loaded: {e}")

    try:
        from app.api.v1 import dashboard
        api_router.include_router(
            dashboard.router,
            prefix="/dashboard",
            tags=["Dashboard"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Dashboard routes not loaded: {e}")

    try:
        from app.api.v1 import vectors
        api_router.include_router(
            vectors.router,
            prefix="/vectors",
            tags=["Vector Similarity"],
        )
    except ImportError as e:
        import warnings
        warnings.warn(f"Vector routes not loaded: {e}")


_register_routes()
