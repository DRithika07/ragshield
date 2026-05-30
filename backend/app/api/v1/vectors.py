"""
vectors.py — Vector Similarity & Visualization Routes
══════════════════════════════════════════════════════
POST /api/v1/vectors/similar    — top-k similarity search
GET  /api/v1/vectors/visualize  — UMAP 2D projection for scatter plot
"""

import asyncio

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_chroma_service, get_embedding_service, verify_api_key
from app.models.request import VectorSimilarityRequest
from app.models.response import (
    SimilarVector,
    VectorSimilarityResponse,
    VectorVisualizePoint,
    VectorVisualizeResponse,
)
from app.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/similar", response_model=VectorSimilarityResponse)
async def find_similar(
    request: VectorSimilarityRequest,
    _auth=Depends(verify_api_key),
    embedding_svc=Depends(get_embedding_service),
    chroma_svc=Depends(get_chroma_service),
):
    """Find the top-k most semantically similar vectors to a query text."""
    embedding, _ = await embedding_svc.aembed(request.query_text)

    collection_map = {
        "threat_library": "threat_library",
        "rag_memory": "rag_memory",
        "detection_history": "detection_history",
    }
    collection_key = collection_map.get(request.collection, "threat_library")

    results = await asyncio.to_thread(
        chroma_svc.query_threat_library, embedding, request.top_k
    )

    similar = [
        SimilarVector(
            doc_id=r["id"],
            content_preview=r["document"][:200],
            similarity=r["similarity"],
            label=r["metadata"].get("label"),
            metadata=r["metadata"],
        )
        for r in results
    ]

    return VectorSimilarityResponse(
        success=True,
        message="Similarity search complete",
        query_text=request.query_text,
        collection=request.collection,
        results=similar,
    )


@router.get("/visualize", response_model=VectorVisualizeResponse)
async def visualize_vectors(
    collection: str = Query(default="threat_library"),
    limit: int = Query(default=300, ge=10, le=500),
    _auth=Depends(verify_api_key),
    chroma_svc=Depends(get_chroma_service),
):
    """
    Generate UMAP 2D projections of all vectors for the scatter plot.
    Returns x,y coordinates + metadata for each point.
    """
    all_points = await asyncio.to_thread(
        chroma_svc.get_all_for_visualization, "threat_library", limit
    )

    if not all_points:
        return VectorVisualizeResponse(
            success=True, message="No data", collection=collection, points=[], total=0
        )

    embeddings = [p["embedding"] for p in all_points]

    # UMAP dimensionality reduction
    try:
        import numpy as np
        from umap import UMAP

        umap_model = UMAP(
            n_components=2,
            n_neighbors=min(15, len(embeddings) - 1),
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        )
        coords = await asyncio.to_thread(
            umap_model.fit_transform, np.array(embeddings)
        )

        points = [
            VectorVisualizePoint(
                id=p["id"],
                x=float(coords[i, 0]),
                y=float(coords[i, 1]),
                label=p["metadata"].get("label", 0),
                severity=p["metadata"].get("severity"),
                content_preview=p["document"][:100],
            )
            for i, p in enumerate(all_points)
        ]

    except Exception as e:
        log.error(f"UMAP failed: {e}. Returning PCA fallback.")
        import numpy as np
        matrix = np.array(embeddings)
        u, s, vt = np.linalg.svd(matrix - matrix.mean(axis=0), full_matrices=False)
        coords = u[:, :2] * s[:2]

        points = [
            VectorVisualizePoint(
                id=p["id"],
                x=float(coords[i, 0]),
                y=float(coords[i, 1]),
                label=p["metadata"].get("label", 0),
                severity=p["metadata"].get("severity"),
                content_preview=p["document"][:100],
            )
            for i, p in enumerate(all_points)
        ]

    return VectorVisualizeResponse(
        success=True,
        message="UMAP projection complete",
        collection=collection,
        points=points,
        total=len(points),
    )
