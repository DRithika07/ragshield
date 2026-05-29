"""
response.py — Pydantic Output Schemas (API Response Bodies)
═══════════════════════════════════════════════════════════
All API responses are typed here. FastAPI serializes these automatically.
Fields are deliberately explicit — no ORM objects leak into responses.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Shared Base ───────────────────────────────────────────────────────
class BaseResponse(BaseModel):
    """Common envelope for all responses."""
    success: bool = True
    message: str = "OK"


# ── Threat Detection ──────────────────────────────────────────────────
class ThreatResult(BaseModel):
    """Core detection result — returned by Detection Agent."""
    threat_id: str
    prompt_text: str
    predicted_label: int = Field(description="0=safe, 1=malicious")
    is_malicious: bool
    ml_score: float = Field(description="ML classifier probability (0-1)")
    similarity_score: float = Field(description="Vector similarity score (0-1)")
    fusion_score: float = Field(description="Weighted combined score (0-1)")
    severity: str = Field(description="LOW | MEDIUM | HIGH | CRITICAL")
    attack_type: Optional[str] = None
    detected_at: datetime


class AgentStep(BaseModel):
    """Represents one agent's contribution in the pipeline."""
    agent_name: str
    status: str = Field(description="running | complete | failed")
    output_summary: str
    duration_ms: Optional[int] = None


class DetectionResponse(BaseResponse):
    """Full response for POST /api/v1/detect"""
    data: ThreatResult
    agent_steps: List[AgentStep] = Field(default_factory=list)
    ai_explanation: Optional[str] = Field(
        default=None,
        description="Gemini-generated natural language explanation",
    )
    mitigation_steps: Optional[List[str]] = Field(
        default=None,
        description="Ordered list of recommended mitigation actions",
    )


class BatchDetectionResponse(BaseResponse):
    """Full response for POST /api/v1/detect/batch"""
    total: int
    malicious_count: int
    safe_count: int
    results: List[ThreatResult]


# ── RAG Memory ────────────────────────────────────────────────────────
class RAGDocumentResult(BaseModel):
    """Represents a document in RAG memory with its poison status."""
    doc_id: str
    content_preview: str = Field(description="First 200 chars of content")
    source: Optional[str] = None
    is_poisoned: bool
    poison_score: Optional[float] = None
    poison_status: str  # "blocked" | "flagged" | "clean"
    created_at: datetime


class RAGInjectResponse(BaseResponse):
    """Response for POST /api/v1/rag/inject"""
    doc_id: str
    is_blocked: bool
    is_flagged: bool
    poison_score: float
    action_taken: str = Field(description="blocked | flagged | stored")


class RAGScanResponse(BaseResponse):
    """Response for POST /api/v1/rag/scan"""
    total_documents: int
    poisoned_count: int
    flagged_count: int
    clean_count: int
    results: List[RAGDocumentResult]


# ── Dashboard ─────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    """Summary statistics for the main dashboard."""
    total_analyzed: int
    total_malicious: int
    total_safe: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    memory_poison_attempts: int
    detection_accuracy: Optional[float] = None
    avg_fusion_score: Optional[float] = None


class TimelineEvent(BaseModel):
    """Single point on the threat timeline chart."""
    timestamp: datetime
    malicious_count: int
    safe_count: int
    critical_count: int


class DashboardStatsResponse(BaseResponse):
    data: DashboardStats


class DashboardTimelineResponse(BaseResponse):
    data: List[TimelineEvent]


# ── Vector Similarity ─────────────────────────────────────────────────
class SimilarVector(BaseModel):
    """One result from a vector similarity search."""
    doc_id: str
    content_preview: str
    similarity: float
    label: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class VectorSimilarityResponse(BaseResponse):
    query_text: str
    collection: str
    results: List[SimilarVector]


class VectorVisualizePoint(BaseModel):
    """2D UMAP projection point for the scatter plot."""
    id: str
    x: float
    y: float
    label: int
    severity: Optional[str] = None
    content_preview: str


class VectorVisualizeResponse(BaseResponse):
    collection: str
    points: List[VectorVisualizePoint]
    total: int


# ── Agents ────────────────────────────────────────────────────────────
class AgentRunResponse(BaseResponse):
    """Response for POST /api/v1/agents/run"""
    run_id: str
    threat_result: ThreatResult
    agent_steps: List[AgentStep]
    ai_explanation: Optional[str] = None
    mitigation_steps: Optional[List[str]] = None
    report_id: Optional[str] = None


# ── Reports ───────────────────────────────────────────────────────────
class ReportMeta(BaseModel):
    """Metadata for a generated PDF report."""
    report_id: str
    report_title: str
    file_name: str
    report_type: str
    threat_log_id: Optional[str] = None
    created_at: datetime


class ReportGenerateResponse(BaseResponse):
    data: ReportMeta
    download_url: str


class ReportListResponse(BaseResponse):
    data: List[ReportMeta]
    total: int


# ── Logs ──────────────────────────────────────────────────────────────
class ThreatLogEntry(BaseModel):
    """Public-facing representation of one ThreatLog DB row."""
    id: str
    session_id: str
    prompt_text: str
    predicted_label: int
    is_malicious: bool
    fusion_score: float
    severity: str
    attack_type: Optional[str] = None
    is_memory_poison: bool
    report_generated: bool
    created_at: datetime


class ThreatLogListResponse(BaseResponse):
    data: List[ThreatLogEntry]
    total: int
    page: int
    page_size: int


# ── Generic Error ─────────────────────────────────────────────────────
class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    detail: Optional[str] = None
    error_code: Optional[str] = None
