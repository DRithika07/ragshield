"""
analysis.py — AI-Powered Threat Analysis Routes
═════════════════════════════════════════════════
POST /api/v1/analyze           — deep Gemini analysis of a threat
GET  /api/v1/analyze/{id}      — fetch stored analysis by ThreatLog ID
"""

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ThreatLog
from app.dependencies import get_classifier_service, get_database, require_gemini, verify_api_key
from app.models.request import PromptDetectionRequest
from app.models.response import BaseResponse
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post(
    "",
    summary="Deep AI analysis of a prompt",
    dependencies=[Depends(require_gemini)],
)
async def analyze_prompt(
    request: PromptDetectionRequest,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
    classifier=Depends(get_classifier_service),
):
    """
    Run deep analysis on a prompt:
    1. Classify the prompt
    2. Call Gemini for detailed threat explanation
    3. Generate mitigation steps
    4. Return full analysis
    """
    from app.dependencies import get_embedding_service, get_gemini_service
    embedding_svc = get_embedding_service()
    gemini_svc = get_gemini_service()

    embedding, _ = await embedding_svc.aembed(request.prompt)
    clf = await classifier.aclassify(request.prompt, embedding=embedding)

    explanation = await gemini_svc.explain_threat(
        prompt_text=request.prompt,
        attack_type=clf["attack_type"],
        fusion_score=clf["fusion_score"],
        severity=clf["severity"],
        similar_examples=clf.get("top_similar", []),
    )

    mitigation = []
    if clf["is_malicious"]:
        mitigation = await gemini_svc.generate_mitigation(
            prompt_text=request.prompt,
            attack_type=clf["attack_type"],
            severity=clf["severity"],
        )

    return {
        "success": True,
        "classification": clf,
        "ai_explanation": explanation,
        "mitigation_steps": mitigation,
    }


@router.get(
    "/{threat_id}",
    summary="Fetch stored analysis for a threat log entry",
)
async def get_analysis(
    threat_id: str = Path(..., description="ThreatLog UUID"),
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
):
    """Retrieve the stored AI explanation for a previously analyzed threat."""
    result = await db.execute(
        select(ThreatLog).where(ThreatLog.id == threat_id)
    )
    log_entry = result.scalar_one_or_none()

    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ThreatLog with id '{threat_id}' not found",
        )

    return {
        "success": True,
        "threat_id": threat_id,
        "ai_explanation": log_entry.ai_explanation,
        "mitigation_steps": log_entry.mitigation_steps,
        "attack_type": log_entry.attack_type,
        "severity": log_entry.severity,
        "fusion_score": log_entry.fusion_score,
    }
