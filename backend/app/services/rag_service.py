"""
rag_service.py — RAG Memory Poisoning Detection Service
════════════════════════════════════════════════════════
Simulates a production RAG memory system with embedded poison detection.

Real RAG systems store documents as embeddings in vector databases,
then retrieve the most relevant chunks as context for LLM responses.
Memory poisoning attacks inject malicious documents into this store,
so when the LLM retrieves them as context, it follows the injected
instructions rather than its original system prompt.

This service:
  1. Screens incoming documents BEFORE writing to RAG memory
  2. Blocks or flags documents that match known attack patterns
  3. Performs periodic full scans for anomalous documents
  4. Detects semantic outliers (z-score anomaly detection)
  5. Maintains poisoning audit trail in both ChromaDB + SQLite
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import RAGDocument
from app.services.chromadb_service import ChromaDBService
from app.services.embedding_service import EmbeddingService
from app.utils.logger import get_logger

log = get_logger(__name__)


class RAGService:
    """
    Manages the simulated RAG memory with poison detection.
    Called by RAG API routes and the Mitigation Agent.
    """

    def __init__(
        self,
        embedding_svc: EmbeddingService,
        chroma_svc: ChromaDBService,
    ) -> None:
        self._embed = embedding_svc
        self._chroma = chroma_svc
        log.info("RAGService initialised")

    # ── Document Injection (with poison screening) ─────────────────────

    async def inject_document(
        self,
        content: str,
        source: str = "manual_injection",
        db: Optional[AsyncSession] = None,
    ) -> Dict:
        """
        Attempt to add a document to RAG memory.
        Runs poison screening before any write operation.

        Returns a result dict describing the action taken:
          action: "blocked" | "flagged" | "stored"
          doc_id: the document ID (even if blocked, for audit)
          poison_score: cosine similarity to threat library
          is_blocked: True if action == "blocked"
          is_flagged: True if action == "flagged"
        """
        doc_id = str(uuid.uuid4())

        # Step 1: Generate embedding for the incoming document
        embedding, content_hash = await self._embed.aembed(content)

        # Step 2: Check against threat library (poison detection)
        poison_score, similar_threats = await asyncio.to_thread(
            self._chroma.check_poison_similarity,
            embedding,
            settings.top_k_similar,
        )

        log.info(
            f"RAG inject screening. "
            f"doc_id={doc_id[:8]} poison_score={poison_score:.3f}"
        )

        # Step 3: Decide action based on poison score
        if poison_score >= settings.similarity_threshold:
            # HIGH similarity to known attacks → BLOCK outright
            action = "blocked"
            is_poisoned = True
            poison_status = "blocked"
            log.warning(
                f"RAG document BLOCKED. "
                f"doc_id={doc_id[:8]} score={poison_score:.3f}"
            )
        elif poison_score >= (settings.similarity_threshold * 0.7):
            # MODERATE similarity → STORE with flagged metadata
            action = "flagged"
            is_poisoned = True
            poison_status = "flagged"
            log.warning(
                f"RAG document FLAGGED. "
                f"doc_id={doc_id[:8]} score={poison_score:.3f}"
            )
            await self._store_document(
                doc_id, content, embedding, source, is_poisoned=True,
                poison_status=poison_status, poison_score=poison_score,
            )
        else:
            # LOW similarity → STORE as clean document
            action = "stored"
            is_poisoned = False
            poison_status = "clean"
            await self._store_document(
                doc_id, content, embedding, source, is_poisoned=False,
                poison_status=poison_status, poison_score=poison_score,
            )

        # Step 4: Persist to SQLite (audit trail)
        if db is not None:
            await self._persist_to_db(
                db, doc_id, content, source, is_poisoned,
                poison_score, poison_status,
            )

        return {
            "doc_id": doc_id,
            "action": action,
            "is_blocked": action == "blocked",
            "is_flagged": action == "flagged",
            "poison_score": round(poison_score, 4),
            "poison_status": poison_status,
            "similar_threats_count": len(similar_threats),
        }

    async def _store_document(
        self,
        doc_id: str,
        content: str,
        embedding: List[float],
        source: str,
        is_poisoned: bool,
        poison_status: str,
        poison_score: float,
    ) -> None:
        """Write a document to ChromaDB rag_memory collection."""
        metadata = {
            "source": source,
            "poisoned": is_poisoned,
            "poison_status": poison_status,
            "poison_score": round(poison_score, 4),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(
            self._chroma.upsert_rag_document,
            doc_id, content, embedding, metadata,
        )

    async def _persist_to_db(
        self,
        db: AsyncSession,
        doc_id: str,
        content: str,
        source: str,
        is_poisoned: bool,
        poison_score: float,
        poison_status: str,
    ) -> None:
        """Write RAG document record to SQLite for audit trail."""
        try:
            record = RAGDocument(
                id=doc_id,
                chroma_doc_id=doc_id,
                content=content,
                source=source,
                is_poisoned=is_poisoned,
                poison_score=poison_score,
                poison_status=poison_status,
                poisoned_at=datetime.now(timezone.utc) if is_poisoned else None,
            )
            db.add(record)
            await db.flush()
        except Exception as e:
            log.error(f"Failed to persist RAGDocument to DB: {e}")

    # ── Full Memory Scan ───────────────────────────────────────────────

    async def scan_memory(
        self,
        similarity_threshold: Optional[float] = None,
    ) -> Dict:
        """
        Scan all documents currently in RAG memory for poisoning.
        Two detection methods run in parallel:

        Method A — Similarity scan:
          Re-check every stored document against the threat library.
          Catches documents that were stored before the threat library was updated.

        Method B — Semantic anomaly detection (z-score):
          Compute pairwise similarity across all documents.
          Flag documents whose average similarity to all others is an outlier.
          This catches novel poisons that aren't in the threat library yet.
        """
        threshold = similarity_threshold or settings.similarity_threshold
        log.info(f"Starting RAG memory scan. Threshold: {threshold}")

        # Retrieve all documents from ChromaDB
        all_docs = await asyncio.to_thread(self._chroma.get_all_rag_documents)

        if not all_docs:
            return {
                "total_documents": 0,
                "poisoned_count": 0,
                "flagged_count": 0,
                "clean_count": 0,
                "results": [],
            }

        # Run similarity scan for each document
        results = []
        for doc in all_docs:
            embedding = doc.get("embedding")
            if not embedding:
                continue

            poison_score, similar_threats = await asyncio.to_thread(
                self._chroma.check_poison_similarity,
                embedding,
                5,
            )

            metadata = doc.get("metadata", {})
            current_status = metadata.get("poison_status", "clean")

            # Update status if this scan finds new poisoning
            new_status = current_status
            if poison_score >= threshold and current_status == "clean":
                new_status = "flagged"
                await asyncio.to_thread(
                    self._chroma.update_rag_document_metadata,
                    doc["id"],
                    {"poison_status": "flagged", "poison_score": poison_score},
                )

            results.append({
                "doc_id": doc["id"],
                "content_preview": doc["document"][:200],
                "source": metadata.get("source"),
                "is_poisoned": poison_score >= threshold or metadata.get("poisoned", False),
                "poison_score": round(poison_score, 4),
                "poison_status": new_status,
                "created_at": metadata.get("created_at"),
            })

        # Run anomaly detection on the full embedding matrix
        anomaly_ids = await asyncio.to_thread(
            self._detect_semantic_anomalies,
            all_docs,
        )

        # Merge anomaly flags into results
        for r in results:
            if r["doc_id"] in anomaly_ids and not r["is_poisoned"]:
                r["is_poisoned"] = True
                r["poison_status"] = "flagged_anomaly"

        poisoned = sum(1 for r in results if r["is_poisoned"])
        flagged = sum(1 for r in results if r["poison_status"] in ("flagged", "flagged_anomaly"))
        clean = len(results) - poisoned

        log.info(
            f"Scan complete. Total: {len(results)}, "
            f"Poisoned: {poisoned}, Flagged: {flagged}, Clean: {clean}"
        )

        return {
            "total_documents": len(results),
            "poisoned_count": poisoned,
            "flagged_count": flagged,
            "clean_count": clean,
            "results": results,
        }

    def _detect_semantic_anomalies(
        self,
        docs: List[Dict],
        z_threshold: float = 2.0,
    ) -> List[str]:
        """
        Z-score based semantic anomaly detection.

        For each document, compute its average cosine similarity to all others.
        Documents that are statistical outliers (z-score > threshold) in the
        low-similarity direction are semantically dissimilar to the corpus —
        this is a signal of injected foreign content.

        Returns list of anomalous document IDs.
        """
        if len(docs) < 4:
            # Not enough documents for meaningful statistical analysis
            return []

        embeddings = []
        doc_ids = []
        for doc in docs:
            emb = doc.get("embedding")
            if emb:
                embeddings.append(emb)
                doc_ids.append(doc["id"])

        if len(embeddings) < 4:
            return []

        matrix = np.array(embeddings, dtype=np.float32)

        # Compute pairwise cosine similarity matrix
        # Since embeddings are L2-normalized, dot product = cosine similarity
        sim_matrix = np.dot(matrix, matrix.T)

        # For each doc: average similarity to all OTHER docs (exclude diagonal)
        n = len(matrix)
        avg_similarities = []
        for i in range(n):
            others = [sim_matrix[i, j] for j in range(n) if i != j]
            avg_similarities.append(np.mean(others))

        avg_sim_array = np.array(avg_similarities)
        mean_sim = np.mean(avg_sim_array)
        std_sim = np.std(avg_sim_array)

        if std_sim < 1e-6:
            # All documents are nearly identical — no anomalies
            return []

        z_scores = (avg_sim_array - mean_sim) / std_sim

        # Anomalies are documents with VERY LOW average similarity (negative z-score)
        anomalous_ids = [
            doc_ids[i] for i, z in enumerate(z_scores)
            if z < -z_threshold
        ]

        if anomalous_ids:
            log.warning(
                f"Semantic anomaly detection found {len(anomalous_ids)} outlier(s): "
                f"{anomalous_ids}"
            )

        return anomalous_ids

    # ── Memory Retrieval ───────────────────────────────────────────────

    async def get_memory_documents(self) -> List[Dict]:
        """Return all documents in RAG memory (for display in frontend)."""
        all_docs = await asyncio.to_thread(self._chroma.get_all_rag_documents)
        results = []
        for doc in all_docs:
            meta = doc.get("metadata", {})
            results.append({
                "doc_id": doc["id"],
                "content_preview": doc["document"][:300],
                "source": meta.get("source"),
                "is_poisoned": meta.get("poisoned", False),
                "poison_score": meta.get("poison_score"),
                "poison_status": meta.get("poison_status", "clean"),
                "created_at": meta.get("created_at"),
            })
        return results
