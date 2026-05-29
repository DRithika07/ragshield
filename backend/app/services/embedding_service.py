"""
embedding_service.py — Sentence Transformer Embedding Service
══════════════════════════════════════════════════════════════
Converts raw text into dense vector representations (embeddings).
These vectors capture semantic meaning — two texts with similar meaning
will have high cosine similarity even if they use different words.

This is why vector similarity can catch novel injection attacks
that don't match exact string patterns but are semantically similar
to known attacks in the training library.

Model: all-MiniLM-L6-v2
  - Output: 384-dimensional float32 vectors
  - Speed: ~1000 sentences/sec on CPU
  - Quality: excellent for semantic similarity tasks
  - Size: ~80 MB download (cached after first use)
"""

import asyncio
import hashlib
import re
from functools import lru_cache
from typing import List, Optional, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import settings
from app.utils.logger import get_logger

log = get_logger(__name__)


class EmbeddingService:
    """
    Wraps SentenceTransformer with:
      - Lazy model loading (loaded on first call)
      - Input sanitization before embedding
      - Batch encoding for efficiency
      - In-memory LRU cache for repeated prompts
      - Async wrapper for non-blocking FastAPI calls
    """

    def __init__(self) -> None:
        self._model: Optional[SentenceTransformer] = None
        self._model_name = settings.embedding_model
        self._device = settings.embedding_device
        self._dim = settings.embedding_dim
        # Simple in-memory cache: {prompt_hash: embedding}
        # Prevents re-embedding the exact same prompt twice
        self._cache: dict = {}
        self._cache_hits = 0
        self._cache_misses = 0
        log.info(
            f"EmbeddingService configured. "
            f"Model: {self._model_name} | Device: {self._device}"
        )

    @property
    def model(self) -> SentenceTransformer:
        """
        Lazy-load the SentenceTransformer model.
        First access triggers download + load (~2-3s on CPU).
        Subsequent accesses return the cached model instantly.
        """
        if self._model is None:
            log.info(f"Loading SentenceTransformer model: {self._model_name} ...")
            self._model = SentenceTransformer(
                self._model_name,
                device=self._device,
            )
            log.info(f"Model loaded. Embedding dim: {self._dim}")
        return self._model

    # ── Text Sanitization ─────────────────────────────────────────────

    @staticmethod
    def sanitize(text: str) -> str:
        """
        Clean input text before embedding.
        We want to preserve semantic content while removing noise.

        NOTE: We intentionally do NOT remove injection-looking patterns
        (like "ignore previous instructions") — the model needs to see
        these patterns to correctly compute their semantic position
        in the vector space close to other attacks.
        """
        # Collapse multiple whitespace/newlines to single space
        text = re.sub(r"\s+", " ", text)
        # Remove non-printable characters
        text = re.sub(r"[^\x20-\x7E\u00A0-\uFFFF]", "", text)
        # Truncate to 512 words (model max context)
        words = text.split()
        if len(words) > 512:
            text = " ".join(words[:512])
            log.debug(f"Text truncated from {len(words)} to 512 words")
        return text.strip()

    @staticmethod
    def _hash(text: str) -> str:
        """SHA-256 hash of text — used as cache key and for DB dedup."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    # ── Single Embedding ──────────────────────────────────────────────

    def embed(self, text: str) -> Tuple[List[float], str]:
        """
        Embed a single text string.
        Returns: (embedding_list, prompt_hash)

        Uses in-memory cache — repeated calls with the same text
        return instantly without running the model again.
        """
        clean_text = self.sanitize(text)
        text_hash = self._hash(clean_text)

        if text_hash in self._cache:
            self._cache_hits += 1
            log.debug(f"Cache hit for prompt hash: {text_hash[:12]}...")
            return self._cache[text_hash], text_hash

        self._cache_misses += 1
        vector = self.model.encode(
            clean_text,
            convert_to_numpy=True,
            normalize_embeddings=True,   # L2-normalize for cosine similarity
            show_progress_bar=False,
        )

        embedding = vector.tolist()
        self._cache[text_hash] = embedding

        # Prevent unbounded cache growth (keep last 1000 embeddings)
        if len(self._cache) > 1000:
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]

        log.debug(
            f"Embedded text. Hash: {text_hash[:12]}... "
            f"Cache size: {len(self._cache)}"
        )
        return embedding, text_hash

    # ── Batch Embedding ───────────────────────────────────────────────

    def embed_batch(
        self,
        texts: List[str],
        batch_size: int = None,
    ) -> List[Tuple[List[float], str]]:
        """
        Embed a list of texts efficiently using batched inference.
        Skips texts that are already cached.
        Returns: list of (embedding, hash) tuples in the same order as input.
        """
        batch_size = batch_size or settings.embedding_batch_size

        # Check cache for each text
        results = []
        uncached_indices = []
        uncached_texts = []
        hashes = []

        for i, text in enumerate(texts):
            clean = self.sanitize(text)
            h = self._hash(clean)
            hashes.append(h)
            if h in self._cache:
                results.append((self._cache[h], h))
                self._cache_hits += 1
            else:
                results.append(None)          # placeholder
                uncached_indices.append(i)
                uncached_texts.append(clean)
                self._cache_misses += 1

        # Batch-encode only uncached texts
        if uncached_texts:
            log.info(f"Batch encoding {len(uncached_texts)} texts...")
            vectors = self.model.encode(
                uncached_texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=len(uncached_texts) > 100,
            )

            for idx, (orig_i, text) in enumerate(zip(uncached_indices, uncached_texts)):
                embedding = vectors[idx].tolist()
                h = hashes[orig_i]
                self._cache[h] = embedding
                results[orig_i] = (embedding, h)

        log.info(
            f"Batch complete. "
            f"Cached: {self._cache_hits} hits, {self._cache_misses} misses"
        )
        return results

    # ── Async Wrappers ────────────────────────────────────────────────

    async def aembed(self, text: str) -> Tuple[List[float], str]:
        """
        Async wrapper for embed().
        Runs the synchronous model inference in a thread pool
        so it doesn't block the FastAPI event loop.
        """
        return await asyncio.to_thread(self.embed, text)

    async def aembed_batch(
        self,
        texts: List[str],
        batch_size: int = None,
    ) -> List[Tuple[List[float], str]]:
        """Async wrapper for embed_batch()."""
        return await asyncio.to_thread(self.embed_batch, texts, batch_size)

    # ── Utilities ─────────────────────────────────────────────────────

    @staticmethod
    def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
        """
        Compute cosine similarity between two L2-normalized vectors.
        Since we normalize on encoding, this reduces to a dot product.
        Returns value in [-1, 1] — clamped to [0, 1] for our use case.
        """
        a = np.array(vec_a, dtype=np.float32)
        b = np.array(vec_b, dtype=np.float32)
        similarity = float(np.dot(a, b))
        return max(0.0, min(1.0, similarity))

    def get_cache_stats(self) -> dict:
        """Return cache performance metrics for the health endpoint."""
        total = self._cache_hits + self._cache_misses
        return {
            "cache_size": len(self._cache),
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "hit_rate": round(self._cache_hits / total, 3) if total > 0 else 0.0,
        }
