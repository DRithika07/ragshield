"""
models.py — SQLAlchemy ORM Models
══════════════════════════════════
Tables:
  ThreatLog    — one row per analyzed prompt (immutable audit log)
  RAGDocument  — documents stored in simulated RAG memory
  IncidentReport — generated PDF report metadata

All timestamps are UTC. IDs are UUIDs (string type for SQLite compat).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC datetime — avoids deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc)


def _uuid() -> str:
    """Generate a new UUID4 string suitable for use as a primary key."""
    return str(uuid.uuid4())


# ── ThreatLog ─────────────────────────────────────────────────────────
class ThreatLog(Base):
    """
    Immutable record of every prompt that was analyzed.
    One row = one detection event.

    Never updated after creation — append-only for audit integrity.
    """
    __tablename__ = "threat_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # ── Input ──────────────────────────────────────────────────────
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    # SHA-256 hash of prompt — for deduplication without storing full text twice
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # ── Detection Result ──────────────────────────────────────────
    # 0 = safe, 1 = malicious
    predicted_label: Mapped[int] = mapped_column(Integer, nullable=False)
    # Raw ML classifier probability (0.0 – 1.0)
    ml_score: Mapped[float] = mapped_column(Float, nullable=False)
    # Average cosine similarity to nearest threat library vectors
    similarity_score: Mapped[float] = mapped_column(Float, nullable=False)
    # Weighted fusion score used for final decision
    fusion_score: Mapped[float] = mapped_column(Float, nullable=False)
    # LOW | MEDIUM | HIGH | CRITICAL
    severity: Mapped[str] = mapped_column(String(16), nullable=False)

    # ── Classification Detail ─────────────────────────────────────
    attack_type: Mapped[str] = mapped_column(String(64), nullable=True)
    # Gemini-generated explanation (may be null if API key missing)
    ai_explanation: Mapped[str] = mapped_column(Text, nullable=True)
    # JSON string of mitigation steps from Mitigation Agent
    mitigation_steps: Mapped[str] = mapped_column(Text, nullable=True)

    # ── Lifecycle Flags ───────────────────────────────────────────
    # Whether this event was part of a RAG memory injection attempt
    is_memory_poison: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether a PDF report was generated for this event
    report_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    # ID of associated IncidentReport (if report_generated=True)
    report_id: Mapped[str] = mapped_column(String(36), nullable=True)

    # ── Audit ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    # Name of the Embedding model used (for reproducibility)
    embedding_model: Mapped[str] = mapped_column(String(64), nullable=True)


# ── RAGDocument ───────────────────────────────────────────────────────
class RAGDocument(Base):
    """
    Represents a document stored in the simulated RAG memory system.
    Tracks whether a document was injected as a poisoning attempt.
    """
    __tablename__ = "rag_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # ChromaDB document ID for cross-reference
    chroma_doc_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(255), nullable=True)

    # ── Poison Detection ──────────────────────────────────────────
    is_poisoned: Mapped[bool] = mapped_column(Boolean, default=False)
    # Similarity score against threat_library at injection time
    poison_score: Mapped[float] = mapped_column(Float, nullable=True)
    # "blocked" | "flagged" | "clean"
    poison_status: Mapped[str] = mapped_column(String(16), default="clean")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    poisoned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


# ── IncidentReport ────────────────────────────────────────────────────
class IncidentReport(Base):
    """
    Metadata record for generated PDF incident reports.
    The actual PDF file is stored on disk; this table tracks its location.
    """
    __tablename__ = "incident_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # The ThreatLog event this report covers (may be null for batch reports)
    threat_log_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)

    report_title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=True)

    # "single" = one threat event | "batch" = multiple events
    report_type: Mapped[str] = mapped_column(String(16), default="single")
    # Agent that generated the report (always "ReportAgent" for now)
    generated_by: Mapped[str] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
