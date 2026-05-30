"""
detection.py — Prompt Injection Detection Routes
══════════════════════════════════════════════════
POST /api/v1/detect         — single prompt detection (full agent pipeline)
POST /api/v1/detect/batch   — batch detection (embedding service optimized)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ThreatLog
from app.dependencies import (
    get_classifier_service,
    get_database,
    get_embedding_service,
    get_chroma_service,
    verify_api_key,
)
from app.models.request import BatchDetectionRequest, PromptDetectionRequest
from app.models.response import (
    BatchDetectionResponse,
    DetectionResponse,
    ThreatResult,
)
from app.utils.logger import get_logger
from app.utils.preprocessing import sha256_hash

log = get_logger(__name__)
router = APIRouter()


@router.post(
    "",
    response_model=DetectionResponse,
    summary="Detect prompt injection in a single prompt",
)
async def detect_single(
    request: PromptDetectionRequest,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
    classifier=Depends(get_classifier_service),
    embedding_svc=Depends(get_embedding_service),
    chroma_svc=Depends(get_chroma_service),
):
    """
    Full detection pipeline for a single prompt.

    Flow:
      1. Generate embedding
      2. Classify (ML + vector similarity)
      3. If run_agents=True → trigger LangGraph pipeline (explanation + mitigation)
      4. Log to SQLite + ChromaDB
      5. Return structured result
    """
    req_id = request.session_id or str(uuid.uuid4())[:8]
    bound_log = log.bind(request_id=req_id)
    bound_log.info(f"Detection request. prompt_len={len(request.prompt)}")

    # Step 1 + 2: Embed and classify
    embedding, prompt_hash = await embedding_svc.aembed(request.prompt)
    classification = await classifier.aclassify(request.prompt, embedding=embedding)

    threat_id = str(uuid.uuid4())
    session_id = request.session_id or str(uuid.uuid4())

    # Step 3: Run agent pipeline if requested
    ai_explanation = None
    mitigation_steps = None
    agent_steps = []

    if request.run_agents and classification["is_malicious"]:
        try:
            from app.agents.orchestrator import run_agent_pipeline
            pipeline_result = await run_agent_pipeline(
                threat_id=threat_id,
                prompt_text=request.prompt,
                classification=classification,
            )
            ai_explanation = pipeline_result.get("ai_explanation")
            mitigation_steps = pipeline_result.get("mitigation_steps")
            agent_steps = pipeline_result.get("agent_steps", [])
        except Exception as e:
            bound_log.error(f"Agent pipeline failed: {e}. Returning basic result.")

    # Step 4: Persist to SQLite
    threat_log = ThreatLog(
        id=threat_id,
        session_id=session_id,
        prompt_text=request.prompt,
        prompt_hash=prompt_hash,
        predicted_label=classification["predicted_label"],
        ml_score=classification["ml_score"],
        similarity_score=classification["similarity_score"],
        fusion_score=classification["fusion_score"],
        severity=classification["severity"],
        attack_type=classification["attack_type"],
        ai_explanation=ai_explanation,
        mitigation_steps=str(mitigation_steps) if mitigation_steps else None,
        embedding_model=embedding_svc._model_name,
    )
    db.add(threat_log)
    await db.flush()

    # Step 4b: Persist embedding to ChromaDB detection_history
    await embedding_svc.aembed(request.prompt)  # already cached
    import asyncio
    await asyncio.to_thread(
        chroma_svc.upsert_detection,
        threat_id,
        request.prompt,
        embedding,
        {
            "threat_score": classification["fusion_score"],
            "predicted_label": classification["predicted_label"],
            "session_id": session_id,
            "severity": classification["severity"],
        },
    )

    bound_log.info(
        f"Detection complete. "
        f"label={classification['predicted_label']} "
        f"score={classification['fusion_score']:.3f} "
        f"severity={classification['severity']}"
    )

    threat_result = ThreatResult(
        threat_id=threat_id,
        prompt_text=request.prompt,
        predicted_label=classification["predicted_label"],
        is_malicious=classification["is_malicious"],
        ml_score=classification["ml_score"],
        similarity_score=classification["similarity_score"],
        fusion_score=classification["fusion_score"],
        severity=classification["severity"],
        attack_type=classification["attack_type"],
        detected_at=datetime.now(timezone.utc),
    )

    return DetectionResponse(
        success=True,
        message="Detection complete",
        data=threat_result,
        agent_steps=agent_steps,
        ai_explanation=ai_explanation,
        mitigation_steps=mitigation_steps,
    )


@router.post(
    "/batch",
    response_model=BatchDetectionResponse,
    summary="Batch detect prompt injection across multiple prompts",
)
async def detect_batch(
    request: BatchDetectionRequest,
    _auth=Depends(verify_api_key),
    classifier=Depends(get_classifier_service),
):
    """
    Classify multiple prompts in a single request.
    Uses batched embedding for efficiency (~4x faster than one-by-one).
    Does NOT run agent pipeline (too slow for batch mode).
    """
    log.info(f"Batch detection. count={len(request.prompts)}")

    classifications = await classifier.aclassify_batch(request.prompts)

    results = []
    for i, (prompt, clf) in enumerate(zip(request.prompts, classifications)):
        results.append(ThreatResult(
            threat_id=str(uuid.uuid4()),
            prompt_text=prompt,
            predicted_label=clf["predicted_label"],
            is_malicious=clf["is_malicious"],
            ml_score=clf["ml_score"],
            similarity_score=clf["similarity_score"],
            fusion_score=clf["fusion_score"],
            severity=clf["severity"],
            attack_type=clf["attack_type"],
            detected_at=datetime.now(timezone.utc),
        ))

    malicious_count = sum(1 for r in results if r.is_malicious)

    return BatchDetectionResponse(
        success=True,
        message=f"Batch detection complete. {malicious_count}/{len(results)} malicious.",
        total=len(results),
        malicious_count=malicious_count,
        safe_count=len(results) - malicious_count,
        results=results,
    )
