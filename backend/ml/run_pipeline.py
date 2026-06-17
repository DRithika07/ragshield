"""
ml/run_pipeline.py — Complete ML Pipeline Orchestrator
═══════════════════════════════════════════════════════
Runs the entire ML training pipeline in the correct order.
This is the single command to run after uploading new data.

Usage:
    cd backend
    python -m ml.run_pipeline

    # Skip steps already completed:
    python -m ml.run_pipeline --skip-embeddings
    python -m ml.run_pipeline --skip-training

Steps:
    1. preprocess.py          — clean and analyze data
    2. embedding_generation.py — generate sentence embeddings
    3. train.py               — train + select best model
    4. evaluate.py            — generate all metrics + plots
    5. chromadb_seed.py       — populate vector database
    6. visualize_embeddings.py — generate UMAP visualizations
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_step(module: str, description: str) -> bool:
    """Run a pipeline step as a module. Returns True on success."""
    print(f"\n{'='*60}")
    print(f"  ▶  {description}")
    print(f"  Module: python -m {module}")
    print(f"{'='*60}")

    start = time.perf_counter()
    result = subprocess.run(
        [sys.executable, "-m", module],
        cwd=str(ROOT),
    )
    duration = time.perf_counter() - start

    if result.returncode == 0:
        print(f"\n  ✅ {description} — complete ({duration:.1f}s)")
        return True
    else:
        print(f"\n  ❌ {description} — FAILED (exit code {result.returncode})")
        return False


def main():
    parser = argparse.ArgumentParser(description="Sentinel-RAG ML Pipeline")
    parser.add_argument("--skip-embeddings", action="store_true",
                        help="Skip embedding generation (use existing .npy files)")
    parser.add_argument("--skip-training", action="store_true",
                        help="Skip training (use existing .pkl files)")
    parser.add_argument("--skip-viz", action="store_true",
                        help="Skip UMAP visualization (slow on large datasets)")
    args = parser.parse_args()

    print("\n🚀 SENTINEL-RAG — COMPLETE ML TRAINING PIPELINE")
    print("=" * 60)
    print("  This will train a prompt injection classifier and")
    print("  populate the ChromaDB threat library.")
    print("  Estimated time: 5-15 minutes (CPU) / 2-5 minutes (GPU)")
    print("=" * 60)

    pipeline_start = time.perf_counter()
    results = {}

    # Step 1: Preprocess
    results["preprocess"] = run_step("ml.preprocess", "Step 1/6 — Data Preprocessing")

    # Step 2: Embeddings
    if not args.skip_embeddings:
        results["embeddings"] = run_step(
            "ml.embedding_generation", "Step 2/6 — Embedding Generation"
        )
    else:
        print("\n  ⏭ Skipping embedding generation (--skip-embeddings)")

    # Step 3: Training
    if not args.skip_training:
        results["training"] = run_step("ml.train", "Step 3/6 — Model Training")
    else:
        print("\n  ⏭ Skipping training (--skip-training)")

    # Step 4: Evaluation
    results["evaluation"] = run_step("ml.evaluate", "Step 4/6 — Model Evaluation")

    # Step 5: ChromaDB Seed
    results["chromadb"] = run_step("ml.chromadb_seed", "Step 5/6 — ChromaDB Seeding")

    # Step 6: Visualization
    if not args.skip_viz:
        results["visualization"] = run_step(
            "ml.visualize_embeddings", "Step 6/6 — Embedding Visualization"
        )
    else:
        print("\n  ⏭ Skipping visualization (--skip-viz)")

    # Final summary
    total = time.perf_counter() - pipeline_start
    print(f"\n{'='*60}")
    print("  PIPELINE SUMMARY")
    print(f"{'='*60}")
    for step, success in results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {step}")
    print(f"\n  Total time: {total:.1f}s ({total/60:.1f} min)")

    if all(results.values()):
        print("\n🎉 PIPELINE COMPLETE!")
        print("   classifier.pkl → ml/saved_models/classifier.pkl")
        print("   ChromaDB → data/chroma_store/")
        print("   Plots    → ml/plots/")
        print("\n   Start the backend:")
        print("   uvicorn app.main:app --reload --port 8000")
    else:
        failed = [s for s, ok in results.items() if not ok]
        print(f"\n⚠ Some steps failed: {failed}")
        print("  Check the output above for error details.")


if __name__ == "__main__":
    main()
