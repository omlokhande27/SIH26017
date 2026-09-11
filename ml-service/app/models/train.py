"""
Training — and an honest evaluation of whether the result is worth anything.

WHAT THIS SCRIPT IS REALLY FOR
------------------------------
Not to produce a good model. The audited data cannot support one, and this
script's main job is to DEMONSTRATE that rather than assert it: it always
trains a median baseline first, evaluates every candidate against it with the
same cross-validation folds, and records whether any of them actually won.

The `beats_baseline` flag it writes is consumed by the API, which uses it to
label the estimate. If the models lose, the service says so at runtime.

WHY THE FOLDS ARE GROUPED
-------------------------
83% of rows share one identical feature vector. With ordinary K-fold, the same
feature vector appears in both train and test, so a model that has memorised
"this vector -> median of its training rows" scores well without generalising
at all. Grouping by feature vector puts every copy of a vector in the same
fold, which is the only way the score means anything.

That choice makes the reported numbers WORSE. That is the point.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_selection import VarianceThreshold
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "combined5_land_acquisition.csv"
AUDIT = ROOT / "artifacts" / "dataset_audit.json"
ARTIFACTS = ROOT / "artifacts"
MODEL_PATH = ARTIFACTS / "model.joblib"
CARD_PATH = ARTIFACTS / "model_card.json"

TARGET = "delay_days_target"
RANDOM_STATE = 42

# The snapshot fields the ML service actually receives at prediction time.
# A feature the service cannot be given is useless no matter how predictive it
# looks offline, so the training set is restricted to this intersection.
SERVABLE_FEATURES = [
    "land_acquisition_percentage",
    "compensation_pending_rs",
    "court_cases_count",
    "affected_landowners_count",
    "R&R_pending_count",
    "award_delay_days",
    "possession_delay_days",
    "land_parcels_count",
    "compensation_pending",
    "court_case",
    "possession_obtained",
    "RoW_issue",
    "encroachment",
    "land_record_issue",
    "government_coordination_delay",
    "forest_clearance",
    "R&R_required",
]


def load() -> tuple[pd.DataFrame, pd.Series, list[str]]:
    if not AUDIT.exists():
        raise SystemExit("Run scripts/audit_dataset.py first — training reads its output.")

    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    if not audit["leakage_check"]["passed"]:
        raise SystemExit("Dataset audit reports a leakage failure. Refusing to train.")

    df = pd.read_csv(DATA)

    usable = set(audit["features"]["usable"])
    features = [c for c in SERVABLE_FEATURES if c in usable]

    # Belt and braces: assert no outcome column can reach the matrix, whatever
    # the audit said. A training script should not be able to leak even if its
    # inputs are wrong.
    forbidden = set(audit["excluded"]["leakage"])
    leaked = sorted(set(features) & forbidden)
    if leaked:
        raise SystemExit(f"Refusing to train: leakage columns in feature set: {leaked}")

    X = df[features].apply(pd.to_numeric, errors="coerce")
    y = pd.to_numeric(df[TARGET], errors="coerce")

    keep = y.notna()
    return X[keep], y[keep], features


def groups_for(X: pd.DataFrame) -> np.ndarray:
    """Group id per row: identical feature vectors share a group."""
    keys = X.astype(str).agg("|".join, axis=1)
    return pd.factorize(keys)[0]


def evaluate(model: Any, X: pd.DataFrame, y: pd.Series, groups: np.ndarray) -> dict[str, float]:
    """Grouped cross-validation. Folds are capped by the number of groups."""
    n_groups = len(np.unique(groups))
    n_splits = min(5, n_groups)
    if n_splits < 2:
        return {"mae": float("nan"), "rmse": float("nan"), "r2": float("nan"), "folds": 0}

    cv = GroupKFold(n_splits=n_splits)
    maes, rmses, preds, actuals = [], [], [], []

    for train_idx, test_idx in cv.split(X, y, groups):
        fitted = model.fit(X.iloc[train_idx], y.iloc[train_idx])
        pred = fitted.predict(X.iloc[test_idx])
        maes.append(mean_absolute_error(y.iloc[test_idx], pred))
        rmses.append(np.sqrt(mean_squared_error(y.iloc[test_idx], pred)))
        preds.extend(pred)
        actuals.extend(y.iloc[test_idx])

    # R² is computed over pooled out-of-fold predictions rather than averaged
    # per fold: a fold whose actuals barely vary produces a wild R² that would
    # dominate the mean and misrepresent the whole.
    return {
        "mae": round(float(np.mean(maes)), 2),
        "rmse": round(float(np.mean(rmses)), 2),
        "r2": round(float(r2_score(actuals, preds)), 4),
        "folds": int(n_splits),
    }


def candidates() -> dict[str, Any]:
    """
    Baseline first, then two simple models.

    No gradient booster: with 22 distinct feature vectors it would memorise the
    20 singletons and report a flattering in-sample score that means nothing.
    Adding one would make the results look better and be less true.
    """
    impute = ("impute", SimpleImputer(strategy="median"))
    return {
        "median_baseline": Pipeline([impute, ("model", DummyRegressor(strategy="median"))]),
        # VarianceThreshold before scaling is load-bearing, not tidiness.
        # GroupKFold can leave a column constant WITHIN a training fold even
        # when it varies globally; StandardScaler then divides by ~0 and the
        # fold's predictions overflow to inf. Dropping zero-variance columns
        # per fold is what makes the ridge numbers real rather than garbage.
        "ridge": Pipeline([
            impute,
            ("drop_constant", VarianceThreshold(threshold=0.0)),
            ("scale", StandardScaler()),
            ("model", Ridge(alpha=1.0)),
        ]),
        "random_forest": Pipeline([
            impute,
            ("model", RandomForestRegressor(
                n_estimators=200,
                min_samples_leaf=3,   # blunt memorisation of singleton groups
                random_state=RANDOM_STATE,
                n_jobs=-1,
            )),
        ]),
    }


def main() -> None:
    X, y, features = load()
    groups = groups_for(X)
    n_groups = len(np.unique(groups))

    print("\n" + "=" * 72)
    print("  MODEL TRAINING — grouped cross-validation")
    print("=" * 72)
    print(f"  rows                      {len(X)}")
    print(f"  features                  {len(features)}")
    print(f"  DISTINCT feature vectors  {n_groups}")
    print(f"  target                    {TARGET} "
          f"(median {y.median():.0f}, sd {y.std(ddof=0):.0f} days)")
    print()
    print("  Folds are grouped by feature vector: every copy of a vector stays")
    print("  in one fold, so a model cannot score by recognising a row it has")
    print("  already seen. This makes the numbers below worse, and honest.")
    print()

    results: dict[str, dict[str, float]] = {}
    for name, model in candidates().items():
        results[name] = evaluate(model, X, y, groups)
        m = results[name]
        print(f"  {name:<18} MAE {m['mae']:>8.1f}   RMSE {m['rmse']:>8.1f}   R² {m['r2']:>8.3f}")

    baseline = results["median_baseline"]
    challengers = {k: v for k, v in results.items() if k != "median_baseline"}

    # "Better" means a meaningfully lower MAE, not a rounding win. 5% is a low
    # bar and the models still have to clear it.
    best_name, best = min(challengers.items(), key=lambda kv: kv[1]["mae"])
    improvement = (baseline["mae"] - best["mae"]) / baseline["mae"] * 100
    beats = improvement >= 5.0

    print()
    print("  " + "-" * 68)
    if beats:
        print(f"  {best_name} beats the median baseline by {improvement:.1f}% MAE.")
        selected = best_name
    else:
        print(f"  NO MODEL BEATS THE MEDIAN BASELINE.")
        print(f"  Best challenger ({best_name}) is {abs(improvement):.1f}% "
              f"{'better' if improvement > 0 else 'WORSE'} — under the 5% threshold.")
        print()
        print("  This is the expected result and is not a bug. With 83% of rows")
        print("  sharing one feature vector whose real delays span 12-2070 days,")
        print("  there is no signal to separate them. The median IS the best")
        print("  available estimate, and the service will label it as such.")
        selected = "median_baseline"
    print("  " + "-" * 68)

    # Fit the selected model on everything and persist it.
    final = candidates()[selected]
    final.fit(X, y)

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": final, "features": features}, MODEL_PATH)

    card = {
        "model_version": f"0.1.0-{selected}",
        "model_type": selected,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_rows": int(len(X)),
        "distinct_feature_vectors": int(n_groups),
        "features": features,
        "target": TARGET,
        "cv_strategy": "GroupKFold over identical feature vectors",
        "metrics": results[selected],
        "baseline_metrics": baseline,
        "all_results": results,
        "beats_baseline": bool(beats),
        "improvement_over_baseline_pct": round(float(improvement), 2),
        "selection_rule": "A challenger must lower MAE by >=5% to be selected over the median.",
        "limitations": {
            "dataset_size_limited": True,
            "feature_variance_limited": True,
            "predictors_largely_imputed": True,
            "ml_outperforms_baseline": bool(beats),
            "note": (
                "130 rows, 22 distinct feature vectors, 108 of them identical. All 22 "
                "predictor columns are imputed or derived for every row, including the 4 "
                "marked REAL. This estimate is EXPERIMENTAL and must not be presented as a "
                "reliable forecast. The rule engine is the primary decision-support signal."
            ),
        },
    }
    CARD_PATH.write_text(json.dumps(card, indent=2), encoding="utf-8")

    print(f"\n  selected    {selected}")
    print(f"  model       {MODEL_PATH.relative_to(ROOT)}")
    print(f"  model card  {CARD_PATH.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
