"""
ml/evaluate.py — Complete Model Evaluation Suite
══════════════════════════════════════════════════
Generates all evaluation metrics and plots on the test set.

Run FOURTH (after train.py):
    cd backend
    python -m ml.evaluate

Outputs (written to ml/outputs/ and ml/plots/):
    evaluation_report.json      — all metrics, per-class scores
    confusion_matrix.png        — heatmap (cyberpunk themed)
    roc_curve.png               — ROC curves for both models
    pr_curve.png                — Precision-Recall curves
    threshold_f1_curve.png      — F1 vs threshold plot
    classification_report.txt   — sklearn text report
"""

import json
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np

warnings.filterwarnings("ignore")

ROOT        = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
PROCESSED   = ROOT / "data" / "processed"
MODELS_DIR  = ROOT / "ml" / "saved_models"
OUTPUTS_DIR = ROOT / "ml" / "outputs"
PLOTS_DIR   = ROOT / "ml" / "plots"

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
PLOTS_DIR.mkdir(parents=True, exist_ok=True)

# Cyberpunk colour palette for all plots
PALETTE = {
    "bg":        "#0a0c14",
    "panel":     "#111827",
    "accent":    "#6366f1",
    "neon_cyan": "#06b6d4",
    "neon_pink": "#ec4899",
    "neon_green":"#22c55e",
    "warning":   "#f59e0b",
    "danger":    "#ef4444",
    "text":      "#e2e8f0",
    "grid":      "#1e293b",
}


# ══════════════════════════════════════════════════════════════════════
# SETUP MATPLOTLIB STYLE
# ══════════════════════════════════════════════════════════════════════

def setup_plot_style() -> None:
    """Apply dark cyberpunk matplotlib style to all plots."""
    import matplotlib
    matplotlib.use("Agg")   # non-interactive backend for server environments
    import matplotlib.pyplot as plt

    plt.rcParams.update({
        "figure.facecolor":  PALETTE["bg"],
        "axes.facecolor":    PALETTE["panel"],
        "axes.edgecolor":    PALETTE["grid"],
        "axes.labelcolor":   PALETTE["text"],
        "axes.titlecolor":   PALETTE["text"],
        "xtick.color":       PALETTE["text"],
        "ytick.color":       PALETTE["text"],
        "text.color":        PALETTE["text"],
        "grid.color":        PALETTE["grid"],
        "grid.linestyle":    "--",
        "grid.alpha":        0.4,
        "legend.facecolor":  PALETTE["panel"],
        "legend.edgecolor":  PALETTE["grid"],
        "legend.labelcolor": PALETTE["text"],
        "font.family":       "monospace",
        "font.size":         10,
    })


# ══════════════════════════════════════════════════════════════════════
# METRICS COMPUTATION
# ══════════════════════════════════════════════════════════════════════

def compute_all_metrics(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    threshold: float,
    model_name: str,
) -> dict:
    """
    Compute full evaluation metrics for one model.
    Returns a dict with all metrics for JSON export.
    """
    from sklearn.metrics import (
        accuracy_score, classification_report, confusion_matrix,
        f1_score, precision_score, recall_score, roc_auc_score,
        average_precision_score,
    )

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= threshold).astype(int)

    # Default threshold predictions (for comparison)
    preds_default = model.predict(X_test)

    cm = confusion_matrix(y_test, preds)
    tn, fp, fn, tp = cm.ravel()

    report_dict = classification_report(
        y_test, preds,
        target_names=["Safe (0)", "Malicious (1)"],
        output_dict=True,
    )

    metrics = {
        "model_name": model_name,
        "threshold":  round(threshold, 2),
        "accuracy":   round(accuracy_score(y_test, preds), 4),
        "precision":  round(precision_score(y_test, preds, average="macro", zero_division=0), 4),
        "recall":     round(recall_score(y_test, preds, average="macro", zero_division=0), 4),
        "f1_macro":   round(f1_score(y_test, preds, average="macro", zero_division=0), 4),
        "f1_weighted":round(f1_score(y_test, preds, average="weighted", zero_division=0), 4),
        "roc_auc":    round(roc_auc_score(y_test, proba), 4),
        "avg_precision": round(average_precision_score(y_test, proba), 4),
        "confusion_matrix": {
            "tn": int(tn), "fp": int(fp),
            "fn": int(fn), "tp": int(tp),
        },
        "per_class": {
            "safe": report_dict.get("Safe (0)", {}),
            "malicious": report_dict.get("Malicious (1)", {}),
        },
        # False positive / negative rates (critical for security systems)
        "false_positive_rate": round(fp / (fp + tn + 1e-9), 4),
        "false_negative_rate": round(fn / (fn + tp + 1e-9), 4),
        # At threshold 0.5 vs optimal
        "accuracy_default_threshold": round(accuracy_score(y_test, preds_default), 4),
        "f1_default_threshold": round(f1_score(y_test, preds_default, average="macro", zero_division=0), 4),
    }

    print(f"\n  {model_name} Evaluation (threshold={threshold:.2f}):")
    print(f"    Accuracy     : {metrics['accuracy']:.4f}")
    print(f"    Precision    : {metrics['precision']:.4f}")
    print(f"    Recall       : {metrics['recall']:.4f}")
    print(f"    F1 (macro)   : {metrics['f1_macro']:.4f}")
    print(f"    ROC-AUC      : {metrics['roc_auc']:.4f}")
    print(f"    Avg Precision: {metrics['avg_precision']:.4f}")
    print(f"    FPR          : {metrics['false_positive_rate']:.4f}")
    print(f"    FNR          : {metrics['false_negative_rate']:.4f}")
    print(f"    Confusion Matrix: TN={tn} FP={fp} FN={fn} TP={tp}")

    return metrics


# ══════════════════════════════════════════════════════════════════════
# PLOT GENERATORS
# ══════════════════════════════════════════════════════════════════════

def plot_confusion_matrix(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    threshold: float,
    model_name: str,
) -> None:
    """Heatmap confusion matrix with cyberpunk styling."""
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors
    from sklearn.metrics import confusion_matrix

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= threshold).astype(int)
    cm    = confusion_matrix(y_test, preds)
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.patch.set_facecolor(PALETTE["bg"])

    labels = ["Safe (0)", "Malicious (1)"]
    cmap   = mcolors.LinearSegmentedColormap.from_list(
        "sentinel", [PALETTE["bg"], PALETTE["accent"]]
    )

    for ax, data, title, fmt in zip(
        axes,
        [cm, cm_norm],
        ["Confusion Matrix (Counts)", "Confusion Matrix (Normalised)"],
        ["d", ".2%"],
    ):
        im = ax.imshow(data, cmap=cmap, aspect="auto")
        ax.set_xticks([0, 1]); ax.set_yticks([0, 1])
        ax.set_xticklabels(labels, fontsize=11)
        ax.set_yticklabels(labels, fontsize=11)
        ax.set_xlabel("Predicted Label", fontsize=12, labelpad=10)
        ax.set_ylabel("True Label",      fontsize=12, labelpad=10)
        ax.set_title(f"{model_name}\n{title}", fontsize=13, pad=15,
                     color=PALETTE["accent"])

        for i in range(2):
            for j in range(2):
                val = data[i, j]
                text = f"{val:{fmt}}" if fmt != "d" else f"{int(val)}"
                ax.text(j, i, text, ha="center", va="center",
                        fontsize=14, fontweight="bold",
                        color="white" if val > data.max() * 0.5 else PALETTE["text"])

        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    fig.suptitle(
        f"🛡 SENTINEL-RAG — {model_name} Confusion Matrix",
        fontsize=15, color=PALETTE["accent"], y=1.02
    )
    plt.tight_layout()
    path = PLOTS_DIR / f"confusion_matrix_{model_name.lower().replace(' ', '_')}.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Plot saved: {path.name}")


def plot_roc_curves(
    models_proba: dict,
    y_test: np.ndarray,
) -> None:
    """ROC curves for all models on a single chart."""
    import matplotlib.pyplot as plt
    from sklearn.metrics import roc_curve, roc_auc_score

    fig, ax = plt.subplots(figsize=(9, 7))

    colors = [PALETTE["accent"], PALETTE["neon_cyan"], PALETTE["neon_pink"]]

    for (name, proba), color in zip(models_proba.items(), colors):
        fpr, tpr, _ = roc_curve(y_test, proba)
        auc          = roc_auc_score(y_test, proba)
        ax.plot(fpr, tpr, color=color, linewidth=2.5,
                label=f"{name}  (AUC = {auc:.4f})")
        # Shade area under curve
        ax.fill_between(fpr, tpr, alpha=0.08, color=color)

    # Diagonal baseline
    ax.plot([0, 1], [0, 1], "--", color=PALETTE["grid"], linewidth=1.5,
            label="Random Baseline (AUC = 0.50)")

    ax.set_xlabel("False Positive Rate", fontsize=13)
    ax.set_ylabel("True Positive Rate",  fontsize=13)
    ax.set_title("🛡 SENTINEL-RAG — ROC Curves\n"
                 "Prompt Injection Detection",
                 fontsize=14, color=PALETTE["accent"])
    ax.legend(loc="lower right", fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.set_xlim([0, 1]); ax.set_ylim([0, 1.01])

    # Annotate perfect point
    ax.annotate("Perfect\nClassifier", xy=(0, 1),
                xytext=(0.08, 0.88),
                color=PALETTE["neon_green"], fontsize=9,
                arrowprops=dict(arrowstyle="->", color=PALETTE["neon_green"]))

    plt.tight_layout()
    path = PLOTS_DIR / "roc_curve.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Plot saved: {path.name}")


def plot_precision_recall_curves(
    models_proba: dict,
    y_test: np.ndarray,
) -> None:
    """Precision-Recall curves (better than ROC for imbalanced data)."""
    import matplotlib.pyplot as plt
    from sklearn.metrics import precision_recall_curve, average_precision_score

    fig, ax = plt.subplots(figsize=(9, 7))
    colors  = [PALETTE["accent"], PALETTE["neon_cyan"]]

    for (name, proba), color in zip(models_proba.items(), colors):
        prec, rec, _ = precision_recall_curve(y_test, proba)
        ap = average_precision_score(y_test, proba)
        ax.plot(rec, prec, color=color, linewidth=2.5,
                label=f"{name}  (AP = {ap:.4f})")
        ax.fill_between(rec, prec, alpha=0.08, color=color)

    # Baseline: random classifier
    baseline = y_test.sum() / len(y_test)
    ax.axhline(baseline, linestyle="--", color=PALETTE["grid"],
               linewidth=1.5, label=f"Random Baseline ({baseline:.2f})")

    ax.set_xlabel("Recall",    fontsize=13)
    ax.set_ylabel("Precision", fontsize=13)
    ax.set_title("🛡 SENTINEL-RAG — Precision-Recall Curves\n"
                 "Prompt Injection Detection",
                 fontsize=14, color=PALETTE["accent"])
    ax.legend(loc="upper right", fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.set_xlim([0, 1]); ax.set_ylim([0, 1.01])

    plt.tight_layout()
    path = PLOTS_DIR / "pr_curve.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Plot saved: {path.name}")


def plot_threshold_f1(
    models_proba: dict,
    y_test: np.ndarray,
) -> None:
    """F1 score vs decision threshold — shows optimal threshold."""
    import matplotlib.pyplot as plt
    from sklearn.metrics import f1_score

    thresholds = np.arange(0.05, 0.96, 0.01)
    fig, ax    = plt.subplots(figsize=(11, 6))
    colors     = [PALETTE["accent"], PALETTE["neon_cyan"]]

    for (name, proba), color in zip(models_proba.items(), colors):
        f1_scores = [
            f1_score(y_test, (proba >= t).astype(int),
                     average="macro", zero_division=0)
            for t in thresholds
        ]
        ax.plot(thresholds, f1_scores, color=color, linewidth=2.5, label=name)

        # Mark the optimal threshold
        best_idx = int(np.argmax(f1_scores))
        ax.scatter(thresholds[best_idx], f1_scores[best_idx],
                   color=color, s=120, zorder=5)
        ax.annotate(
            f"  Opt: t={thresholds[best_idx]:.2f}\n  F1={f1_scores[best_idx]:.4f}",
            xy=(thresholds[best_idx], f1_scores[best_idx]),
            xytext=(thresholds[best_idx] + 0.05, f1_scores[best_idx] - 0.04),
            color=color, fontsize=9,
        )

    ax.axvline(0.5, linestyle="--", color=PALETTE["warning"],
               linewidth=1.5, label="Default threshold (0.50)")
    ax.set_xlabel("Decision Threshold", fontsize=13)
    ax.set_ylabel("F1 Score (Macro)",   fontsize=13)
    ax.set_title("🛡 SENTINEL-RAG — F1 Score vs Decision Threshold",
                 fontsize=14, color=PALETTE["accent"])
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.set_xlim([0.05, 0.95])

    plt.tight_layout()
    path = PLOTS_DIR / "threshold_f1_curve.png"
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=PALETTE["bg"])
    plt.close()
    print(f"  ✓ Plot saved: {path.name}")


# ══════════════════════════════════════════════════════════════════════
# MAIN EVALUATION PIPELINE
# ══════════════════════════════════════════════════════════════════════

def main():
    print("\n📊 SENTINEL-RAG — MODEL EVALUATION SUITE")
    print("=" * 60)

    # 1. Load test data
    X_test = np.load(PROCESSED / "test_embeddings.npy")
    y_test = np.load(PROCESSED / "test_labels.npy")
    print(f"  Test set: {X_test.shape} | Labels: {y_test.shape}")

    # 2. Load models
    models_to_eval = {}
    for name, fname in [("LogisticRegression", "logistic_regression.pkl"),
                        ("XGBoost",            "xgboost.pkl")]:
        path = MODELS_DIR / fname
        if path.exists():
            models_to_eval[name] = joblib.load(path)
            print(f"  ✓ Loaded: {fname}")
        else:
            print(f"  ⚠ Missing: {fname} — run ml/train.py first")

    if not models_to_eval:
        print("❌ No trained models found. Run ml/train.py first.")
        sys.exit(1)

    # 3. Load optimal thresholds
    threshold_map = {}
    results_path  = OUTPUTS_DIR / "training_results.json"
    if results_path.exists():
        with open(results_path) as f:
            train_data = json.load(f)
        for name in models_to_eval:
            threshold_map[name] = train_data.get("models", {}).get(
                name, {}).get("threshold", {}).get("optimal_threshold", 0.5)
    else:
        threshold_map = {name: 0.5 for name in models_to_eval}

    # 4. Setup plot style
    setup_plot_style()

    # 5. Compute metrics for each model
    print(f"\n{'='*60}")
    print("  COMPUTING METRICS")
    print(f"{'='*60}")

    all_metrics = {}
    models_proba = {}

    for name, model in models_to_eval.items():
        threshold = threshold_map.get(name, 0.5)
        metrics = compute_all_metrics(model, X_test, y_test, threshold, name)
        all_metrics[name] = metrics
        models_proba[name] = model.predict_proba(X_test)[:, 1]

    # 6. Save classification reports
    print(f"\n{'='*60}")
    print("  GENERATING TEXT REPORTS")
    print(f"{'='*60}")

    from sklearn.metrics import classification_report
    report_lines = []
    for name, model in models_to_eval.items():
        threshold = threshold_map.get(name, 0.5)
        proba = models_proba[name]
        preds = (proba >= threshold).astype(int)
        report = classification_report(
            y_test, preds,
            target_names=["Safe (0)", "Malicious (1)"],
        )
        report_lines.append(f"\n{'='*60}")
        report_lines.append(f"  {name} (threshold={threshold:.2f})")
        report_lines.append(f"{'='*60}")
        report_lines.append(report)
        print(f"\n  {name}:\n{report}")

    report_path = OUTPUTS_DIR / "classification_report.txt"
    with open(report_path, "w") as f:
        f.write("SENTINEL-RAG — CLASSIFICATION REPORTS\n")
        f.write("\n".join(report_lines))
    print(f"  ✓ Saved: {report_path.name}")

    # 7. Generate plots
    print(f"\n{'='*60}")
    print("  GENERATING PLOTS")
    print(f"{'='*60}")

    for name, model in models_to_eval.items():
        plot_confusion_matrix(model, X_test, y_test, threshold_map.get(name, 0.5), name)

    plot_roc_curves(models_proba, y_test)
    plot_precision_recall_curves(models_proba, y_test)
    plot_threshold_f1(models_proba, y_test)

    # 8. Save full evaluation JSON
    eval_path = OUTPUTS_DIR / "evaluation_report.json"
    with open(eval_path, "w") as f:
        json.dump(all_metrics, f, indent=2, default=str)
    print(f"  ✓ Saved: {eval_path.name}")

    # 9. Final comparison table
    print(f"\n{'='*60}")
    print("  MODEL COMPARISON TABLE")
    print(f"{'='*60}")
    print(f"  {'Model':<24} {'Accuracy':>9} {'F1':>9} {'ROC-AUC':>9} {'FPR':>9} {'FNR':>9}")
    print(f"  {'-'*66}")
    for name, m in all_metrics.items():
        print(f"  {name:<24} {m['accuracy']:>9.4f} {m['f1_macro']:>9.4f} "
              f"{m['roc_auc']:>9.4f} {m['false_positive_rate']:>9.4f} "
              f"{m['false_negative_rate']:>9.4f}")

    print("\n✅ Evaluation complete. Plots saved to ml/plots/")
    print("   Run ml/chromadb_seed.py next.")


if __name__ == "__main__":
    main()
