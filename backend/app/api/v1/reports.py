"""
reports.py — PDF Incident Report Routes
═════════════════════════════════════════
POST /api/v1/reports/generate — generate a PDF report
GET  /api/v1/reports/{id}     — download a generated PDF
GET  /api/v1/reports          — list all reports
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import IncidentReport, ThreatLog
from app.dependencies import get_database, verify_api_key
from app.models.request import ReportGenerateRequest
from app.models.response import ReportGenerateResponse, ReportListResponse, ReportMeta
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/generate", response_model=ReportGenerateResponse)
async def generate_report(
    request: ReportGenerateRequest,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Generate a PDF incident report for specified threat log IDs."""
    # Fetch threat logs
    rows = (
        await db.execute(
            select(ThreatLog).where(ThreatLog.id.in_(request.threat_log_ids))
        )
    ).scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail="No threat logs found for given IDs")

    # Build report metadata
    report_id = str(uuid.uuid4())
    title = request.report_title or f"Sentinel-RAG Incident Report — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    file_name = f"report_{report_id[:8]}.pdf"
    file_path = str(Path(settings.report_output_dir) / file_name)

    os.makedirs(settings.report_output_dir, exist_ok=True)

    # Generate PDF using report service
    from app.services.report_service import ReportService
    svc = ReportService()

    threat_dicts = [
        {
            "id": r.id,
            "prompt_text": r.prompt_text,
            "predicted_label": r.predicted_label,
            "is_malicious": r.predicted_label == 1,
            "fusion_score": r.fusion_score,
            "severity": r.severity,
            "attack_type": r.attack_type,
            "ai_explanation": r.ai_explanation,
            "mitigation_steps": r.mitigation_steps,
            "is_memory_poison": r.is_memory_poison,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in rows
    ]

    file_size = await svc.generate_pdf(
        file_path=file_path,
        report_title=title,
        threat_logs=threat_dicts,
    )

    # Persist report metadata to DB
    report_record = IncidentReport(
        id=report_id,
        threat_log_id=request.threat_log_ids[0] if len(request.threat_log_ids) == 1 else None,
        report_title=title,
        file_name=file_name,
        file_path=file_path,
        file_size_bytes=file_size,
        report_type="single" if len(rows) == 1 else "batch",
        generated_by="ReportAgent",
    )
    db.add(report_record)
    await db.flush()

    return ReportGenerateResponse(
        success=True,
        message="PDF report generated",
        data=ReportMeta(
            report_id=report_id,
            report_title=title,
            file_name=file_name,
            report_type=report_record.report_type,
            threat_log_id=report_record.threat_log_id,
            created_at=datetime.now(timezone.utc),
        ),
        download_url=f"{settings.api_prefix}/reports/{report_id}",
    )


@router.get("/{report_id}")
async def download_report(
    report_id: str,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Download a generated PDF report by ID."""
    result = await db.execute(
        select(IncidentReport).where(IncidentReport.id == report_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Report not found")
    if not Path(record.file_path).exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    return FileResponse(
        path=record.file_path,
        media_type="application/pdf",
        filename=record.file_name,
    )


@router.get("", response_model=ReportListResponse)
async def list_reports(
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """List all generated incident reports."""
    rows = (
        await db.execute(select(IncidentReport).order_by(IncidentReport.created_at.desc()))
    ).scalars().all()

    reports = [
        ReportMeta(
            report_id=r.id,
            report_title=r.report_title,
            file_name=r.file_name,
            report_type=r.report_type,
            threat_log_id=r.threat_log_id,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return ReportListResponse(success=True, message="OK", data=reports, total=len(reports))
