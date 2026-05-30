"""
analysis_agent.py — Analysis Agent
════════════════════════════════════
Calls Gemini API to generate a human-readable explanation of the threat.
Second node in the LangGraph pipeline.
"""

from typing import Any, Dict

from app.utils.logger import get_logger

log = get_logger(__name__)


class AnalysisAgent:
    """
    Analysis Agent — generates AI-powered threat explanations.

    Responsibilities:
    - Call Gemini API with threat context
    - Generate natural language explanation
    - Describe the attack narrative for the dashboard
    - Gracefully degrade if Gemini is unavailable
    """

    async def run(self, state: Dict[str, Any]) -> Dict[str, Any]:
        bound_log = log.bind(agent="AnalysisAgent")
        bound_log.info(
            f"Analyzing threat. "
            f"attack_type={state.get('attack_type')} "
            f"severity={state.get('severity')}"
        )

        # Skip analysis for safe inputs (no need to call Gemini)
        if not state.get("is_malicious"):
            bound_log.info("Input classified as safe — skipping Gemini analysis")
            return {
                "ai_explanation": "Input classified as safe. No threat analysis required.",
                "attack_narrative": "Safe Input",
            }

        # Attempt Gemini analysis
        try:
            from app.dependencies import get_gemini_service
            gemini = get_gemini_service()

            clf = state.get("classification", {})
            explanation = await gemini.explain_threat(
                prompt_text=state.get("prompt_text", ""),
                attack_type=state.get("attack_type", "unknown"),
                fusion_score=state.get("fusion_score", 0.0),
                severity=state.get("severity", "LOW"),
                similar_examples=clf.get("top_similar", []),
            )

            bound_log.info(f"Gemini explanation generated ({len(explanation)} chars)")
            return {
                "ai_explanation": explanation,
                "attack_narrative": state.get("attack_narrative", "Threat Detected"),
            }

        except RuntimeError:
            # Gemini API key not configured
            bound_log.warning("Gemini unavailable — using fallback explanation")
            return {
                "ai_explanation": self._fallback_explanation(state),
                "attack_narrative": state.get("attack_narrative", "Threat Detected"),
            }
        except Exception as e:
            bound_log.error(f"AnalysisAgent Gemini call failed: {e}")
            return {
                "ai_explanation": self._fallback_explanation(state),
                "attack_narrative": state.get("attack_narrative", "Threat Detected"),
            }

    @staticmethod
    def _fallback_explanation(state: Dict) -> str:
        severity = state.get("severity", "UNKNOWN")
        attack_type = state.get("attack_type", "unknown").replace("_", " ")
        score = state.get("fusion_score", 0)
        return (
            f"A {severity} severity {attack_type} was detected with a threat score "
            f"of {score:.2f}/1.00. The input contains patterns semantically similar "
            f"to known adversarial prompts in the threat library. Immediate review "
            f"and mitigation is recommended."
        )
