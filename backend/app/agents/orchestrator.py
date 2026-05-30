"""
orchestrator.py — LangGraph Agent Pipeline Orchestrator
════════════════════════════════════════════════════════
Defines and compiles the 4-agent LangGraph state machine.

State flows:
  START
    ↓
  DetectionNode    (validate + enrich classification)
    ↓
  AnalysisNode     (Gemini explanation + attack narrative)
    ↓
  MitigationNode   (countermeasure generation)
    ↓
  ReportNode       (PDF generation + DB logging)
    ↓
  END

Each node receives the full AgentState, enriches it,
and returns the updated state. LangGraph handles routing.

The compiled graph is a singleton — built once at first call,
then reused for all subsequent pipeline runs.
"""

import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from app.utils.logger import get_logger

log = get_logger(__name__)

# ── Compiled graph singleton ──────────────────────────────────────────
_compiled_graph = None


# ── Agent State Definition ─────────────────────────────────────────────
class AgentState(TypedDict):
    """
    Shared state object that flows through all agent nodes.
    Every agent reads from and writes to this state.
    LangGraph tracks which fields were updated by which node.
    """
    # Input
    threat_id: str
    prompt_text: str
    session_id: str

    # Detection results (populated by detection agent)
    classification: Dict[str, Any]
    ml_score: float
    similarity_score: float
    fusion_score: float
    severity: str
    attack_type: str
    is_malicious: bool
    predicted_label: int

    # Analysis results (populated by analysis agent)
    ai_explanation: Optional[str]
    attack_narrative: Optional[str]

    # Mitigation results (populated by mitigation agent)
    mitigation_steps: Optional[List[str]]
    mitigation_action: Optional[str]    # "block" | "sanitize" | "monitor"

    # Report results (populated by report agent)
    report_id: Optional[str]
    report_path: Optional[str]

    # Pipeline metadata
    agent_steps: List[Dict]
    pipeline_start_time: float
    errors: List[str]


# ── Node Builders ─────────────────────────────────────────────────────

def build_detection_node():
    """
    Detection Agent node.
    Validates and enriches the incoming classification result.
    In a full system this could re-run classification — here it
    validates the pre-computed result and logs to ChromaDB.
    """
    from app.agents.detection_agent import DetectionAgent
    agent = DetectionAgent()

    async def detection_node(state: AgentState) -> AgentState:
        step_start = time.perf_counter()
        try:
            result = await agent.run(state)
            duration_ms = int((time.perf_counter() - step_start) * 1000)
            state["agent_steps"].append({
                "agent_name": "DetectionAgent",
                "status": "complete",
                "output_summary": (
                    f"Label={result.get('predicted_label')} "
                    f"Score={result.get('fusion_score', 0):.3f} "
                    f"Severity={result.get('severity')}"
                ),
                "duration_ms": duration_ms,
            })
            state.update(result)
        except Exception as e:
            log.error(f"DetectionAgent error: {e}")
            state["errors"].append(f"DetectionAgent: {str(e)}")
            state["agent_steps"].append({
                "agent_name": "DetectionAgent",
                "status": "failed",
                "output_summary": f"Error: {str(e)}",
                "duration_ms": 0,
            })
        return state

    return detection_node


def build_analysis_node():
    from app.agents.analysis_agent import AnalysisAgent
    agent = AnalysisAgent()

    async def analysis_node(state: AgentState) -> AgentState:
        step_start = time.perf_counter()
        try:
            result = await agent.run(state)
            duration_ms = int((time.perf_counter() - step_start) * 1000)
            state["agent_steps"].append({
                "agent_name": "AnalysisAgent",
                "status": "complete",
                "output_summary": (
                    f"Explanation generated ({len(result.get('ai_explanation') or '')} chars)"
                ),
                "duration_ms": duration_ms,
            })
            state["ai_explanation"] = result.get("ai_explanation")
            state["attack_narrative"] = result.get("attack_narrative")
        except Exception as e:
            log.error(f"AnalysisAgent error: {e}")
            state["errors"].append(f"AnalysisAgent: {str(e)}")
            state["agent_steps"].append({
                "agent_name": "AnalysisAgent",
                "status": "failed",
                "output_summary": f"Error: {str(e)}",
                "duration_ms": 0,
            })
        return state

    return analysis_node


def build_mitigation_node():
    from app.agents.mitigation_agent import MitigationAgent
    agent = MitigationAgent()

    async def mitigation_node(state: AgentState) -> AgentState:
        step_start = time.perf_counter()
        try:
            result = await agent.run(state)
            duration_ms = int((time.perf_counter() - step_start) * 1000)
            steps = result.get("mitigation_steps") or []
            state["agent_steps"].append({
                "agent_name": "MitigationAgent",
                "status": "complete",
                "output_summary": f"{len(steps)} mitigation steps generated",
                "duration_ms": duration_ms,
            })
            state["mitigation_steps"] = steps
            state["mitigation_action"] = result.get("mitigation_action", "block")
        except Exception as e:
            log.error(f"MitigationAgent error: {e}")
            state["errors"].append(f"MitigationAgent: {str(e)}")
            state["agent_steps"].append({
                "agent_name": "MitigationAgent",
                "status": "failed",
                "output_summary": f"Error: {str(e)}",
                "duration_ms": 0,
            })
        return state

    return mitigation_node


def build_report_node():
    from app.agents.report_agent import ReportAgent
    agent = ReportAgent()

    async def report_node(state: AgentState) -> AgentState:
        step_start = time.perf_counter()
        try:
            result = await agent.run(state)
            duration_ms = int((time.perf_counter() - step_start) * 1000)
            state["agent_steps"].append({
                "agent_name": "ReportAgent",
                "status": "complete",
                "output_summary": f"Report ID: {result.get('report_id', 'N/A')}",
                "duration_ms": duration_ms,
            })
            state["report_id"] = result.get("report_id")
            state["report_path"] = result.get("report_path")
        except Exception as e:
            log.error(f"ReportAgent error: {e}")
            state["errors"].append(f"ReportAgent: {str(e)}")
            state["agent_steps"].append({
                "agent_name": "ReportAgent",
                "status": "failed",
                "output_summary": f"Error: {str(e)}",
                "duration_ms": 0,
            })
        return state

    return report_node


# ── Graph Builder ─────────────────────────────────────────────────────

def _build_graph():
    """
    Compile the LangGraph StateGraph.
    Called once; result is cached in _compiled_graph.

    Graph topology:
      START → detection → analysis → mitigation → report → END
    All edges are unconditional (every agent always runs).
    For conditional routing (e.g. skip analysis for safe prompts),
    add conditional_edges() based on state["is_malicious"].
    """
    try:
        from langgraph.graph import END, START, StateGraph

        graph = StateGraph(AgentState)

        # Register nodes
        graph.add_node("detection", build_detection_node())
        graph.add_node("analysis", build_analysis_node())
        graph.add_node("mitigation", build_mitigation_node())
        graph.add_node("report", build_report_node())

        # Define edges (execution order)
        graph.add_edge(START, "detection")
        graph.add_edge("detection", "analysis")
        graph.add_edge("analysis", "mitigation")
        graph.add_edge("mitigation", "report")
        graph.add_edge("report", END)

        compiled = graph.compile()
        log.info("LangGraph pipeline compiled successfully")
        return compiled

    except ImportError as e:
        log.error(f"LangGraph import failed: {e}. Falling back to sequential runner.")
        return None


def _get_graph():
    """Return the cached compiled graph, building it if necessary."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_graph()
    return _compiled_graph


# ── Public Pipeline Entry Point ───────────────────────────────────────

async def run_agent_pipeline(
    threat_id: str,
    prompt_text: str,
    classification: Dict[str, Any],
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the full 4-agent pipeline for a detected threat.

    This is the single entry point called by:
      - POST /api/v1/detect (when run_agents=True)
      - POST /api/v1/agents/run

    Returns dict with:
      ai_explanation, mitigation_steps, agent_steps, report_id
    """
    start_time = time.perf_counter()

    initial_state: AgentState = {
        "threat_id": threat_id,
        "prompt_text": prompt_text,
        "session_id": session_id or str(uuid.uuid4()),
        "classification": classification,
        "ml_score": classification.get("ml_score", 0.0),
        "similarity_score": classification.get("similarity_score", 0.0),
        "fusion_score": classification.get("fusion_score", 0.0),
        "severity": classification.get("severity", "LOW"),
        "attack_type": classification.get("attack_type", "unknown"),
        "is_malicious": classification.get("is_malicious", False),
        "predicted_label": classification.get("predicted_label", 0),
        "ai_explanation": None,
        "attack_narrative": None,
        "mitigation_steps": None,
        "mitigation_action": None,
        "report_id": None,
        "report_path": None,
        "agent_steps": [],
        "pipeline_start_time": start_time,
        "errors": [],
    }

    graph = _get_graph()

    if graph is not None:
        # LangGraph execution
        try:
            final_state = await graph.ainvoke(initial_state)
        except Exception as e:
            log.error(f"LangGraph pipeline error: {e}")
            final_state = await _sequential_fallback(initial_state)
    else:
        # Sequential fallback (if LangGraph import fails)
        final_state = await _sequential_fallback(initial_state)

    total_ms = int((time.perf_counter() - start_time) * 1000)
    log.info(
        f"Agent pipeline complete. "
        f"threat_id={threat_id[:8]} "
        f"total={total_ms}ms "
        f"errors={len(final_state.get('errors', []))}"
    )

    return {
        "ai_explanation": final_state.get("ai_explanation"),
        "mitigation_steps": final_state.get("mitigation_steps"),
        "agent_steps": final_state.get("agent_steps", []),
        "report_id": final_state.get("report_id"),
        "errors": final_state.get("errors", []),
        "total_duration_ms": total_ms,
    }


async def _sequential_fallback(state: AgentState) -> AgentState:
    """
    Run agents sequentially without LangGraph.
    Used when LangGraph is unavailable or fails.
    """
    log.warning("Using sequential fallback for agent pipeline")

    for node_builder in [
        build_detection_node,
        build_analysis_node,
        build_mitigation_node,
        build_report_node,
    ]:
        try:
            node_fn = node_builder()
            state = await node_fn(state)
        except Exception as e:
            log.error(f"Sequential fallback error: {e}")

    return state
