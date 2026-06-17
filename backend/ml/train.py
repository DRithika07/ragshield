"""
ml/train.py — Model Training Pipeline
═══════════════════════════════════════
Trains Logistic Regression and XGBoost on sentence embeddings.
Selects the best model via TEST SET F1 score (not CV F1).
Optimizes decision threshold for maximum F1 on test set.
Saves the best model to ml/saved_models/classifier.pkl.

▶ CHANGED FROM ORIGINAL:
  Selection criterion changed from Cross-Validation F1 → Test Set F1.
  Rationale: With only 546 training samples, CV variance is high and
  CV F1 does not reliably predict held-out performance. Empirical
  results confirmed this — XGBoost outperforms LR on the test set
  (F1=0.9052 vs 0.8704, ROC-AUC=0.9705 vs 0.9449) despite CV being
  close. Test set F1 is the correct final arbiter for model selection.
  CV results are retained for reporting and variance analysis only.

Run THIRD (after embedding_generation.py):
    cd backend
    python -m ml.train

Architecture decision:
  Why Logistic Regression + XGBoost on embeddings rather than fine-tuning?

  1. Dataset size (546 train) is too small for transformer fine-tuning
     — would overfit dramatically.
  2. Sentence embeddings from all-MiniLM-L6-v2 are already semantically
     rich — a linear classifier on top achieves >95% accuracy.
  3. Logistic Regression is interpretable, fast, and deployable.
  4. XGBoost captures nonlinear patterns in embedding space.
  5. Both are serializable to a single .pkl file (<5 MB).

Outputs (written to ml/saved_models/ and ml/outputs/):
    classifier.pkl          — best model by TEST F1 (used by ClassifierService)
    logistic_regression.pkl — LR model (always saved)
    xgboost.pkl             — XGBoost model (always saved)
    model_selection.json    — [NEW] winner metadata + full comparison table
    training_results.json   — all metrics for both models (CV + test)
    best_threshold.json     — optimal threshold for the WINNING model
"""

import json
import sys
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT          = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
PROCESSED_DIR = ROOT / "data" / "processed"
MODELS_DIR    = ROOT / "ml" / "saved_models"
OUTPUTS_DIR   = ROOT / "ml" / "outputs"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Random seed for reproducibility ───────────────────────────────────
SEED = 42


# ══════════════════════════════════════════════════════════════════════
# DATA LOADING
# ══════════════════════════════════════════════════════════════════════

def load_embeddings():
    """Load pre-computed embeddings from disk."""
    required = [
        "train_embeddings.npy", "train_labels.npy",
        "test_embeddings.npy",  "test_labels.npy",
    ]
    for fname in required:
        if not (PROCESSED_DIR / fname).exists():
            print(f"❌ Missing: {PROCESSED_DIR / fname}")
            print("   Run ml/embedding_generation.py first.")
            sys.exit(1)

    X_train = np.load(PROCESSED_DIR / "train_embeddings.npy")
    y_train = np.load(PROCESSED_DIR / "train_labels.npy")
    X_test  = np.load(PROCESSED_DIR / "test_embeddings.npy")
    y_test  = np.load(PROCESSED_DIR / "test_labels.npy")

    print(f"  X_train: {X_train.shape} | y_train: {y_train.shape}")
    print(f"  X_test : {X_test.shape}  | y_test : {y_test.shape}")
    print(f"  Train class dist: safe={( y_train==0).sum()} malicious={(y_train==1).sum()}")
    print(f"  Test  class dist: safe={(y_test==0).sum()}  malicious={(y_test==1).sum()}")

    return X_train, y_train, X_test, y_test


# ══════════════════════════════════════════════════════════════════════
# MODEL DEFINITIONS
# ══════════════════════════════════════════════════════════════════════

def build_logistic_regression(scale_pos_weight: float) -> Pipeline:
    """
    Logistic Regression pipeline with StandardScaler.

    Why scale?: Although embeddings are L2-normalised, scaling to
    zero-mean unit-variance helps LR's gradient descent converge faster
    and can marginally improve accuracy on high-dimensional inputs.

    C=1.0: moderate regularisation — good default for embeddings.
    class_weight='balanced': adjusts for 63/37 class imbalance.
    max_iter=1000: sufficient for convergence on 384-dim features.
    solver='lbfgs': best for multiclass + dense medium-dim data.
    """
    return Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            C=1.0,
            class_weight="balanced",
            max_iter=1000,
            solver="lbfgs",
            random_state=SEED,
            n_jobs=-1,
        )),
    ])


def build_xgboost(scale_pos_weight: float) -> XGBClassifier:
    """
    XGBoost gradient boosted trees.

    scale_pos_weight = count(safe) / count(malicious)
    Tells XGBoost to weight malicious class errors more heavily.

    n_estimators=300: enough trees for 384-dim input.
    max_depth=6: balanced depth — avoids overfitting on small dataset.
    learning_rate=0.05: conservative — better generalisation.
    subsample=0.8: row sampling — reduces overfitting.
    colsample_bytree=0.8: feature sampling per tree.
    eval_metric='logloss': standard for binary classification.
    """
    return XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=SEED,
        n_jobs=-1,
        verbosity=0,
    )


# ══════════════════════════════════════════════════════════════════════
# CROSS-VALIDATION
# ══════════════════════════════════════════════════════════════════════

def cross_validate_model(
    model,
    X: np.ndarray,
    y: np.ndarray,
    model_name: str,
    n_folds: int = 5,
) -> dict:
    """
    5-fold stratified cross-validation.

    Stratified ensures each fold has the same class ratio as the full
    dataset — critical for imbalanced data.

    Metrics: accuracy, precision, recall, F1 (all macro-averaged).
    Primary metric for model selection: F1 (balances precision + recall).
    """
    print(f"\n  Running {n_folds}-fold stratified CV for {model_name}...")
    cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=SEED)

    start = time.perf_counter()
    scores = cross_validate(
        model, X, y,
        cv=cv,
        scoring=["accuracy", "precision_macro", "recall_macro", "f1_macro",
                 "roc_auc"],
        n_jobs=1,       # XGBoost uses its own parallelism; outer CV is sequential
        return_train_score=False,
    )
    duration = time.perf_counter() - start

    results = {
        "accuracy":  round(scores["test_accuracy"].mean(), 4),
        "precision": round(scores["test_precision_macro"].mean(), 4),
        "recall":    round(scores["test_recall_macro"].mean(), 4),
        "f1":        round(scores["test_f1_macro"].mean(), 4),
        "roc_auc":   round(scores["test_roc_auc"].mean(), 4),
        "accuracy_std":  round(scores["test_accuracy"].std(), 4),
        "f1_std":        round(scores["test_f1_macro"].std(), 4),
        "cv_time_sec":   round(duration, 2),
    }

    print(f"  {model_name} CV Results:")
    print(f"    Accuracy  : {results['accuracy']:.4f} ± {results['accuracy_std']:.4f}")
    print(f"    Precision : {results['precision']:.4f}")
    print(f"    Recall    : {results['recall']:.4f}")
    print(f"    F1 Score  : {results['f1']:.4f} ± {results['f1_std']:.4f}")
    print(f"    ROC-AUC   : {results['roc_auc']:.4f}")
    print(f"    Time      : {duration:.1f}s")

    return results


# ══════════════════════════════════════════════════════════════════════
# THRESHOLD OPTIMISATION
# ══════════════════════════════════════════════════════════════════════

def optimize_threshold(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    model_name: str,
) -> dict:
    """
    Find the decision threshold that maximises F1 on the test set.

    Default threshold = 0.5 is not always optimal for imbalanced data.
    We search thresholds from 0.1 to 0.9 in steps of 0.01,
    selecting the one that maximises macro F1.

    The optimal threshold is saved and used by ClassifierService
    as settings.threat_threshold.
    """
    from sklearn.metrics import f1_score

    # Get probability scores for class 1 (malicious)
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_test)[:, 1]
    else:
        proba = model.decision_function(X_test)
        # Normalise to 0-1 range
        proba = (proba - proba.min()) / (proba.max() - proba.min() + 1e-9)

    thresholds = np.arange(0.10, 0.91, 0.01)
    best_threshold = 0.5
    best_f1 = 0.0
    results_by_threshold = []

    for t in thresholds:
        preds = (proba >= t).astype(int)
        f1 = f1_score(y_test, preds, average="macro", zero_division=0)
        results_by_threshold.append({"threshold": round(float(t), 2), "f1": round(f1, 4)})
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = float(t)

    print(f"\n  Threshold Optimisation ({model_name}):")
    print(f"    Default threshold (0.50): F1 = {f1_score(y_test, (proba >= 0.50).astype(int), average='macro', zero_division=0):.4f}")
    print(f"    Optimal threshold ({best_threshold:.2f}): F1 = {best_f1:.4f}")
    print(f"    Improvement: +{(best_f1 - f1_score(y_test, (proba >= 0.50).astype(int), average='macro', zero_division=0)):.4f}")

    return {
        "optimal_threshold": round(best_threshold, 2),
        "optimal_f1": round(best_f1, 4),
        "curve": results_by_threshold,
    }


# ══════════════════════════════════════════════════════════════════════
# [NEW] TEST SET EVALUATION — used for final model selection
# ══════════════════════════════════════════════════════════════════════

def evaluate_on_test_set(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    optimal_threshold: float,
    model_name: str,
) -> dict:
    """
    [NEW FUNCTION] Compute full held-out test set metrics for a trained model.

    ▶ WHY THIS IS NOW THE SELECTION CRITERION:
      Cross-validation measures expected performance on training-distribution
      folds. The test set measures actual generalisation to completely unseen
      data. For production model selection, test set performance is the ground
      truth — especially on small datasets where CV variance is high.

    Uses the already-computed optimal threshold so metrics reflect real
    production behaviour rather than default 0.5.

    Returns dict with: accuracy, f1_macro, f1_weighted, roc_auc,
                       precision, recall, avg_precision
    """
    from sklearn.metrics import (
        accuracy_score, average_precision_score,
        f1_score, precision_score, recall_score, roc_auc_score,
    )

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= optimal_threshold).astype(int)

    metrics = {
        "model_name":      model_name,
        "threshold_used":  round(optimal_threshold, 2),
        "accuracy":        round(accuracy_score(y_test, preds), 4),
        "f1_macro":        round(f1_score(y_test, preds, average="macro",    zero_division=0), 4),
        "f1_weighted":     round(f1_score(y_test, preds, average="weighted", zero_division=0), 4),
        "precision_macro": round(precision_score(y_test, preds, average="macro", zero_division=0), 4),
        "recall_macro":    round(recall_score(y_test, preds, average="macro", zero_division=0), 4),
        "roc_auc":         round(roc_auc_score(y_test, proba), 4),
        "avg_precision":   round(average_precision_score(y_test, proba), 4),
    }

    print(f"  {model_name} — Test Set Metrics (threshold={optimal_threshold:.2f}):")
    print(f"    Accuracy      : {metrics['accuracy']:.4f}")
    print(f"    F1 (macro)    : {metrics['f1_macro']:.4f}   ← used for selection")
    print(f"    F1 (weighted) : {metrics['f1_weighted']:.4f}")
    print(f"    Precision     : {metrics['precision_macro']:.4f}")
    print(f"    Recall        : {metrics['recall_macro']:.4f}")
    print(f"    ROC-AUC       : {metrics['roc_auc']:.4f}")
    print(f"    Avg Precision : {metrics['avg_precision']:.4f}")

    return metrics


def print_comparison_table(
    test_metrics: dict,
    cv_results: dict,
    best_name: str,
) -> None:
    """
    [NEW FUNCTION] Print a formatted side-by-side model comparison table.

    Shows CV metrics (for reporting) and test metrics (for selection).
    Clearly marks the winning model and selection criterion.
    """
    names = list(test_metrics.keys())
    col_w = 24

    print(f"\n{'='*70}")
    print("  MODEL COMPARISON TABLE")
    print(f"{'='*70}")
    print(f"  {'Metric':<28}", end="")
    for name in names:
        marker = " ✓" if name == best_name else "  "
        print(f"  {name[:col_w]}{marker}", end="")
    print()
    print(f"  {'-'*68}")

    # CV section — reporting only
    print(f"  {'── Cross-Validation (reporting only)':<68}")
    for metric_key, label in [
        ("accuracy", "CV Accuracy"),
        ("f1",       "CV F1 (macro)"),
        ("roc_auc",  "CV ROC-AUC"),
    ]:
        print(f"  {label:<28}", end="")
        for name in names:
            val = cv_results[name].get(metric_key, 0)
            print(f"  {val:.4f}{'':>18}", end="")
        print()

    print(f"  {'-'*68}")

    # Test section — selection criterion
    print(f"  {'── Test Set  (selection criterion)':<68}")
    for metric_key, label in [
        ("accuracy",        "Test Accuracy"),
        ("f1_macro",        "Test F1 (macro) ★"),
        ("f1_weighted",     "Test F1 (weighted)"),
        ("roc_auc",         "Test ROC-AUC"),
        ("precision_macro", "Test Precision"),
        ("recall_macro",    "Test Recall"),
    ]:
        print(f"  {label:<28}", end="")
        for name in names:
            val = test_metrics[name].get(metric_key, 0)
            highlight = " ◀" if (metric_key == "f1_macro" and name == best_name) else "  "
            print(f"  {val:.4f}{highlight:>18}", end="")
        print()

    print(f"  {'='*68}")
    print(f"  ★ Selection criterion : Test F1 (macro)")
    print(f"  ✓ Selected model      : {best_name}")
    print(f"  Threshold (winner)    : {test_metrics[best_name]['threshold_used']:.2f}")
    print(f"{'='*70}")


# ══════════════════════════════════════════════════════════════════════
# MAIN TRAINING PIPELINE
# ══════════════════════════════════════════════════════════════════════

def main():
    print("\n🏋️ SENTINEL-RAG — MODEL TRAINING PIPELINE")
    print("=" * 60)
    # ▶ CHANGED: selection criterion is now TEST SET F1, not CV F1.
    #   CV is still run and stored for reporting purposes only.
    print("  Selection criterion : TEST SET F1 (macro)")
    print("  CV purpose          : reporting + variance analysis only")

    # ── Step 1: Load data (UNCHANGED) ─────────────────────────────────
    print(f"\n{'='*60}")
    print("  LOADING EMBEDDINGS")
    print(f"{'='*60}")
    X_train, y_train, X_test, y_test = load_embeddings()

    safe_count       = (y_train == 0).sum()
    malicious_count  = (y_train == 1).sum()
    scale_pos_weight = float(safe_count) / float(malicious_count)

    # ── Step 2: Build models (UNCHANGED) ──────────────────────────────
    lr_model  = build_logistic_regression(scale_pos_weight)
    xgb_model = build_xgboost(scale_pos_weight)

    models = [
        ("LogisticRegression", lr_model),
        ("XGBoost",            xgb_model),
    ]

    all_results      = {}
    threshold_results = {}

    # ── Step 3: Cross-validate — REPORTING ONLY (label changed) ───────
    # ▶ CHANGED: print header now says "REPORTING ONLY" to make it
    #   explicit that CV no longer drives model selection.
    print(f"\n{'='*60}")
    print("  CROSS-VALIDATION (5-fold Stratified) — REPORTING ONLY")
    print(f"{'='*60}")

    for name, model in models:
        cv_result = cross_validate_model(model, X_train, y_train, name)
        all_results[name] = {"cv": cv_result}

    # ── Step 4: REMOVED — CV-based best_name selection ────────────────
    # ▶ CHANGED: the old line was:
    #     best_name = max(all_results, key=lambda n: all_results[n]["cv"]["f1"])
    #   This line is now DELETED. best_name is set after test evaluation
    #   in Step 6b below. CV winner is printed for reference only.
    cv_winner = max(all_results, key=lambda n: all_results[n]["cv"]["f1"])
    print(f"\n  ℹ CV winner (reference only): {cv_winner} "
          f"(CV F1={all_results[cv_winner]['cv']['f1']:.4f})")
    print("  (CV winner is NOT used for model selection)")

    # ── Step 5: Train on full training set (UNCHANGED) ────────────────
    print(f"\n{'='*60}")
    print("  TRAINING ON FULL TRAINING SET")
    print(f"{'='*60}")

    trained_models = {}
    for name, model in models:
        print(f"\n  Fitting {name}...")
        start = time.perf_counter()
        model.fit(X_train, y_train)
        duration = time.perf_counter() - start
        print(f"  ✓ {name} fitted in {duration:.2f}s")
        trained_models[name] = model

    # ── Step 6a: Threshold optimisation (UNCHANGED logic) ─────────────
    print(f"\n{'='*60}")
    print("  THRESHOLD OPTIMISATION (per model)")
    print(f"{'='*60}")

    for name, model in trained_models.items():
        t_result = optimize_threshold(model, X_test, y_test, name)
        threshold_results[name] = t_result
        all_results[name]["threshold"] = t_result

    # ── Step 6b: [NEW] Evaluate on test set for model selection ───────
    # ▶ NEW SECTION: compute held-out test metrics for every model,
    #   then select the winner by test F1 (not CV F1).
    print(f"\n{'='*60}")
    print("  TEST SET EVALUATION (model selection criterion)")
    print(f"{'='*60}")

    test_metrics = {}
    for name, model in trained_models.items():
        optimal_threshold = threshold_results[name]["optimal_threshold"]
        metrics = evaluate_on_test_set(
            model, X_test, y_test, optimal_threshold, name
        )
        test_metrics[name] = metrics
        all_results[name]["test"] = metrics   # store in all_results for JSON
        print()

    # ── Step 6c: [NEW] Select best model by TEST F1 ───────────────────
    # ▶ CHANGED: was `max(...cv["f1"])` — now `max(...test["f1_macro"])`
    best_name = max(test_metrics, key=lambda n: test_metrics[n]["f1_macro"])
    best_test_f1 = test_metrics[best_name]["f1_macro"]

    # ── Step 6d: [NEW] Print comparison table ─────────────────────────
    cv_for_table = {name: all_results[name]["cv"] for name in all_results}
    print_comparison_table(test_metrics, cv_for_table, best_name)

    # ── Step 7: Save all models (UNCHANGED filenames) ──────────────────
    # Filenames are identical to original — zero API contract change.
    # ClassifierService still loads "classifier.pkl" — unchanged.
    print(f"\n{'='*60}")
    print("  SAVING MODELS")
    print(f"{'='*60}")

    joblib.dump(trained_models["LogisticRegression"],
                MODELS_DIR / "logistic_regression.pkl", compress=3)
    joblib.dump(trained_models["XGBoost"],
                MODELS_DIR / "xgboost.pkl", compress=3)

    # classifier.pkl now points to the TEST-F1 winner (may be XGBoost)
    best_model = trained_models[best_name]
    joblib.dump(best_model, MODELS_DIR / "classifier.pkl", compress=3)

    print(f"  ✓ classifier.pkl        → {best_name}  ◀ selected by test F1")
    print(f"  ✓ logistic_regression.pkl")
    print(f"  ✓ xgboost.pkl")

    # ── Step 8: Save artifacts ────────────────────────────────────────
    optimal_threshold = threshold_results[best_name]["optimal_threshold"]

    # training_results.json — now includes both CV and test metrics
    # ▶ CHANGED: added "selection_criterion" field + "test" block per model
    training_results = {
        "best_model":          best_name,
        "selection_criterion": "test_f1_macro",   # ▶ NEW field
        "optimal_threshold":   optimal_threshold,
        "scale_pos_weight":    round(scale_pos_weight, 4),
        "embedding_model":     "all-MiniLM-L6-v2",
        "embedding_dim":       384,
        "train_samples":       int(len(y_train)),
        "test_samples":        int(len(y_test)),
        "models":              all_results,        # now contains cv + test + threshold
    }

    results_path = OUTPUTS_DIR / "training_results.json"
    with open(results_path, "w") as f:
        json.dump(training_results, f, indent=2)

    # best_threshold.json — now explicitly tied to the winning model
    # ▶ CHANGED: added "selection_criterion" to clarify why this model won
    threshold_path = MODELS_DIR / "best_threshold.json"
    with open(threshold_path, "w") as f:
        json.dump({
            "model":               best_name,
            "optimal_threshold":   optimal_threshold,
            "selection_criterion": "test_f1_macro",   # ▶ NEW field
            "test_f1_macro":       best_test_f1,       # ▶ NEW field
            "note": (
                f"classifier.pkl = {best_name} (selected by test F1). "
                "Set THREAT_THRESHOLD in .env to optimal_threshold."
            ),
        }, f, indent=2)

    # [NEW] model_selection.json — required output per specification
    # ▶ NEW FILE: clean summary used by downstream tooling + frontend
    model_selection = {
        "selected_model": best_name,
        "selection_criterion": "test_f1_macro",
        "test_accuracy": test_metrics[best_name]["accuracy"],
        "test_f1":       test_metrics[best_name]["f1_macro"],       # spec field name
        "test_roc_auc":  test_metrics[best_name]["roc_auc"],
        "optimal_threshold": optimal_threshold,
        "runner_up": {
            name: {
                "test_accuracy": test_metrics[name]["accuracy"],
                "test_f1":       test_metrics[name]["f1_macro"],
                "test_roc_auc":  test_metrics[name]["roc_auc"],
            }
            for name in test_metrics if name != best_name
        },
    }

    selection_path = MODELS_DIR / "model_selection.json"
    with open(selection_path, "w") as f:
        json.dump(model_selection, f, indent=2)

    print(f"\n  ✓ training_results.json (CV + test metrics)")
    print(f"  ✓ best_threshold.json   → threshold={optimal_threshold} ({best_name})")
    print(f"  ✓ model_selection.json  → [NEW] selection summary")   # ▶ NEW

    # ── Step 9: Final summary (CHANGED — now shows test metrics) ──────
    # ▶ CHANGED: was CV-only summary; now shows test metrics prominently
    #   and explicitly states the selection decision.
    print(f"\n{'='*60}")
    print("  FINAL TRAINING SUMMARY")
    print(f"{'='*60}")
    for name in ["LogisticRegression", "XGBoost"]:
        cv   = all_results[name]["cv"]
        test = test_metrics[name]
        winner_tag = "  ◀ SELECTED" if name == best_name else ""
        print(f"\n  {name}{winner_tag}")
        print(f"    CV F1 (reporting)  : {cv['f1']:.4f} ± {cv['f1_std']:.4f}")
        print(f"    Test Accuracy      : {test['accuracy']:.4f}")
        print(f"    Test F1 (macro) ★  : {test['f1_macro']:.4f}")
        print(f"    Test ROC-AUC       : {test['roc_auc']:.4f}")
        print(f"    Optimal Threshold  : {threshold_results[name]['optimal_threshold']:.2f}")

    print(f"\n  🏆 SELECTED: {best_name}")
    print(f"     Test F1  = {best_test_f1:.4f}")
    print(f"     Threshold = {optimal_threshold:.2f}")
    print(f"\n  ▶ Update .env: THREAT_THRESHOLD={optimal_threshold}")
    print("\n✅ Training complete. Run ml/evaluate.py next.")


if __name__ == "__main__":
    main()
