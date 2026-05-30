"""
preprocessing.py — Text Preprocessing Utilities
════════════════════════════════════════════════
Shared text cleaning used by both the ML training pipeline
and the live API. Keeping these in one place ensures that
training and inference use identical preprocessing.
"""

import hashlib
import re
from typing import List, Tuple

import pandas as pd


def clean_text(text: str) -> str:
    """
    Standard text cleaning for prompt analysis.
    Preserves semantic content while removing noise.
    Intentionally does NOT remove injection patterns.
    """
    if not isinstance(text, str):
        text = str(text)
    text = re.sub(r"<[^>]+>", " ", text)            # strip HTML tags
    text = re.sub(r"http\S+|www\.\S+", " ", text)   # strip URLs
    text = re.sub(r"\s+", " ", text)                 # collapse whitespace
    text = re.sub(r"[^\x20-\x7E\u00A0-\uFFFF]", "", text)  # remove non-printable
    return text.strip()


def truncate_words(text: str, max_words: int = 512) -> str:
    """Truncate text to max_words words."""
    words = text.split()
    return " ".join(words[:max_words]) if len(words) > max_words else text


def sha256_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_and_clean_csv(path: str) -> pd.DataFrame:
    """
    Load a prompt injection CSV, clean text, drop nulls.
    Expects columns: [text, label]
    """
    df = pd.read_csv(path)
    required = {"text", "label"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {required}. Got: {set(df.columns)}")
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].apply(clean_text)
    df["text"] = df["text"].apply(truncate_words)
    df = df[df["text"].str.len() > 2]          # drop empty rows after cleaning
    df["label"] = df["label"].astype(int)
    df = df[df["label"].isin([0, 1])]           # keep only valid labels
    df = df.drop_duplicates(subset=["text"])    # remove exact duplicates
    df = df.reset_index(drop=True)
    return df


def get_label_distribution(df: pd.DataFrame) -> dict:
    counts = df["label"].value_counts().to_dict()
    total = len(df)
    return {
        "total": total,
        "safe": counts.get(0, 0),
        "malicious": counts.get(1, 0),
        "safe_pct": round(counts.get(0, 0) / total * 100, 1),
        "malicious_pct": round(counts.get(1, 0) / total * 100, 1),
    }
