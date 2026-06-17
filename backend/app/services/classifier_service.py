"""
classifier_service.py — Threat Classification Service
══════════════════════════════════════════════════════
Combines two signals to produce a final threat decision:

  Signal 1 — ML Classifier (sklearn / XGBoost)
    A supervised model trained on the prompt injection dataset.
    Outputs probability that a prompt is malicious (0.0 – 1.0).
    Fast, deterministic, good at patterns seen during training.

  Signal 2 — Vector Similarity (ChromaDB cosine search)
    Compare the prompt's embedding against the threat library.
    Average label of the k nearest malicious neighbors.
    Catches novel attacks semantically similar to known ones.

  Fusion Score = (ML_weight × ML_score) + (Sim_weight × Sim_score)
  Default weights: 0.60 ML + 0.40 similarity

Fallback: If no trained model file exists on disk, the service runs
in similarity-only mode (100% weight on vector similarity). This
ensures the API works before the ML pipeline is run.
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.config import settings
from app.services.chromadb_service import ChromaDBService
from app.services.embedding_service import EmbeddingService
from app.utils.logger import get_logger

log = get_logger(__name__)


class ClassifierService:
    """
    Orchestrates the two-signal threat classification pipeline.

    Instantiated once as a singleton via dependencies.py.
    Holds references to EmbeddingService and ChromaDBService
    (both already singletons — no double loading).
    """

    def __init__(
        self,
        embedding_svc: EmbeddingService,
        chroma_svc: ChromaDBService,
    ) -> None:
        self._embed = embedding_svc
        self._chroma = chroma_svc
        self._model = None          # sklearn / XGBoost model (lazy loaded)
        self._model_loaded = False
        self._similarity_only = False

        self._try_load_model()

    # ── Model Loading ─────────────────────────────────────────────────

    def _try_load_model(self) -> None:
        """
        Attempt to load the trained classifier from disk.
        If the file doesn't exist, silently fall back to similarity-only mode.
        Logs clearly so the developer knows which mode is active.
        """
        model_path = Path(settings.model_path)

        if not model_path.exists():
            log.warning(
                f"No trained model found at '{model_path}'. "
                "Running in SIMILARITY-ONLY mode. "
                "Run ml/train.py to enable ML classification."
            )
            self._similarity_only = True
            return

        try:
            import joblib
            self._model = joblib.load(str(model_path))
            self._model_loaded = True
            log.info(f"ML classifier loaded from: {model_path}")
        except Exception as e:
            log.error(f"Failed to load model from '{model_path}': {e}")
            self._similarity_only = True

    # ── Core Classification ───────────────────────────────────────────

    def classify(
        self,
        text: str,
        embedding: Optional[List[float]] = None,
    ) -> Dict:
        """
        Synchronous classification of a single text.

        Args:
            text: The raw prompt text to classify
            embedding: Pre-computed embedding (skip re-encoding if provided)

        Returns dict with:
            ml_score        : float  — ML classifier probability (0–1)
            similarity_score: float  — avg cosine sim to malicious neighbors
            fusion_score    : float  — weighted combination
            predicted_label : int    — 0=safe, 1=malicious
            is_malicious    : bool
            severity        : str    — LOW | MEDIUM | HIGH | CRITICAL
            attack_type     : str    — inferred attack category
            top_similar     : list   — nearest neighbors from threat library
        """
        # Step 1: Get embedding (reuse if provided)
        if embedding is None:
            embedding, _ = self._embed.embed(text)

        # Step 2: Vector similarity search against threat library
        similar_docs = self._chroma.query_threat_library(
            query_embedding=embedding,
            top_k=settings.top_k_similar,
        )

        similarity_score = self._compute_similarity_score(similar_docs)

        # Step 3: ML classifier (if model is loaded)
        ml_score = self._compute_ml_score(embedding)

        # Step 4: Fuse scores
        fusion_score = self._fuse_scores(ml_score, similarity_score)

        # Step 5: Threshold decision
        predicted_label = 1 if fusion_score >= settings.threat_threshold else 0
        is_malicious = predicted_label == 1

        # Step 6: Severity and attack type
        severity = self._compute_severity(fusion_score)
        attack_type = self._infer_attack_type(text, similar_docs, fusion_score)
        if attack_type != "safe":
            predicted_label = 1
            is_malicious = True
            if fusion_score < settings.threat_threshold:
                fusion_score = settings.threat_threshold
        severity = self._compute_severity(fusion_score)

        result = {
            "ml_score": round(ml_score, 4),
            "similarity_score": round(similarity_score, 4),
            "fusion_score": round(fusion_score, 4),
            "predicted_label": predicted_label,
            "is_malicious": is_malicious,
            "severity": severity,
            "attack_type": attack_type,
            "top_similar": similar_docs[:3],   # top 3 for explanation context
            "mode": "similarity_only" if self._similarity_only else "ml_fusion",
        }

        log.debug(
            f"Classification complete. "
            f"fusion={fusion_score:.3f} label={predicted_label} "
            f"severity={severity}"
        )
        return result

    async def aclassify(
        self,
        text: str,
        embedding: Optional[List[float]] = None,
    ) -> Dict:
        """Async wrapper — runs classify() in thread pool."""
        return await asyncio.to_thread(self.classify, text, embedding)

    def classify_batch(self, texts: List[str]) -> List[Dict]:
        """
        Classify multiple texts efficiently.
        Embeddings are generated in one batched call,
        then each text is classified individually.
        """
        # Batch-encode all texts at once (much faster than one-by-one)
        embedding_results = self._embed.embed_batch(texts)

        results = []
        for text, (embedding, _) in zip(texts, embedding_results):
            result = self.classify(text, embedding=embedding)
            results.append(result)

        return results

    async def aclassify_batch(self, texts: List[str]) -> List[Dict]:
        """Async wrapper for batch classification."""
        return await asyncio.to_thread(self.classify_batch, texts)

    # ── Score Computation ─────────────────────────────────────────────

    def _compute_similarity_score(self, similar_docs: List[Dict]) -> float:
        """
        Compute a similarity-based threat score from ChromaDB results.

        Strategy: weighted average of similarity scores from MALICIOUS
        neighbors only. Safe neighbors don't contribute to the threat score
        (they would pull it down unfairly for borderline prompts).

        If no malicious neighbors are found → score = 0.0
        """
        if not similar_docs:
            return 0.0

        malicious = [
            d for d in similar_docs
            if d.get("metadata", {}).get("label") == 1
        ]

        if not malicious:
            return 0.0

        # Weight by similarity — closer neighbors matter more
        total_weight = sum(d["similarity"] for d in malicious)
        if total_weight == 0:
            return 0.0

        weighted_score = sum(
            d["similarity"] * d["similarity"]   # similarity²: emphasise close matches
            for d in malicious
        ) / total_weight

        return min(1.0, max(0.0, weighted_score))

    def _compute_ml_score(self, embedding: List[float]) -> float:
        """
        Run the embedding through the trained ML classifier.
        Returns probability of class 1 (malicious).

        Falls back to 0.5 (uncertain) if model isn't loaded,
        which means fusion score = 0.5×0.6 + sim×0.4 = sim-dominant.
        """
        if not self._model_loaded or self._model is None:
            # Similarity-only mode: return neutral ML score
            return 0.5

        try:
            vec = np.array(embedding, dtype=np.float32).reshape(1, -1)
            # predict_proba returns [[prob_class0, prob_class1]]
            proba = self._model.predict_proba(vec)[0]
            return float(proba[1])   # probability of class 1 (malicious)
        except Exception as e:
            log.warning(f"ML classifier inference failed: {e}. Using 0.5.")
            return 0.5

    def _fuse_scores(self, ml_score: float, similarity_score: float) -> float:
        """
        Weighted fusion of ML and similarity scores.

        In similarity-only mode: weight shifts entirely to similarity.
        In ML mode: configurable weights from settings (default 60/40).
        """
        if self._similarity_only:
            return similarity_score

        ml_w = settings.ml_score_weight
        sim_w = settings.similarity_score_weight

        # Normalise weights in case they don't sum to 1.0
        total = ml_w + sim_w
        ml_w /= total
        sim_w /= total

        return min(1.0, max(0.0, (ml_w * ml_score) + (sim_w * similarity_score)))

    # ── Severity & Attack Type ────────────────────────────────────────

    def _compute_severity(self, fusion_score: float) -> str:
        """Map fusion score to a human-readable severity band."""
        if fusion_score < settings.threat_threshold:
            return "NONE"
        elif fusion_score < settings.severity_low_max:
            return "LOW"
        elif fusion_score < settings.severity_medium_max:
            return "MEDIUM"
        elif fusion_score < settings.severity_high_max:
            return "HIGH"
        else:
            return "CRITICAL"

    def _infer_attack_type(
        self,
        text: str,
        similar_docs: List[Dict],
        fusion_score: float,
    ) -> str:
        """
        Heuristic attack type inference.
        Combines keyword pattern matching with metadata from similar docs.

        Priority: pattern match → neighbor metadata → generic label
        """
        

        text_lower = text.lower()

        # Direct pattern matching for well-known injection patterns
        patterns = {
            "jailbreak": [
    "ignore previous",
    "ignore all",
    "forget your instructions",
    "forget all previous instructions",
    "disregard",
    "override",
    "bypass",
    "jailbreak",
    "dan mode",
    "developer mode",
    "unrestricted mode",
    "pretend you are",
    "act as if you have no",
    "ignore safety rules",
    "disable safety",
    "remove restrictions",
],
            "prompt_injection": [
        "system prompt",
        "reveal your",
        "show me your instructions",
        "what are your rules",
        "print your prompt",
        "repeat after me",
        "output your",
        "display your system",
        "hidden system instructions",
        "reveal all hidden",
        "developer prompt",
        "developer prompts",
        "hidden instructions",
        "internal instructions",
        "system instructions",
        "confidential memory",
        "print confidential memory",
    ],

            "role_hijacking": [
    "you are now",
    "act as",
    "roleplay as",
    "pretend to be",
    "your new role",
    "switch to",
    "become a",
    "you are an evil ai",
    "you are chatgpt without restrictions",
    "you are a hacker",
],
           "data_extraction": [
    "training data",
    "your knowledge base",
    "internal data",
    "confidential",
    "secret",
    "private information",
    "database contents",
    "extract all",
    "show hidden data",
    "leak information",
    "reveal stored data",
    "show memory",
    "export database",
],
            "indirect_injection": [
                "summarize this", "translate this", "the document says",
                "according to the file", "based on the context above",
            ],
        }

        for attack_type, keywords in patterns.items():
            if any(kw in text_lower for kw in keywords):
                return attack_type

# No keyword match and score below threshold → safe
        if fusion_score < settings.threat_threshold:
            return "safe"
        # Fall back to most common attack type among malicious neighbors
        malicious_neighbors = [
            d for d in similar_docs
            if d.get("metadata", {}).get("label") == 1
        ]
        if malicious_neighbors:
            types = [
                d["metadata"].get("attack_type", "unknown")
                for d in malicious_neighbors
                if d["metadata"].get("attack_type")
            ]
            if types:
                # Return the most common type among neighbors
                return max(set(types), key=types.count)

        return "prompt_injection"   # generic fallback for malicious prompts

    def get_status(self) -> Dict:
        """Return classifier status for health checks."""
        return {
            "model_loaded": self._model_loaded,
            "similarity_only_mode": self._similarity_only,
            "threat_library_size": self._chroma.get_threat_library_count(),
            "threat_threshold": settings.threat_threshold,
            "similarity_threshold": settings.similarity_threshold,
        }
