"""
report_agent.py — Report Agent
════════════════════════════════
Generates PDF incident reports and logs the final threat event.
Fourth and final node in the LangGraph pipeline.
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from app.config import settings
from app.utils.logger import get_logger

log = get_logger(__name__)


class ReportAgent:
    """
    Report Agent — compiles findings and generates PDF incident reports.

    Responsibilities:
    - Compile all agent findings into a structured report payload
    - Generate a PDF using ReportService
    - Return the report ID for linking in the API response
    """

    async def run(self, state: Dict[str, Any]) -> Dict[str, Any]:
        bound_log = log.bind(agent="ReportAgent")
        bound_log.info(
            f"Generating incident report for threat_id={state.get('threat_id', 'N/A')[:8]}"
        )

        report_id = str(uuid.uuid4())
        os.makedirs(settings.report_output_dir, exist_ok=True)
        file_name = f"report_{report_id[:8]}.pdf"
        file_path = str(Path(settings.report_output_dir) / file_name)

        # Build the threat log dict for the PDF
        threat_log = {
            "id": state.get("threat_id"),
            "prompt_text": state.get("prompt_text", ""),
            "predicted_label": state.get("predicted_label", 0),
            "is_malicious": state.get("is_malicious", False),
            "fusion_score": state.get("fusion_score", 0.0),
            "severity": state.get("severity", "LOW"),
            "attack_type": state.get("attack_type", "unknown"),
            "ai_explanation": state.get("ai_explanation"),
            "mitigation_steps": "\n".join(state.get("mitigation_steps") or []),
            "is_memory_poison": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            from app.services.report_service import ReportService
            svc = ReportService()
            title = (
                f"Sentinel-RAG Incident — {state.get('severity', 'UNKNOWN')} "
                f"{state.get('attack_type', 'Threat').replace('_', ' ').title()} — "
                f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
            )
            await svc.generate_pdf(
                file_path=file_path,
                report_title=title,
                threat_logs=[threat_log],
            )
            bound_log.info(f"Report PDF written: {file_path}")
        except Exception as e:
            bound_log.error(f"PDF generation failed in ReportAgent: {e}")
            file_path = None

        return {
            "report_id": report_id,
            "report_path": file_path,
        }
