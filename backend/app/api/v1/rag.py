"""
rag.py — RAG Memory Security Routes
═════════════════════════════════════
POST /api/v1/rag/inject  — inject document into RAG memory (screened)
POST /api/v1/rag/scan    — scan existing memory for poisoned documents
GET  /api/v1/rag/memory  — list all documents in RAG memory
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    get_chroma_service,
    get_database,
    get_embedding_service,
    verify_api_key,
)
from app.models.request import RAGInjectRequest, RAGScanRequest
from app.models.response import RAGInjectResponse, RAGScanResponse, RAGDocumentResult
from app.services.rag_service import RAGService
from app.utils.logger import get_logger
from datetime import datetime, timezone

log = get_logger(__name__)
router = APIRouter()


def _get_rag_service(
    embedding_svc=Depends(get_embedding_service),
    chroma_svc=Depends(get_chroma_service),
) -> RAGService:
    return RAGService(embedding_svc=embedding_svc, chroma_svc=chroma_svc)


@router.post("/inject", response_model=RAGInjectResponse)
async def inject_document(
    request: RAGInjectRequest,
    db: AsyncSession = Depends(get_database),
    _auth=Depends(verify_api_key),
    rag_svc: RAGService = Depends(_get_rag_service),
):
    """Attempt to inject a document into RAG memory with poison screening."""
    result = await rag_svc.inject_document(
        content=request.content,
        source=request.source or "api_injection",
        db=db,
    )
    return RAGInjectResponse(
        success=True,
        message=f"Document {result['action']}.",
        doc_id=result["doc_id"],
        is_blocked=result["is_blocked"],
        is_flagged=result["is_flagged"],
        poison_score=result["poison_score"],
        action_taken=result["action"],
    )


@router.post("/scan", response_model=RAGScanResponse)
async def scan_memory(
    request: RAGScanRequest,
    _auth=Depends(verify_api_key),
    rag_svc: RAGService = Depends(_get_rag_service),
):
    """Scan all documents in RAG memory for poisoning and semantic anomalies."""
    scan_result = await rag_svc.scan_memory(
        similarity_threshold=request.similarity_threshold,
    )

    doc_results = [
        RAGDocumentResult(
            doc_id=r["doc_id"],
            content_preview=r["content_preview"],
            source=r.get("source"),
            is_poisoned=r["is_poisoned"],
            poison_score=r.get("poison_score"),
            poison_status=r["poison_status"],
            created_at=datetime.now(timezone.utc),
        )
        for r in scan_result["results"]
    ]

    return RAGScanResponse(
        success=True,
        message="Memory scan complete",
        total_documents=scan_result["total_documents"],
        poisoned_count=scan_result["poisoned_count"],
        flagged_count=scan_result["flagged_count"],
        clean_count=scan_result["clean_count"],
        results=doc_results,
    )


@router.get("/memory")
async def get_memory(
    _auth=Depends(verify_api_key),
    rag_svc: RAGService = Depends(_get_rag_service),
):
    """List all documents currently stored in RAG memory."""
    docs = await rag_svc.get_memory_documents()
    return {"success": True, "total": len(docs), "documents": docs}
