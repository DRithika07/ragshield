"""
logger.py — Structured Logging for Sentinel-RAG
Uses Loguru for structured, colored, rotation-aware logging.

Every log record carries: timestamp, level, module, function,
request_id (in request context), agent_name (in agent context).

Usage:
    from app.utils.logger import get_logger
    log = get_logger(__name__)
    log.info("Threat detected", score=0.91, label="malicious")
"""

import sys
from pathlib import Path
from typing import Any

from loguru import logger as _loguru_logger

from app.config import settings


def _setup_logger() -> None:
    """
    Configure Loguru with two sinks:
      1. Console — colored for dev, JSON for production
      2. File    — always JSON, rotated at 10 MB, kept 30 days
    """
    _loguru_logger.remove()   # clear the default Loguru handler

    # ── Console Sink ─────────────────────────────────────────────────
    if settings.app_env == "production":
        console_fmt = (
            '{{"time":"{time:YYYY-MM-DDTHH:mm:ss.SSSZ}",'
            '"level":"{level}","module":"{module}",'
            '"function":"{function}","line":{line},'
            '"message":"{message}"}}'
        )
        colorize = False
    else:
        console_fmt = (
            "<green>{time:HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{module}</cyan>:<cyan>{function}</cyan> — "
            "<level>{message}</level>"
        )
        colorize = True

    _loguru_logger.add(
        sys.stderr,
        format=console_fmt,
        level=settings.log_level,
        colorize=colorize,
        backtrace=settings.debug,
        diagnose=settings.debug,
    )

    # ── File Sink ─────────────────────────────────────────────────────
    log_path = Path(settings.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    _loguru_logger.add(
        str(log_path),
        format=(
            '{{"time":"{time:YYYY-MM-DDTHH:mm:ss.SSSZ}",'
            '"level":"{level}","module":"{module}",'
            '"function":"{function}","line":{line},'
            '"message":"{message}"}}'
        ),
        level="DEBUG",
        rotation="10 MB",
        retention="30 days",
        compression="zip",
        backtrace=True,
        diagnose=False,     # never log variable values to file (security)
        enqueue=True,       # async writes — never blocks request threads
    )


def get_logger(name: str) -> Any:
    """
    Return a Loguru logger bound to a module name.

        log = get_logger(__name__)
        log.info("Service ready")
        log.bind(request_id="abc123").debug("Processing prompt")
        log.bind(agent="DetectionAgent").warning("High score: 0.91")
    """
    return _loguru_logger.bind(module_name=name)


# ── Bootstrap on first import ────────────────────────────────────────
_setup_logger()
log = get_logger("sentinel_rag")
