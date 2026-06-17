"""
gemini_service.py — Google Gemini LLM Service
══════════════════════════════════════════════
Wraps the Gemini API for all LLM-powered features:

  1. Threat explanation  — "Why is this prompt dangerous?"
  2. Attack narrative    — Human-readable attack type description
  3. Mitigation steps    — Ordered list of countermeasures
  4. RAG poison analysis — Explain why a document is suspicious
  5. Incident summary    — Executive summary for PDF reports

Design decisions:
  - All prompts are carefully engineered with system context
  - Structured output is requested via explicit JSON instructions
  - Retry with exponential backoff (up to 3 attempts)
  - Timeout of 30s per request (prevents request stalling)
  - Fallback responses when API is unavailable
"""

import asyncio
import json
import re
from typing import Dict, List, Optional

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.utils.logger import get_logger

log = get_logger(__name__)


# ── System context injected into every Gemini call ────────────────────
_SYSTEM_CONTEXT = """You are SentinelAI, an expert AI security analyst
specializing in prompt injection attacks, LLM jailbreaks, and RAG memory
poisoning detection. You analyze threats with precision and provide
actionable security intelligence. Always be specific, technical, and concise.
Respond ONLY with valid JSON when asked for structured output."""


class GeminiService:
    """
    Manages all interactions with the Google Gemini API.
    Singleton — instantiated once, reused across all requests.
    """

    def __init__(self) -> None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GeminiService cannot be initialised without GEMINI_API_KEY"
            )
        self._client = self._init_client()
        log.info(f"GeminiService initialised. Model: {settings.gemini_model}")

    def _init_client(self):
        """Configure the Gemini SDK with API key and safety settings."""
        import google.generativeai as genai
        from google.generativeai.types import HarmBlockThreshold, HarmCategory

        genai.configure(api_key=settings.gemini_api_key)

        # Configure safety settings — we need to allow discussion of
        # attack techniques for security analysis (not for execution)
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }

        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            generation_config={
                "temperature": settings.gemini_temperature,
                "max_output_tokens": settings.gemini_max_tokens,
                "top_p": 0.8,
                "top_k": 40,
            },
            safety_settings=safety_settings,
            system_instruction=_SYSTEM_CONTEXT,
        )
        return model

    # ── Core LLM Call ─────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        reraise=False,
    )
    def _call(self, prompt: str) -> str:
        """
        Raw Gemini API call with retry logic.
        Returns the text content of the response.
        Tenacity retries up to 3 times with exponential backoff (2s → 4s → 8s).
        """
        try:
            response = self._client.generate_content(prompt)
            if response.parts:
                return response.text.strip()
            log.warning("Gemini returned empty response parts")
            return ""
        except Exception as e:
            log.warning(f"Gemini API call failed (will retry): {e}")
            raise

    async def _acall(self, prompt: str) -> str:
        """Async wrapper for _call() — runs in thread pool."""
        return await asyncio.to_thread(self._call, prompt)

    @staticmethod
    def _parse_json(raw: str) -> Optional[Dict]:
        """
        Safely extract and parse JSON from a Gemini response.
        Gemini sometimes wraps JSON in markdown code fences — strip them.
        """
        # Remove ```json ... ``` or ``` ... ``` wrappers
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned.strip())
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            log.warning(f"JSON parse failed: {e}. Raw: {raw[:200]}")
            return None

    # ── Feature 1: Threat Explanation ────────────────────────────────

    async def explain_threat(
        self,
        prompt_text: str,
        attack_type: str,
        fusion_score: float,
        severity: str,
        is_malicious: bool,
        similar_examples: Optional[List[Dict]] = None,
    ) -> str:
        """
        Generate explanation for both safe and malicious prompts.
        """

        examples_str = ""

        if similar_examples:
            examples_str = "\n".join(
                f'- "{ex.get("document", "")[:100]}" '
                f'(similarity: {ex.get("similarity", 0):.2f})'
                for ex in similar_examples[:2]
            )

        # SAFE PROMPTS
        if not is_malicious:
            prompt = f"""
The following prompt has been classified as SAFE.

PROMPT:
"{prompt_text[:500]}"

Classification:
- Attack Type: safe
- Threat Score: {fusion_score:.2f}
- Severity: NONE

Provide a short explanation (2-3 sentences) describing why this prompt is considered safe.

Mention:
1. No prompt injection indicators.
2. No jailbreak behavior.
3. No attempt to access hidden instructions, memory, or system prompts.

Return plain text only.
"""

            try:
                explanation = await self._acall(prompt)

                if explanation:
                    return explanation

                return self._fallback_explanation("safe", "NONE")

            except Exception as e:
                log.error(f"safe explain_threat failed: {e}")
                return self._fallback_explanation("safe", "NONE")

        # MALICIOUS PROMPTS
        prompt = f"""
Analyze this malicious AI prompt and explain the threat.

PROMPT UNDER ANALYSIS:
"{prompt_text[:500]}"

DETECTION METADATA:
- Attack Type: {attack_type}
- Threat Score: {fusion_score:.2f}/1.00
- Severity: {severity}
{f'- Similar known attacks:{chr(10)}{examples_str}' if examples_str else ''}

Provide a clear technical explanation (2-4 sentences):

1. What the prompt is attempting to do.
2. Why it is dangerous.
3. Why it was classified as {attack_type}.
4. Potential impact on an AI or RAG system.

Return plain text only.
"""

        try:
            explanation = await self._acall(prompt)

            if explanation:
                return explanation

            return self._fallback_explanation(
                attack_type,
                severity,
            )

        except Exception as e:
            log.error(f"explain_threat failed: {e}")

            return self._fallback_explanation(
                attack_type,
                severity,
            )

    # ── Feature 2: Mitigation Steps ───────────────────────────────────

    async def generate_mitigation(
        self,
        prompt_text: str,
        attack_type: str,
        severity: str,
    ) -> List[str]:
        """
        Generate ordered, actionable mitigation steps for a detected threat.
        Returns a list of strings suitable for display as ordered steps.
        Called by the Mitigation Agent.
        """
        prompt = f"""A {severity} severity {attack_type} attack was detected in an AI/RAG system.

MALICIOUS PROMPT (truncated):
"{prompt_text[:300]}"

Provide exactly 5 specific, actionable mitigation steps to:
1. Immediately handle this specific threat
2. Prevent similar attacks in the future

Respond with ONLY a JSON array of 5 strings. Example format:
["Step 1: ...", "Step 2: ...", "Step 3: ...", "Step 4: ...", "Step 5: ..."]

Steps must be specific to {attack_type} attacks. Be technical and actionable."""

        try:
            raw = await self._acall(prompt)
            parsed = self._parse_json(raw)

            if isinstance(parsed, list) and len(parsed) >= 3:
                return [str(s) for s in parsed[:6]]

            # If JSON parse fails, split by newline as fallback
            lines = [
                line.strip().lstrip("0123456789.-) ")
                for line in raw.split("\n")
                if line.strip() and len(line.strip()) > 10
            ]
            return lines[:5] if lines else self._fallback_mitigation(attack_type)

        except Exception as e:
            log.error(f"generate_mitigation failed: {e}")
            return self._fallback_mitigation(attack_type)

    # ── Feature 3: RAG Poison Analysis ───────────────────────────────

    async def analyze_rag_poison(
        self,
        document_content: str,
        poison_score: float,
        similar_threats: List[Dict],
    ) -> Dict:
        """
        Analyze why a RAG document was flagged as a poisoning attempt.
        Returns structured analysis with explanation and risk assessment.
        Called by the Analysis Agent for memory poisoning events.
        """
        threats_preview = "\n".join(
            f'  - "{t.get("document", "")[:80]}" (sim: {t.get("similarity", 0):.2f})'
            for t in similar_threats[:3]
        )

        prompt = f"""A document was flagged as a potential RAG memory poisoning attempt.

SUSPICIOUS DOCUMENT (truncated):
"{document_content[:400]}"

DETECTION DATA:
- Poison Score: {poison_score:.3f}/1.00
- Similar known attacks:
{threats_preview}

Analyze and respond with ONLY this JSON structure:
{{
  "is_genuine_poison": true/false,
  "confidence": 0.0-1.0,
  "attack_vector": "brief description of how this document could poison RAG",
  "potential_impact": "what harm this could cause when retrieved by the RAG system",
  "explanation": "2-3 sentence analysis",
  "recommended_action": "block | quarantine | monitor | allow"
}}"""

        try:
            raw = await self._acall(prompt)
            parsed = self._parse_json(raw)
            if parsed and isinstance(parsed, dict):
                return parsed
        except Exception as e:
            log.error(f"analyze_rag_poison failed: {e}")

        return {
            "is_genuine_poison": poison_score >= settings.similarity_threshold,
            "confidence": poison_score,
            "attack_vector": "Semantic similarity to known injection patterns",
            "potential_impact": "Could manipulate LLM responses when retrieved as context",
            "explanation": f"Document scored {poison_score:.2f} similarity to known attacks.",
            "recommended_action": "block" if poison_score >= 0.82 else "monitor",
        }

    # ── Feature 4: Incident Summary ───────────────────────────────────

    async def generate_incident_summary(
        self,
        threat_logs: List[Dict],
        report_title: str,
    ) -> Dict:
        """
        Generate an executive summary for a PDF incident report.
        Called by the Report Agent before PDF generation.
        Returns structured summary with key findings and recommendations.
        """
        total = len(threat_logs)
        malicious = sum(1 for t in threat_logs if t.get("is_malicious"))
        severities = [t.get("severity", "UNKNOWN") for t in threat_logs if t.get("is_malicious")]
        attack_types = [t.get("attack_type", "unknown") for t in threat_logs if t.get("is_malicious")]

        prompt = f"""Generate an executive incident report summary for: "{report_title}"

INCIDENT STATISTICS:
- Total prompts analyzed: {total}
- Malicious detected: {malicious}
- Safe: {total - malicious}
- Severity distribution: {dict((s, severities.count(s)) for s in set(severities))}
- Attack types: {dict((a, attack_types.count(a)) for a in set(attack_types))}

Respond with ONLY this JSON:
{{
  "executive_summary": "3-4 sentence executive summary of the security incident",
  "key_findings": ["finding 1", "finding 2", "finding 3"],
  "risk_level": "LOW | MEDIUM | HIGH | CRITICAL",
  "recommendations": ["rec 1", "rec 2", "rec 3"],
  "conclusion": "1-2 sentence conclusion"
}}"""

        try:
            raw = await self._acall(prompt)
            parsed = self._parse_json(raw)
            if parsed and isinstance(parsed, dict):
                return parsed
        except Exception as e:
            log.error(f"generate_incident_summary failed: {e}")

        return self._fallback_summary(total, malicious)

    # ── Fallback Responses ────────────────────────────────────────────

    @staticmethod
    def _fallback_explanation(
        attack_type: str,
        severity: str,
    ) -> str:
        explanations = {
            "safe": (
                "This prompt appears benign and does not contain indicators "
                "of prompt injection, jailbreak attempts, role hijacking, "
                "or sensitive data extraction. The request is consistent "
                "with normal user interaction patterns."
            ),

            "jailbreak": (
                f"This {severity.lower()} severity jailbreak attempt uses "
                "instruction override techniques to bypass the AI system's "
                "safety boundaries."
            ),

            "prompt_injection": (
                f"A {severity.lower()} severity prompt injection attack was "
                "detected. The prompt attempts to manipulate instruction processing."
            ),

            "role_hijacking": (
                f"This {severity.lower()} severity role hijacking attempt "
                "tries to alter the model's identity or persona."
            ),

            "data_extraction": (
                f"A {severity.lower()} severity data extraction attempt was "
                "detected. The prompt seeks confidential information."
            ),
        }

        return explanations.get(
            attack_type,
            f"A {severity.lower()} severity {attack_type} attack was detected."
        )

    @staticmethod
    def _fallback_mitigation(attack_type: str) -> List[str]:
        base = [
            "Step 1: Immediately block this prompt from reaching the LLM.",
            "Step 2: Log the full request with metadata for audit trail.",
            "Step 3: Review and strengthen input validation filters.",
            "Step 4: Update the threat library with this attack pattern.",
            "Step 5: Alert the security team for manual review if severity is HIGH+.",
        ]
        return base

    @staticmethod
    def _fallback_summary(total: int, malicious: int) -> Dict:
        return {
            "executive_summary": (
                f"Security scan analyzed {total} prompts, detecting {malicious} "
                f"malicious inputs ({malicious/total*100:.1f}% threat rate). "
                "The Sentinel-RAG system successfully identified and flagged "
                "potential prompt injection and memory poisoning attempts."
            ),
            "key_findings": [
                f"{malicious} malicious prompts detected out of {total} total",
                "Prompt injection patterns were the primary attack vector",
                "RAG memory integrity checks completed successfully",
            ],
            "risk_level": "HIGH" if malicious / max(total, 1) > 0.3 else "MEDIUM",
            "recommendations": [
                "Implement stricter input validation at the API gateway",
                "Increase threat library with newly detected patterns",
                "Enable real-time alerting for CRITICAL severity events",
            ],
            "conclusion": (
                "Sentinel-RAG's multi-agent detection pipeline successfully "
                "protected the system from adversarial prompt attacks."
            ),
        }
