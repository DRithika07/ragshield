"""
ml/visualize_embeddings.py — Embedding Space Visualization
════════════════════════════════════════════════════════════
Projects 384-dim embeddings to 2D using UMAP for visualization.
Shows cluster separation between safe and malicious prompts.

Run ANYTIME after embedding_generation.py:
    cd backend
    python -m ml.visualize_embeddings

Outputs (written to ml/plots/):
    umap_embedding_space.png    — main UMAP scatter plot
    umap_attack_types.png       — colored by attack type
    umap_train_test_split.png   — shows train vs test distribution
"""

import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PROCESSED_DIR = ROOT / "data" / "processed"
PLOTS_DIR     = ROOT / "ml" / "plots"
PLOTS_DIR.mkdir(parents=True, exist_ok=True)

PALETTE = {
    "bg":       "#0a0c14",
    "panel":    "#111827",
    "safe":     "#22c55e",      # neon green for safe prompts
    "malicious":"#ef4444",      # red for malicious
    "test_safe":"#86efac",      # lighter green for test safe
    "test_mal": "#fca5a5",      # lighter red for test malicious
    "accent":   "#6366f1",
    "text":     "#e2e8f0",
    "grid":     "#1e293b",
    "types": {
        "jailbreak":       "#f59e0b",
        "role_hijacking":  "#8b5cf6",
        "prompt_injection":"#ef4444",
        "data_extraction": "#06b6d4",
        "indirect_injection":"#ec4899",
        "safe":            "#22c55e",
    },
}

ATTACK_TYPE_PATTERNS = {
    "jailbreak": ["ignore previous","ignore all","forget","disregard","override","bypass","jailbreak","DAN"],
    "role_hijacking": ["you are now","act as","roleplay","pretend to be","your new role","I want you to act"],
    "prompt_injection": ["show me your prompt","reveal your","print your","system prompt","new task","now new tasks"],
    "data_extraction": ["training data","confidential","secret","internal","database","extract"],
}


def infer_attack_type(text: str, label: int) -> str:
    if label == 0:
        return "safe"
    text_lower = text.lower()
    for atype, kws in ATTACK_TYPE_PATTERNS.items():
        if any(kw.lower() in text_lower for kw in kws):
            return atype
    return "prompt_injection"


def run_umap(
    embeddings: np.ndarray,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    seed: int = 42,
) -> np.ndarray:
    """Run UMAP dimensionality reduction on embeddings."""
    from umap import UMAP
    print(f"  Running UMAP on {embeddings.shape[0]} embeddings "
          f"(n_neighbors={n_neighbors}, min_dist={min_dist})...")
    umap_model = UMAP(
        n_components=2,
        n_neighbors=min(n_neighbors, len(embeddings) - 1),
        min_dist=min_dist,
        metric="cosine",
        random_state=seed,
    )
    coords = umap_model.fit_transform(embeddings)
    print(f"  UMAP complete. Output shape: {coords.shape}")
    return coords


def plot_main_scatter(
    coords_train: np.ndarray,
    y_train: np.ndarray,
    coords_test: np.ndarray,
    y_test: np.ndarray,
) -> None:
    """Main UMAP scatter — safe vs malicious, train + test."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(12, 9))

    # Train points (larger, more opaque)
    for label, color, marker, name in [
        (0, PALETTE["safe"],     "o", "Safe (Train)"),
        (1, PALETTE["malicious"],"o", "Malicious (Train)"),
    ]:
        mask = y_train == label
        ax.scatter(
            coords_train[mask, 0], coords_train[mask, 1],
            c=color, s=45, alpha=0.75, label=name,
            edgecolors="none",
        )

    # Test points (smaller, diamond marker)
    for label, color, name in [
        (0, PALETTE["test_safe"], "Safe (Test)"),
        (1, PALETTE["test_mal"],  "Malicious (Test)"),
    ]:
        mask = y_test == label
        ax.scatter(
            coords_test[mask, 0], coords_test[mask, 1],
            c=color, s=30, alpha=0.9, label=name,
            marker="D", edgecolors="none",
        )

    ax.set_facecolor(PALETTE["panel"])
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_xlabel("UMAP Dimension 1", fontsize=13, color=PALETTE["text"])
    ax.set_ylabel("UMAP Dimension 2", fontsize=13, color=PALETTE["text"])
    ax.set_title(
        "🛡 SENTINEL-RAG — Embedding Space (UMAP 2D)\n"
        "Safe vs Malicious Prompt Clusters | Model: all-MiniLM-L6-v2",
        fontsize=14, color=PALETTE["accent"], pad=15,
    )
    ax.tick_params(colors=PALETTE["text"])
    ax.legend(fontsize=11, markerscale=1.5, framealpha=0.8)
    ax.grid(True, alpha=0.15, color=PALETTE["grid"])

    # Annotation
    ax.annotate(
        "Tightly clustered malicious prompts\n→ semantic similarity enables detection",
        xy=(0.02, 0.02), xycoords="axes fraction",
        fontsize=9, color=PALETTE["text"], alpha=0.7,
    )

    plt.tight_layout()
    path = PLOTS_DIR / "umap_embedding_space.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Saved: {path.name}")


def plot_attack_types(
    coords_train: np.ndarray,
    train_texts: list,
    y_train: np.ndarray,
) -> None:
    """UMAP colored by attack type."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    attack_types = [infer_attack_type(t, l) for t, l in zip(train_texts, y_train)]

    fig, ax = plt.subplots(figsize=(13, 9))
    ax.set_facecolor(PALETTE["panel"])
    fig.patch.set_facecolor(PALETTE["bg"])

    type_colors = PALETTE["types"]
    for atype, color in type_colors.items():
        mask = [i for i, at in enumerate(attack_types) if at == atype]
        if not mask:
            continue
        ax.scatter(
            coords_train[mask, 0], coords_train[mask, 1],
            c=color, s=50, alpha=0.80,
            label=atype.replace("_", " ").title(),
            edgecolors="none",
        )

    ax.set_xlabel("UMAP Dimension 1", fontsize=13, color=PALETTE["text"])
    ax.set_ylabel("UMAP Dimension 2", fontsize=13, color=PALETTE["text"])
    ax.set_title(
        "🛡 SENTINEL-RAG — Embedding Space by Attack Type\n"
        "UMAP 2D Projection | all-MiniLM-L6-v2",
        fontsize=14, color=PALETTE["accent"], pad=15,
    )
    ax.tick_params(colors=PALETTE["text"])
    ax.legend(fontsize=11, markerscale=1.4, framealpha=0.8)
    ax.grid(True, alpha=0.15, color=PALETTE["grid"])

    plt.tight_layout()
    path = PLOTS_DIR / "umap_attack_types.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Saved: {path.name}")


def main():
    print("\n🗺 SENTINEL-RAG — EMBEDDING VISUALIZATION")
    print("=" * 60)

    import pandas as pd

    X_train = np.load(PROCESSED_DIR / "train_embeddings.npy")
    y_train = np.load(PROCESSED_DIR / "train_labels.npy")
    X_test  = np.load(PROCESSED_DIR / "test_embeddings.npy")
    y_test  = np.load(PROCESSED_DIR / "test_labels.npy")
    df_train = pd.read_csv(PROCESSED_DIR / "train_clean.csv")
    train_texts = df_train["text"].tolist()

    print(f"  Train: {X_train.shape} | Test: {X_test.shape}")

    # Combine for joint UMAP (better projection quality)
    all_emb = np.vstack([X_train, X_test])
    print(f"  Combined: {all_emb.shape}")

    all_coords = run_umap(all_emb)
    coords_train = all_coords[:len(X_train)]
    coords_test  = all_coords[len(X_train):]

    print(f"\n{'='*60}")
    print("  GENERATING PLOTS")
    print(f"{'='*60}")

    plot_main_scatter(coords_train, y_train, coords_test, y_test)
    plot_attack_types(coords_train, train_texts, y_train)

    print("\n✅ Visualizations saved to ml/plots/")


if __name__ == "__main__":
    main()
