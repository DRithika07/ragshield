"""
config.py — Sentinel-RAG Application Settings
All environment variables defined here using Pydantic BaseSettings.
"""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────
    app_name: str = "Sentinel-RAG Security Platform"
    app_version: str = "1.0.0"
    app_env: str = Field(default="development")
    app_secret_key: str = Field(default="dev-secret-key-change-in-production")
    debug: bool = Field(default=True)

    # ── CORS ─────────────────────────────────────────────────────────
    allowed_origins: str = Field(default="http://localhost:3000,http://localhost:5173")

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # ── API ──────────────────────────────────────────────────────────
    api_prefix: str = "/api/v1"
    api_rate_limit: int = Field(default=100, ge=1)

    # ── Google Gemini ────────────────────────────────────────────────
    gemini_api_key: str = Field(default="")
    gemini_model: str = "gemini-2.0-flash"
    gemini_max_tokens: int = Field(default=1024, ge=128, le=8192)
    gemini_temperature: float = Field(default=0.2, ge=0.0, le=1.0)

    # ── Sentence Transformers ────────────────────────────────────────
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_device: str = Field(default="cpu")
    embedding_batch_size: int = Field(default=64, ge=1)
    embedding_dim: int = 384

    # ── ChromaDB ─────────────────────────────────────────────────────
    chroma_persist_dir: str = "./data/chroma_store"
    chroma_host: str = "localhost"
    chroma_port: int = Field(default=8001)
    chroma_collection_threat_library: str = "threat_library"
    chroma_collection_rag_memory: str = "rag_memory"
    chroma_collection_detection_history: str = "detection_history"

    # ── Database ─────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./data/sentinel.db"
    db_echo_sql: bool = False

    # ── ML Classifier ────────────────────────────────────────────────
    model_path: str = "./ml/saved_models/classifier.pkl"
    threat_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    similarity_threshold: float = Field(default=0.82, ge=0.0, le=1.0)
    ml_score_weight: float = Field(default=0.60, ge=0.0, le=1.0)
    similarity_score_weight: float = Field(default=0.40, ge=0.0, le=1.0)
    top_k_similar: int = Field(default=5, ge=1, le=50)

    # ── Severity Bands ───────────────────────────────────────────────
    severity_low_max: float = 0.65
    severity_medium_max: float = 0.80
    severity_high_max: float = 0.90

    # ── PDF Reports ───────────────────────────────────────────────────
    report_output_dir: str = "./data/reports"

    # ── Logging ──────────────────────────────────────────────────────
    log_level: str = Field(default="INFO")
    log_file: str = "./data/sentinel.log"

    @field_validator("gemini_api_key")
    @classmethod
    def warn_missing_gemini_key(cls, v: str) -> str:
        if not v:
            import warnings
            warnings.warn(
                "GEMINI_API_KEY is not set. AI explanation endpoints will return 503.",
                UserWarning,
                stacklevel=2,
            )
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton — .env read exactly once."""
    return Settings()


settings: Settings = get_settings()
