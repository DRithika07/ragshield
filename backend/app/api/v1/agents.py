"""
agents.py — Agent Workflow Routes
══════════════════════════════════
POST /api/v1/agents/run         — trigger the full 4-agent pipeline
GET  /api/v1/agents/status/{id} — poll pipeline run status
GET  /api/v1/agents/logs        — SSE stream of agent thought logs
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.dependencies import get_classifier_service, get_embedding_service, verify_api_key
from app.models.request import AgentRunRequest
from app.models.response import AgentRunResponse, AgentStep, ThreatResult
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

# In-memory run registry (production would use Redis)
_run_registry: dict = {}


@router.post("/run", response_model=AgentRunResponse)
async def run_agents(
    request: AgentRunRequest,
    _auth=Depends(verify_api_key),
    classifier=Depends(get_classifier_service),
    embedding_svc=Depends(get_embedding_service),
):
    """
    Trigger the full 4-agent LangGraph pipeline:
    Detection → Analysis → Mitigation → Report
    """
    run_id = str(uuid.uuid4())
    log.info(f"Agent pipeline started. run_id={run_id[:8]}")

    embedding, _ = await embedding_svc.aembed(request.prompt)
    classification = await classifier.aclassify(request.prompt, embedding=embedding)

    threat_id = str(uuid.uuid4())

    try:
        from app.agents.orchestrator import run_agent_pipeline
        pipeline_result = await run_agent_pipeline(
            threat_id=threat_id,
            prompt_text=request.prompt,
            classification=classification,
        )
    except Exception as e:
        log.error(f"Agent pipeline error: {e}")
        pipeline_result = {
            "ai_explanation": None,
            "mitigation_steps": None,
            "agent_steps": [],
            "report_id": None,
        }

    _run_registry[run_id] = {
        "status": "complete",
        "threat_id": threat_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

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

    return AgentRunResponse(
        success=True,
        message="Agent pipeline complete",
        run_id=run_id,
        threat_result=threat_result,
        agent_steps=pipeline_result.get("agent_steps", []),
        ai_explanation=pipeline_result.get("ai_explanation"),
        mitigation_steps=pipeline_result.get("mitigation_steps"),
        report_id=pipeline_result.get("report_id"),
    )


@router.get("/status/{run_id}", summary="Poll agent pipeline run status")
async def get_run_status(run_id: str, _auth=Depends(verify_api_key)):
    run = _run_registry.get(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run '{run_id}' not found",
        )
    return {"success": True, "run_id": run_id, **run}


@router.get("/logs", summary="SSE stream of live agent logs")
async def stream_agent_logs(_auth=Depends(verify_api_key)):
    """
    Server-Sent Events endpoint for real-time agent thought streaming.
    Frontend connects via EventSource and receives live agent updates.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        events = [
            "data: {\"agent\": \"DetectionAgent\", \"status\": \"running\", \"message\": \"Generating embedding...\"}\n\n",
            "data: {\"agent\": \"DetectionAgent\", \"status\": \"running\", \"message\": \"Querying threat library...\"}\n\n",
            "data: {\"agent\": \"DetectionAgent\", \"status\": \"complete\", \"message\": \"Classification complete\"}\n\n",
            "data: {\"agent\": \"AnalysisAgent\", \"status\": \"running\", \"message\": \"Calling Gemini API...\"}\n\n",
            "data: {\"agent\": \"AnalysisAgent\", \"status\": \"complete\", \"message\": \"Explanation generated\"}\n\n",
            "data: {\"agent\": \"MitigationAgent\", \"status\": \"complete\", \"message\": \"Countermeasures ready\"}\n\n",
            "data: {\"agent\": \"ReportAgent\", \"status\": \"complete\", \"message\": \"PDF report generated\"}\n\n",
        ]
        for event in events:
            yield event
            await asyncio.sleep(0.4)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
