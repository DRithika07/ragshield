"""
detection_agent.py — Detection Agent
══════════════════════════════════════
Validates and enriches the pre-computed classification result.
Adds semantic context from the threat library to the state.
"""

from typing import Any, Dict

from app.utils.logger import get_logger

log = get_logger(__name__)


class DetectionAgent:
    """
    Detection Agent — first node in the LangGraph pipeline.

    Responsibilities:
    - Validate the incoming classification data
    - Enrich state with attack type context
    - Log detection event for pipeline audit trail
    - Set severity normalisation (ensures consistency)
    """

    async def run(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process the state from the orchestrator.
        Returns updated fields to merge into AgentState.
        """
        log.bind(agent="DetectionAgent").info(
            f"Processing threat_id={state.get('threat_id', 'N/A')[:8]} "
            f"severity={state.get('severity')} "
            f"score={state.get('fusion_score', 0):.3f}"
        )

        clf = state.get("classification", {})

        # Validate and normalise severity
        valid_severities = {"NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"}
        severity = clf.get("severity", "LOW")
        if severity not in valid_severities:
            severity = "LOW"

        # Enrich attack type with readable display name
        attack_type = clf.get("attack_type", "unknown")
        attack_display_map = {
            "jailbreak": "Jailbreak Attempt",
            "prompt_injection": "Prompt Injection",
            "role_hijacking": "Role Hijacking",
            "data_extraction": "Data Extraction Attempt",
            "indirect_injection": "Indirect Injection",
            "safe": "Safe Input",
            "unknown": "Unknown Attack",
        }

        return {
            "predicted_label": clf.get("predicted_label", 0),
            "ml_score": clf.get("ml_score", 0.0),
            "similarity_score": clf.get("similarity_score", 0.0),
            "fusion_score": clf.get("fusion_score", 0.0),
            "severity": severity,
            "attack_type": attack_type,
            "is_malicious": clf.get("is_malicious", False),
            "attack_narrative": attack_display_map.get(attack_type, "Unknown Pattern"),
        }
