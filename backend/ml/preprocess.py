"""
ml/preprocess.py — Dataset Preprocessing Pipeline
══════════════════════════════════════════════════
Loads train_prompt_injection.csv and test_prompt_injection.csv,
cleans text, analyzes distribution, and saves processed artifacts.

Run FIRST before any other ML script:
    cd backend
    python -m ml.preprocess

Outputs (written to data/processed/):
    train_clean.csv         — cleaned training data
    test_clean.csv          — cleaned test data
    dataset_stats.json      — label distribution, class weights
    preprocessing_report.txt — human-readable summary
"""

import json
import os
import re
import sys
import warnings
from pathlib import Path

# ── Path setup ─────────────────────────────────────────────────────────
# Allow running as `python -m ml.preprocess` from backend/
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from sklearn.utils.class_weight import compute_class_weight

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────
RAW_DIR       = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
TRAIN_RAW     = RAW_DIR / "train_prompt_injection.csv"
TEST_RAW      = RAW_DIR / "test_prompt_injection.csv"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════
# TEXT CLEANING
# ══════════════════════════════════════════════════════════════════════

def clean_text(text: str) -> str:
    """
    Clean a single prompt text for embedding.

    Rules:
      - Preserve semantic content (especially injection patterns)
      - Remove HTML tags, URLs, non-printable characters
      - Collapse whitespace
      - Truncate to 512 words (model context limit)

    IMPORTANT: We do NOT stem, lemmatize, or remove stopwords.
    Sentence Transformers work on full sentences; stemming
    destroys the contextual signals the model relies on.
    """
    if not isinstance(text, str):
        text = str(text) if text is not None else ""

    # Strip HTML tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Strip URLs
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    # Remove non-printable / control characters (keep unicode letters)
    text = re.sub(r"[\x00-\x1f\x7f]", " ", text)
    # Collapse multiple whitespace / newlines to single space
    text = re.sub(r"\s+", " ", text)
    text = text.strip()

    # Truncate to 512 words
    words = text.split()
    if len(words) > 512:
        text = " ".join(words[:512])

    return text


def is_valid_row(text: str, label: int) -> bool:
    """Return True if the row should be kept after cleaning."""
    if not isinstance(text, str) or len(text.strip()) < 3:
        return False
    if label not in (0, 1):
        return False
    return True


# ══════════════════════════════════════════════════════════════════════
# LOADING & CLEANING
# ══════════════════════════════════════════════════════════════════════

def load_and_clean(csv_path: Path, split_name: str) -> pd.DataFrame:
    """
    Load a CSV file and apply full cleaning pipeline.
    Returns a clean DataFrame with columns: [text, label, text_length, word_count]
    """
    print(f"\n{'='*60}")
    print(f"  Loading {split_name}: {csv_path.name}")
    print(f"{'='*60}")

    df = pd.read_csv(csv_path)
    original_count = len(df)
    print(f"  Raw rows       : {original_count}")

    # Validate required columns
    required = {"text", "label"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV '{csv_path.name}' missing columns: {missing}. "
            f"Found: {list(df.columns)}"
        )

    # Drop rows with null text or label
    df = df.dropna(subset=["text", "label"])
    df["label"] = df["label"].astype(int)

    # Keep only valid labels
    df = df[df["label"].isin([0, 1])]

    # Clean text
    df["text"] = df["text"].apply(clean_text)

    # Drop rows that became empty or too short after cleaning
    df = df[df.apply(lambda r: is_valid_row(r["text"], r["label"]), axis=1)]

    # Remove exact duplicates (same text AND same label)
    before_dedup = len(df)
    df = df.drop_duplicates(subset=["text"])
    after_dedup = len(df)
    dupes_removed = before_dedup - after_dedup

    # Add useful metadata columns
    df["text_length"] = df["text"].apply(len)
    df["word_count"]  = df["text"].apply(lambda t: len(t.split()))

    df = df.reset_index(drop=True)

    # Print summary
    safe_count      = (df["label"] == 0).sum()
    malicious_count = (df["label"] == 1).sum()
    print(f"  After cleaning : {len(df)} rows ({original_count - len(df)} removed)")
    print(f"  Duplicates     : {dupes_removed} removed")
    print(f"  Label 0 (safe) : {safe_count} ({safe_count/len(df)*100:.1f}%)")
    print(f"  Label 1 (malicious): {malicious_count} ({malicious_count/len(df)*100:.1f}%)")
    print(f"  Avg text length: {df['text_length'].mean():.0f} chars")
    print(f"  Avg word count : {df['word_count'].mean():.1f} words")
    print(f"  Min/Max words  : {df['word_count'].min()} / {df['word_count'].max()}")

    return df


# ══════════════════════════════════════════════════════════════════════
# CLASS IMBALANCE ANALYSIS
# ══════════════════════════════════════════════════════════════════════

def analyze_imbalance(df_train: pd.DataFrame) -> dict:
    """
    Compute class weights for handling imbalance.

    Our dataset: 63% safe, 37% malicious.
    Strategy: use class_weight='balanced' in sklearn models.
    This gives higher penalty to misclassifying the minority class.

    We do NOT use SMOTE because:
    - Our embeddings are 384-dimensional (SMOTE works poorly in high dims)
    - Balanced class weights achieve equivalent effect for linear models
    - XGBoost has its own scale_pos_weight parameter
    """
    labels = df_train["label"].values
    classes = np.unique(labels)

    weights = compute_class_weight(
        class_weight="balanced",
        classes=classes,
        y=labels,
    )
    class_weight_dict = dict(zip(classes.tolist(), weights.tolist()))

    safe_count      = (labels == 0).sum()
    malicious_count = (labels == 1).sum()
    imbalance_ratio = safe_count / malicious_count

    # XGBoost scale_pos_weight = count(negative) / count(positive)
    scale_pos_weight = float(safe_count) / float(malicious_count)

    print(f"\n{'='*60}")
    print("  CLASS IMBALANCE ANALYSIS")
    print(f"{'='*60}")
    print(f"  Safe (0)      : {safe_count}")
    print(f"  Malicious (1) : {malicious_count}")
    print(f"  Imbalance ratio: {imbalance_ratio:.2f}:1")
    print(f"  Class weights : {class_weight_dict}")
    print(f"  XGB scale_pos_weight: {scale_pos_weight:.3f}")
    print(f"  Strategy: class_weight='balanced' (no SMOTE — high-dim embeddings)")

    return {
        "safe_count": int(safe_count),
        "malicious_count": int(malicious_count),
        "imbalance_ratio": round(imbalance_ratio, 3),
        "class_weights": {str(k): round(v, 4) for k, v in class_weight_dict.items()},
        "scale_pos_weight": round(scale_pos_weight, 4),
        "strategy": "balanced_class_weights",
    }


# ══════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════

def main():
    print("\n🔧 SENTINEL-RAG — DATA PREPROCESSING PIPELINE")
    print("=" * 60)

    # 1. Load and clean
    df_train = load_and_clean(TRAIN_RAW, "TRAIN")
    df_test  = load_and_clean(TEST_RAW,  "TEST")

    # 2. Imbalance analysis
    imbalance_stats = analyze_imbalance(df_train)

    # 3. Save processed CSVs
    train_out = PROCESSED_DIR / "train_clean.csv"
    test_out  = PROCESSED_DIR / "test_clean.csv"
    df_train.to_csv(train_out, index=False)
    df_test.to_csv(test_out,  index=False)
    print(f"\n✓ Saved: {train_out}")
    print(f"✓ Saved: {test_out}")

    # 4. Save dataset statistics JSON (used by train.py)
    stats = {
        "train": {
            "total": len(df_train),
            "safe": int((df_train["label"] == 0).sum()),
            "malicious": int((df_train["label"] == 1).sum()),
            "avg_word_count": round(df_train["word_count"].mean(), 1),
        },
        "test": {
            "total": len(df_test),
            "safe": int((df_test["label"] == 0).sum()),
            "malicious": int((df_test["label"] == 1).sum()),
            "avg_word_count": round(df_test["word_count"].mean(), 1),
        },
        "imbalance": imbalance_stats,
        "embedding_model": "all-MiniLM-L6-v2",
        "embedding_dim": 384,
    }

    stats_path = PROCESSED_DIR / "dataset_stats.json"
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"✓ Saved: {stats_path}")

    # 5. Human-readable preprocessing report
    report_path = PROCESSED_DIR / "preprocessing_report.txt"
    with open(report_path, "w") as f:
        f.write("SENTINEL-RAG — PREPROCESSING REPORT\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Train samples  : {stats['train']['total']}\n")
        f.write(f"  Safe (0)     : {stats['train']['safe']}\n")
        f.write(f"  Malicious (1): {stats['train']['malicious']}\n\n")
        f.write(f"Test samples   : {stats['test']['total']}\n")
        f.write(f"  Safe (0)     : {stats['test']['safe']}\n")
        f.write(f"  Malicious (1): {stats['test']['malicious']}\n\n")
        f.write(f"Imbalance ratio: {imbalance_stats['imbalance_ratio']}:1\n")
        f.write(f"Class weights  : {imbalance_stats['class_weights']}\n")
        f.write(f"XGB pos_weight : {imbalance_stats['scale_pos_weight']}\n\n")
        f.write("Cleaning steps applied:\n")
        f.write("  1. Strip HTML tags\n")
        f.write("  2. Remove URLs\n")
        f.write("  3. Remove non-printable characters\n")
        f.write("  4. Collapse whitespace\n")
        f.write("  5. Truncate to 512 words\n")
        f.write("  6. Remove exact duplicates\n")
        f.write("  7. Drop rows with < 3 characters\n")

    print(f"✓ Saved: {report_path}")
    print("\n✅ Preprocessing complete. Run ml/embedding_generation.py next.")


if __name__ == "__main__":
    main()
