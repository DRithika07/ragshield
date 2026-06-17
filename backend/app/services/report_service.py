"""
report_service.py — PDF Incident Report Generator
══════════════════════════════════════════════════
Generates professional PDF incident reports using ReportLab.
Called by the Report Agent and the /reports/generate endpoint.
"""

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
import traceback
from typing import Dict, List

from app.config import settings
from app.utils.logger import get_logger
from app.utils.threat_scorer import severity_to_color

log = get_logger(__name__)

# Colour palette for the cybersecurity theme
COLORS = {
    "bg": (10, 12, 20),
    "accent": (99, 102, 241),   # indigo
    "text_dark": (30, 30, 50),
    "text_light": (220, 220, 240),
    "success": (34, 197, 94),
    "warning": (250, 204, 21),
    "danger": (239, 68, 68),
    "critical": (124, 58, 237),
}


class ReportService:
    """Generates PDF incident reports. Async-safe via asyncio.to_thread."""

    async def generate_pdf(
        self,
        file_path: str,
        report_title: str,
        threat_logs: List[Dict],
    ) -> int:
        """
        Generate a PDF report and write it to file_path.
        Returns the file size in bytes.
        """
        file_size = await asyncio.to_thread(
            self._build_pdf, file_path, report_title, threat_logs
        )
        log.info(f"PDF generated: {file_path} ({file_size} bytes)")
        return file_size

    def _build_pdf(
        self,
        file_path: str,
        report_title: str,
        threat_logs: List[Dict],
    ) -> int:
        """Synchronous PDF construction using ReportLab."""
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
            from reportlab.platypus import (
                HRFlowable,
                Paragraph,
                SimpleDocTemplate,
                Spacer,
                Table,
                TableStyle,
            )

            doc = SimpleDocTemplate(
                file_path,
                pagesize=A4,
                rightMargin=20 * mm,
                leftMargin=20 * mm,
                topMargin=20 * mm,
                bottomMargin=20 * mm,
                title=report_title,
                author="Sentinel-RAG Security Platform",
            )

            styles = getSampleStyleSheet()
            story = []

            # ── Title ───────────────────────────────────────────────
            title_style = ParagraphStyle(
                "TitleStyle",
                parent=styles["Title"],
                fontSize=20,
                textColor=colors.HexColor("#6366f1"),
                spaceAfter=6,
            )
            story.append(Paragraph("SENTINEL-RAG", title_style))
            story.append(Paragraph(report_title, styles["Heading2"]))
            story.append(Paragraph(
                f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
                styles["Normal"],
            ))
            story.append(HRFlowable(width="100%", color=colors.HexColor("#6366f1")))
            story.append(Spacer(1, 6 * mm))

            # ── Summary Statistics ───────────────────────────────────
            total = len(threat_logs)
            malicious = sum(1 for t in threat_logs if t.get("is_malicious"))
            severities = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
            for t in threat_logs:
                sev = t.get("severity", "LOW")
                if sev in severities:
                    severities[sev] += 1

            summary_data = [
                ["Metric", "Value"],
                ["Total Prompts Analyzed", str(total)],
                ["Malicious Detected", str(malicious)],
                ["Safe Prompts", str(total - malicious)],
                ["Critical Severity", str(severities["CRITICAL"])],
                ["High Severity", str(severities["HIGH"])],
                ["Detection Rate", f"{malicious / max(total, 1) * 100:.1f}%"],
            ]

            summary_table = Table(summary_data, colWidths=[90 * mm, 60 * mm])
            summary_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))

            story.append(Paragraph("Executive Summary", styles["Heading2"]))
            story.append(summary_table)
            story.append(Spacer(1, 8 * mm))

            # ── Individual Threat Entries ────────────────────────────
            story.append(Paragraph("Detected Threats", styles["Heading2"]))
            story.append(HRFlowable(width="100%", color=colors.HexColor("#e5e7eb")))
            story.append(Spacer(1, 3 * mm))

            for i, threat in enumerate(threat_logs[:50], 1):  # cap at 50
                sev_color = colors.HexColor(severity_to_color(threat.get("severity", "LOW")))

                story.append(Paragraph(
                    f"Threat #{i} — {threat.get('severity', 'N/A')} | "
                    f"{threat.get('attack_type', 'Unknown').replace('_', ' ').title()}",
                    styles["Heading3"],
                ))

                prompt_preview = (threat.get("prompt_text", "")[:300] + "...") \
                    if len(threat.get("prompt_text", "")) > 300 else threat.get("prompt_text", "")

                threat_data = [
                    ["Prompt (preview)", prompt_preview],
                    ["Fusion Score", f"{threat.get('fusion_score', 0):.3f}"],
                    ["Severity", threat.get("severity", "N/A")],
                    ["Attack Type", threat.get("attack_type", "N/A")],
                    ["Detected At", threat.get("created_at", "N/A")],
                ]
                if threat.get("ai_explanation"):
                    threat_data.append(["AI Explanation", threat["ai_explanation"][:400]])

                t = Table(threat_data, colWidths=[45 * mm, 115 * mm])
                t.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
                    ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f9fafb"), colors.white]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t)
                story.append(Spacer(1, 4 * mm))

            # ── Footer ───────────────────────────────────────────────
            story.append(HRFlowable(width="100%", color=colors.HexColor("#6366f1")))
            story.append(Paragraph(
                "Generated by Sentinel-RAG AI Security Platform | "
                "Confidential — For authorized security personnel only",
                ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7,
                               textColor=colors.HexColor("#9ca3af")),
            ))

            doc.build(story)

            return os.path.getsize(file_path)

        except Exception as e:
                import traceback
                traceback.print_exc()  # prints full error to terminal
                log.error(f"PDF generation failed: {e}")
                raise
