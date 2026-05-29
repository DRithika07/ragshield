"""
chromadb_service.py — Vector Database Service
══════════════════════════════════════════════
Single access point for all ChromaDB operations.

Manages three collections:
  threat_library      — known attack embeddings (training data)
  rag_memory          — simulated RAG document store
  detection_history   — every prompt that was analyzed live

Key operations:
  upsert_threat()     — add a labeled threat to the library
  query_similar()     — cosine similarity search
  upsert_rag_doc()    — add a document to RAG memory (with poison check)
  scan_rag_memory()   — check all RAG docs against threat library
  upsert_detection()  — log a live detection result
  get_all_vectors()   — retrieve all points (for UMAP visualization)
"""

import uuid
from typing import Any, Dict, List, Optional, Tuple

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.utils.logger import get_logger

log = get_logger(__name__)


class ChromaDBService:
    """
    Wraps ChromaDB client and exposes high-level methods.
    Uses persistent storage so vector data survives restarts.
    All methods are synchronous (ChromaDB 0.5.x is sync-only).
    FastAPI async routes call these in a thread pool via asyncio.to_thread().
    """

    def __init__(self) -> None:
        self._client = self._init_client()
        self._collections = self._init_collections()
        log.info(
            f"ChromaDBService ready. "
            f"Collections: {list(self._collections.keys())}"
        )

    def _init_client(self) -> chromadb.Client:
        """
        Create a persistent ChromaDB client.
        Data is stored in settings.chroma_persist_dir so it survives restarts.
        """
        import os
        os.makedirs(settings.chroma_persist_dir, exist_ok=True)

        client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(
                anonymized_telemetry=False,   # disable telemetry in production
                allow_reset=True,             # allow reset in tests
            ),
        )
        log.debug(f"ChromaDB client initialised at: {settings.chroma_persist_dir}")
        return client

    def _init_collections(self) -> Dict[str, Any]:
        """
        Get-or-create all three collections.
        ChromaDB uses cosine distance for similarity by default.
        We explicitly set it for clarity and reproducibility.
        """
        collection_names = {
            "threat_library": settings.chroma_collection_threat_library,
            "rag_memory": settings.chroma_collection_rag_memory,
            "detection_history": settings.chroma_collection_detection_history,
        }

        collections = {}
        for key, name in collection_names.items():
            collections[key] = self._client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": "cosine"},   # cosine similarity
            )
            count = collections[key].count()
            log.debug(f"Collection '{name}' ready. Documents: {count}")

        return collections

    # ── Threat Library ────────────────────────────────────────────────

    def upsert_threat(
        self,
        doc_id: str,
        text: str,
        embedding: List[float],
        label: int,
        attack_type: str = "unknown",
        severity: str = "MEDIUM",
        source: str = "train_dataset",
    ) -> None:
        """
        Add or update a labeled threat/safe document in the threat library.
        Called during ML training pipeline to populate the vector store.
        """
        self._collections["threat_library"].upsert(
            ids=[doc_id],
            documents=[text],
            embeddings=[embedding],
            metadatas=[{
                "label": label,
                "attack_type": attack_type,
                "severity": severity,
                "source": source,
            }],
        )

    def query_threat_library(
        self,
        query_embedding: List[float],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Find the top-k most similar documents in the threat library.
        Returns a list of dicts with: id, document, metadata, distance.

        ChromaDB returns distances (lower = more similar for cosine space).
        We convert to similarity: similarity = 1 - distance.
        """
        results = self._collections["threat_library"].query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, self._collections["threat_library"].count() or 1),
            include=["documents", "metadatas", "distances"],
        )

        output = []
        if not results["ids"] or not results["ids"][0]:
            return output

        for i, doc_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][i]
            output.append({
                "id": doc_id,
                "document": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                # ChromaDB cosine: distance = 1 - cosine_similarity
                "similarity": round(1.0 - distance, 4),
                "distance": round(distance, 4),
            })

        return output

    def get_threat_library_count(self) -> int:
        return self._collections["threat_library"].count()

    # ── RAG Memory ────────────────────────────────────────────────────

    def upsert_rag_document(
        self,
        doc_id: str,
        content: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Store a document in the RAG memory collection."""
        meta = metadata or {}
        meta.setdefault("poisoned", False)
        meta.setdefault("poison_status", "clean")

        self._collections["rag_memory"].upsert(
            ids=[doc_id],
            documents=[content],
            embeddings=[embedding],
            metadatas=[meta],
        )

    def get_all_rag_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from RAG memory (for scanning)."""
        count = self._collections["rag_memory"].count()
        if count == 0:
            return []

        results = self._collections["rag_memory"].get(
            include=["documents", "metadatas", "embeddings"],
            limit=count,
        )

        output = []
        for i, doc_id in enumerate(results["ids"]):
            output.append({
                "id": doc_id,
                "document": results["documents"][i],
                "metadata": results["metadatas"][i],
                "embedding": results["embeddings"][i],
            })
        return output

    def update_rag_document_metadata(
        self,
        doc_id: str,
        metadata_update: Dict[str, Any],
    ) -> None:
        """Update metadata fields on an existing RAG document (e.g. mark as poisoned)."""
        existing = self._collections["rag_memory"].get(ids=[doc_id], include=["metadatas"])
        if not existing["ids"]:
            log.warning(f"update_rag_document_metadata: doc_id '{doc_id}' not found")
            return
        merged = {**existing["metadatas"][0], **metadata_update}
        self._collections["rag_memory"].update(ids=[doc_id], metadatas=[merged])

    # ── Detection History ─────────────────────────────────────────────

    def upsert_detection(
        self,
        detection_id: str,
        prompt_text: str,
        embedding: List[float],
        metadata: Dict[str, Any],
    ) -> None:
        """Log a live detection event to the detection_history collection."""
        self._collections["detection_history"].upsert(
            ids=[detection_id],
            documents=[prompt_text],
            embeddings=[embedding],
            metadatas=[metadata],
        )

    def get_detection_history_count(self) -> int:
        return self._collections["detection_history"].count()

    # ── Cross-Collection Similarity (Poison Detection) ─────────────────

    def check_poison_similarity(
        self,
        query_embedding: List[float],
        top_k: int = 5,
    ) -> Tuple[float, List[Dict[str, Any]]]:
        """
        Core memory poisoning detection logic.

        Compare a new RAG document's embedding against the threat library.
        Returns:
          (max_similarity_score, list_of_similar_threats)

        If max_similarity_score >= settings.similarity_threshold,
        the document is a likely poison injection attempt.
        """
        similar = self.query_threat_library(query_embedding, top_k=top_k)

        if not similar:
            return 0.0, []

        # Only consider MALICIOUS neighbors (label=1)
        malicious_neighbors = [s for s in similar if s["metadata"].get("label") == 1]

        if not malicious_neighbors:
            return 0.0, []

        max_similarity = max(s["similarity"] for s in malicious_neighbors)
        return max_similarity, malicious_neighbors

    # ── Visualization Data ────────────────────────────────────────────

    def get_all_for_visualization(
        self,
        collection_key: str = "threat_library",
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Return all documents + embeddings from a collection.
        Used by the UMAP visualization endpoint.
        Capped at 500 points to keep UMAP fast.
        """
        col = self._collections.get(collection_key)
        if col is None:
            raise ValueError(f"Unknown collection key: {collection_key}")

        count = min(col.count(), limit)
        if count == 0:
            return []

        results = col.get(
            include=["documents", "metadatas", "embeddings"],
            limit=count,
        )

        output = []
        for i, doc_id in enumerate(results["ids"]):
            output.append({
                "id": doc_id,
                "document": results["documents"][i][:200],  # preview only
                "metadata": results["metadatas"][i],
                "embedding": results["embeddings"][i],
            })
        return output

    def reset_collection(self, collection_key: str) -> None:
        """Delete and recreate a collection (used in tests only)."""
        col = self._collections.get(collection_key)
        if col:
            self._client.delete_collection(col.name)
            log.warning(f"Collection '{col.name}' was reset")
        self._collections = self._init_collections()
