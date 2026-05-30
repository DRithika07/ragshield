"""
mitigation_agent.py — Mitigation Agent
════════════════════════════════════════
Generates countermeasures and recommends a mitigation action.
Third node in the LangGraph pipeline.
"""

from typing import Any, Dict, List

from app.utils.logger import get_logger

log = get_logger(__name__)


class MitigationAgent:
    """
    Mitigation Agent — determines and generates countermeasures.

    Responsibilities:
    - Determine the appropriate mitigation action (block/sanitize/monitor)
    - Generate ordered mitigation steps via Gemini (with fallback)
    - Recommend RAG memory actions if memory poisoning is detected
    """

    # Severity → mitigation action mapping
    SEVERITY_ACTION_MAP = {
        "CRITICAL": "block",
        "HIGH": "block",
        "MEDIUM": "sanitize",
        "LOW": "monitor",
        "NONE": "allow",
    }

    async def run(self, state: Dict[str, Any]) -> Dict[str, Any]:
        bound_log = log.bind(agent="MitigationAgent")

        if not state.get("is_malicious"):
            return {
                "mitigation_steps": ["No mitigation required — input is safe."],
                "mitigation_action": "allow",
            }

        severity = state.get("severity", "MEDIUM")
        attack_type = state.get("attack_type", "unknown")
        mitigation_action = self.SEVERITY_ACTION_MAP.get(severity, "monitor")

        bound_log.info(
            f"Generating mitigation. "
            f"severity={severity} action={mitigation_action}"
        )

        # Attempt Gemini-powered mitigation generation
        steps = None
        try:
            from app.dependencies import get_gemini_service
            gemini = get_gemini_service()
            steps = await gemini.generate_mitigation(
                prompt_text=state.get("prompt_text", ""),
                attack_type=attack_type,
                severity=severity,
            )
        except Exception as e:
            bound_log.warning(f"Gemini mitigation failed: {e}. Using rule-based fallback.")

        if not steps:
            steps = self._rule_based_mitigation(attack_type, severity, mitigation_action)

        bound_log.info(f"{len(steps)} mitigation steps generated")
        return {
            "mitigation_steps": steps,
            "mitigation_action": mitigation_action,
        }

    @staticmethod
    def _rule_based_mitigation(
        attack_type: str,
        severity: str,
        action: str,
    ) -> List[str]:
        """
        Rule-based fallback mitigation when Gemini is unavailable.
        Provides attack-type-specific steps.
        """
        base_steps = [
            f"Step 1: {action.capitalize()} this request at the API gateway layer.",
            "Step 2: Log the full request payload with session metadata for audit.",
            "Step 3: Add the prompt embedding fingerprint to the threat library.",
        ]

        specific = {
            "jailbreak": [
                "Step 4: Strengthen system prompt boundary enforcement.",
                "Step 5: Implement instruction hierarchy validation before each LLM call.",
            ],
            "prompt_injection": [
                "Step 4: Apply input sanitization — strip instruction-like patterns.",
                "Step 5: Use a separate LLM call to validate input intent before processing.",
            ],
            "role_hijacking": [
                "Step 4: Reinforce persona anchoring in the system prompt.",
                "Step 5: Implement output monitoring for identity-inconsistent responses.",
            ],
            "data_extraction": [
                "Step 4: Audit RAG retrieval scope — restrict to necessary documents.",
                "Step 5: Enable output filtering to prevent sensitive data leakage.",
            ],
            "memory_poison": [
                "Step 4: Quarantine the flagged document in RAG memory.",
                "Step 5: Re-run full memory scan and rebuild vector store from clean backup.",
            ],
        }

        return base_steps + specific.get(attack_type, [
            "Step 4: Escalate to security team for manual review.",
            "Step 5: Update threat detection rules based on this attack pattern.",
        ])
