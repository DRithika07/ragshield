"""
dashboard.py — Dashboard Statistics Routes
══════════════════════════════════════════
GET /api/v1/dashboard/stats    — summary counts and metrics
GET /api/v1/dashboard/timeline — threat events grouped by hour
GET /api/v1/dashboard/heatmap  — severity distribution data
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ThreatLog
from app.dependencies import get_database, verify_api_key
from app.models.response import (
    DashboardStats,
    DashboardStatsResponse,
    DashboardTimelineResponse,
    TimelineEvent,
)
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Return summary statistics for the main SOC dashboard."""
    rows = (await db.execute(select(ThreatLog))).scalars().all()

    total = len(rows)
    malicious = sum(1 for r in rows if r.predicted_label == 1)
    safe = total - malicious

    severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    poison_count = 0
    score_sum = 0.0

    for r in rows:
        if r.severity in severity_counts:
            severity_counts[r.severity] += 1
        if r.is_memory_poison:
            poison_count += 1
        score_sum += r.fusion_score

    avg_score = round(score_sum / total, 3) if total > 0 else 0.0

    return DashboardStatsResponse(
        success=True,
        message="OK",
        data=DashboardStats(
            total_analyzed=total,
            total_malicious=malicious,
            total_safe=safe,
            critical_count=severity_counts["CRITICAL"],
            high_count=severity_counts["HIGH"],
            medium_count=severity_counts["MEDIUM"],
            low_count=severity_counts["LOW"],
            memory_poison_attempts=poison_count,
            avg_fusion_score=avg_score,
        ),
    )


@router.get("/timeline", response_model=DashboardTimelineResponse)
async def get_timeline(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Return threat counts grouped by hour for the timeline chart."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (
        await db.execute(
            select(ThreatLog).where(ThreatLog.created_at >= since)
        )
    ).scalars().all()

    # Group by hour bucket
    buckets: dict = {}
    for row in rows:
        if row.created_at:
            dt = row.created_at.replace(minute=0, second=0, microsecond=0)
            key = dt.isoformat()
            if key not in buckets:
                buckets[key] = {"timestamp": dt, "malicious": 0, "safe": 0, "critical": 0}
            if row.predicted_label == 1:
                buckets[key]["malicious"] += 1
            else:
                buckets[key]["safe"] += 1
            if row.severity == "CRITICAL":
                buckets[key]["critical"] += 1

    events = [
        TimelineEvent(
            timestamp=v["timestamp"],
            malicious_count=v["malicious"],
            safe_count=v["safe"],
            critical_count=v["critical"],
        )
        for v in sorted(buckets.values(), key=lambda x: x["timestamp"])
    ]

    return DashboardTimelineResponse(success=True, message="OK", data=events)


@router.get("/heatmap")
async def get_heatmap(
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Return attack type × severity distribution for the heatmap chart."""
    rows = (await db.execute(select(ThreatLog))).scalars().all()

    heatmap: dict = {}
    for r in rows:
        if r.predicted_label != 1:
            continue
        atype = r.attack_type or "unknown"
        sev = r.severity or "LOW"
        key = f"{atype}|{sev}"
        heatmap[key] = heatmap.get(key, 0) + 1

    cells = [
        {"attack_type": k.split("|")[0], "severity": k.split("|")[1], "count": v}
        for k, v in heatmap.items()
    ]

    return {"success": True, "data": cells}
