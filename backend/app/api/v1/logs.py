"""
logs.py — Attack Log Routes
════════════════════════════
GET    /api/v1/logs        — paginated list of threat events
GET    /api/v1/logs/{id}   — single log entry detail
DELETE /api/v1/logs/{id}   — remove a log entry
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ThreatLog
from app.dependencies import get_database, verify_api_key
from app.models.response import ThreatLogEntry, ThreatLogListResponse
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("", response_model=ThreatLogListResponse)
async def list_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    severity: str = Query(default=None),
    is_malicious: bool = Query(default=None),
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Return paginated, filterable threat event log."""
    query = select(ThreatLog).order_by(ThreatLog.created_at.desc())

    if severity:
        query = query.where(ThreatLog.severity == severity.upper())
    if is_malicious is not None:
        query = query.where(ThreatLog.predicted_label == (1 if is_malicious else 0))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    rows = (await db.execute(query)).scalars().all()

    entries = [
        ThreatLogEntry(
            id=r.id,
            session_id=r.session_id,
            prompt_text=r.prompt_text[:200],
            predicted_label=r.predicted_label,
            is_malicious=r.predicted_label == 1,
            fusion_score=r.fusion_score,
            severity=r.severity,
            attack_type=r.attack_type,
            is_memory_poison=r.is_memory_poison,
            report_generated=r.report_generated,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return ThreatLogListResponse(
        success=True,
        message="OK",
        data=entries,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{log_id}")
async def get_log(
    log_id: str,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    result = await db.execute(select(ThreatLog).where(ThreatLog.id == log_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Log entry not found")

    return {
        "success": True,
        "data": {
            "id": entry.id,
            "session_id": entry.session_id,
            "prompt_text": entry.prompt_text,
            "predicted_label": entry.predicted_label,
            "ml_score": entry.ml_score,
            "similarity_score": entry.similarity_score,
            "fusion_score": entry.fusion_score,
            "severity": entry.severity,
            "attack_type": entry.attack_type,
            "ai_explanation": entry.ai_explanation,
            "mitigation_steps": entry.mitigation_steps,
            "is_memory_poison": entry.is_memory_poison,
            "report_generated": entry.report_generated,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        },
    }


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log(
    log_id: str,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    result = await db.execute(select(ThreatLog).where(ThreatLog.id == log_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Log entry not found")
    await db.delete(entry)
