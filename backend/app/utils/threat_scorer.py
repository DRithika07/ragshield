"""
threat_scorer.py — Threat Severity Utilities
═════════════════════════════════════════════
Pure utility functions for threat scoring calculations.
No external dependencies — importable from anywhere.
"""

from app.config import settings


def score_to_severity(score: float) -> str:
    """Map a 0-1 fusion score to a severity label."""
    if score < settings.threat_threshold:
        return "NONE"
    elif score < settings.severity_low_max:
        return "LOW"
    elif score < settings.severity_medium_max:
        return "MEDIUM"
    elif score < settings.severity_high_max:
        return "HIGH"
    return "CRITICAL"


def severity_to_color(severity: str) -> str:
    """Map severity to hex color for PDF reports and UI."""
    return {
        "NONE": "#22c55e",
        "LOW": "#facc15",
        "MEDIUM": "#f97316",
        "HIGH": "#ef4444",
        "CRITICAL": "#7c3aed",
    }.get(severity, "#6b7280")


def severity_to_int(severity: str) -> int:
    """Numeric rank for sorting (higher = more severe)."""
    return {"NONE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}.get(severity, 0)


def compute_risk_rating(
    fusion_score: float,
    is_memory_poison: bool = False,
    attack_type: str = "unknown",
) -> float:
    """
    Extended risk rating that considers attack context.
    Memory poisoning attacks get a +0.1 multiplier (more dangerous).
    Returns clamped 0.0-1.0 float.
    """
    rating = fusion_score
    if is_memory_poison:
        rating = min(1.0, rating + 0.10)
    if attack_type in ("data_extraction", "indirect_injection"):
        rating = min(1.0, rating + 0.05)
    return round(rating, 4)
