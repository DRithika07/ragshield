"""
ml/embedding_generation.py — Sentence Transformer Embedding Generation
═══════════════════════════════════════════════════════════════════════
Converts cleaned text into 384-dim dense vectors using all-MiniLM-L6-v2.

Run SECOND (after preprocess.py):
    cd backend
    python -m ml.embedding_generation

Outputs (written to data/processed/):
    train_embeddings.npy    — shape (N_train, 384) float32
    train_labels.npy        — shape (N_train,)     int32
    test_embeddings.npy     — shape (N_test,  384) float32
    test_labels.npy         — shape (N_test,)      int32
    embedding_meta.json     — model name, dim, timing info

Why save as .npy?
  Embedding generation takes ~2-3 min on CPU for 700 samples.
  Saving to disk means train.py and evaluate.py load in <1 second
  on subsequent runs — no need to re-embed unless data changes.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PROCESSED_DIR = ROOT / "data" / "processed"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM   = 384
BATCH_SIZE      = 64


def load_model():
    """Load SentenceTransformer model. Downloads on first run (~80 MB)."""
    from sentence_transformers import SentenceTransformer
    print(f"  Loading model: {EMBEDDING_MODEL}")
    print("  (First run downloads ~80 MB — cached afterwards)")
    model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"  Model loaded. Max seq length: {model.max_seq_length}")
    return model


def encode_split(
    model,
    texts: list,
    split_name: str,
    batch_size: int = BATCH_SIZE,
) -> np.ndarray:
    """
    Encode a list of texts into L2-normalised embeddings.

    L2 normalisation is critical:
      - Converts cosine similarity to simple dot product
      - Makes ChromaDB's cosine distance space consistent
      - Required for the classifier's similarity score computation
    """
    print(f"\n  Encoding {split_name} ({len(texts)} texts)...")
    start = time.perf_counter()

    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,   # L2 normalize — REQUIRED
        device="cpu",
    )

    duration = time.perf_counter() - start
    rate = len(texts) / duration

    print(f"  ✓ Encoded {len(texts)} samples in {duration:.1f}s ({rate:.0f} texts/sec)")
    print(f"  Shape: {embeddings.shape} | dtype: {embeddings.dtype}")
    print(f"  Norm check (should be ~1.0): {np.linalg.norm(embeddings[0]):.4f}")

    return embeddings.astype(np.float32)


def verify_embeddings(
    embeddings: np.ndarray,
    labels: np.ndarray,
    split_name: str,
) -> None:
    """
    Basic sanity checks on the generated embeddings.
    Catches NaN values, wrong shapes, or un-normalised vectors.
    """
    assert embeddings.ndim == 2, f"Expected 2D array, got {embeddings.ndim}D"
    assert embeddings.shape[1] == EMBEDDING_DIM, \
        f"Expected dim {EMBEDDING_DIM}, got {embeddings.shape[1]}"
    assert len(embeddings) == len(labels), \
        f"Embedding count {len(embeddings)} != label count {len(labels)}"
    assert not np.isnan(embeddings).any(), "NaN values found in embeddings"
    assert not np.isinf(embeddings).any(), "Inf values found in embeddings"

    # Check L2 norms are close to 1.0 (normalised)
    norms = np.linalg.norm(embeddings, axis=1)
    assert norms.min() > 0.95 and norms.max() < 1.05, \
        f"Embeddings not normalised — norms range: [{norms.min():.3f}, {norms.max():.3f}]"

    print(f"  ✓ {split_name} verification passed")


def cosine_similarity_sample_check(
    train_emb: np.ndarray,
    train_labels: np.ndarray,
) -> None:
    """
    Quick semantic check: pick a known malicious prompt embedding,
    find its top-3 nearest neighbors. They should mostly be malicious.
    Proves the embedding space separates safe from malicious inputs.
    """
    malicious_idx = np.where(train_labels == 1)[0]
    if len(malicious_idx) == 0:
        return

    query = train_emb[malicious_idx[0]]
    # Dot product on L2-normalised vectors = cosine similarity
    sims = train_emb @ query
    top_k = np.argsort(sims)[::-1][1:6]   # top 5, excluding self

    neighbor_labels = train_labels[top_k]
    malicious_neighbors = neighbor_labels.sum()

    print(f"\n  Semantic coherence check (malicious → nearest 5 neighbors):")
    print(f"  Malicious neighbors: {malicious_neighbors}/5 "
          f"({'✓ Good' if malicious_neighbors >= 3 else '⚠ Check embeddings'})")


def main():
    print("\n🔢 SENTINEL-RAG — EMBEDDING GENERATION PIPELINE")
    print("=" * 60)

    # 1. Load cleaned data
    train_path = PROCESSED_DIR / "train_clean.csv"
    test_path  = PROCESSED_DIR / "test_clean.csv"

    if not train_path.exists() or not test_path.exists():
        print("❌ ERROR: Cleaned CSVs not found.")
        print("   Run ml/preprocess.py first.")
        sys.exit(1)

    df_train = pd.read_csv(train_path)
    df_test  = pd.read_csv(test_path)

    print(f"  Train loaded: {len(df_train)} rows")
    print(f"  Test loaded : {len(df_test)} rows")

    train_texts  = df_train["text"].tolist()
    train_labels_arr = df_train["label"].values.astype(np.int32)
    test_texts   = df_test["text"].tolist()
    test_labels_arr  = df_test["label"].values.astype(np.int32)

    # 2. Load model
    print(f"\n{'='*60}")
    print("  LOADING SENTENCE TRANSFORMER MODEL")
    print(f"{'='*60}")
    model = load_model()

    total_start = time.perf_counter()

    # 3. Generate embeddings
    print(f"\n{'='*60}")
    print("  GENERATING EMBEDDINGS")
    print(f"{'='*60}")

    train_emb = encode_split(model, train_texts, "TRAIN")
    test_emb  = encode_split(model, test_texts,  "TEST")

    total_time = time.perf_counter() - total_start

    # 4. Verification
    print(f"\n{'='*60}")
    print("  VERIFICATION")
    print(f"{'='*60}")
    verify_embeddings(train_emb, train_labels_arr, "TRAIN")
    verify_embeddings(test_emb,  test_labels_arr,  "TEST")
    cosine_similarity_sample_check(train_emb, train_labels_arr)

    # 5. Save to disk
    print(f"\n{'='*60}")
    print("  SAVING ARTIFACTS")
    print(f"{'='*60}")

    np.save(PROCESSED_DIR / "train_embeddings.npy", train_emb)
    np.save(PROCESSED_DIR / "train_labels.npy",     train_labels_arr)
    np.save(PROCESSED_DIR / "test_embeddings.npy",  test_emb)
    np.save(PROCESSED_DIR / "test_labels.npy",      test_labels_arr)

    print(f"  ✓ train_embeddings.npy — {train_emb.shape}")
    print(f"  ✓ train_labels.npy     — {train_labels_arr.shape}")
    print(f"  ✓ test_embeddings.npy  — {test_emb.shape}")
    print(f"  ✓ test_labels.npy      — {test_labels_arr.shape}")

    # 6. Save metadata
    meta = {
        "model_name":       EMBEDDING_MODEL,
        "embedding_dim":    EMBEDDING_DIM,
        "normalize":        True,
        "batch_size":       BATCH_SIZE,
        "total_time_sec":   round(total_time, 2),
        "train_shape":      list(train_emb.shape),
        "test_shape":       list(test_emb.shape),
        "train_label_dist": {
            "safe":      int((train_labels_arr == 0).sum()),
            "malicious": int((train_labels_arr == 1).sum()),
        },
        "test_label_dist": {
            "safe":      int((test_labels_arr == 0).sum()),
            "malicious": int((test_labels_arr == 1).sum()),
        },
    }
    with open(PROCESSED_DIR / "embedding_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  ✓ embedding_meta.json")
    print(f"\n  Total time: {total_time:.1f}s")
    print("\n✅ Embedding generation complete. Run ml/train.py next.")


if __name__ == "__main__":
    main()
