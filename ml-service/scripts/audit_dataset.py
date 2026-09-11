"""
Dataset audit — run this before trusting any number about the training data.

Writes artifacts/dataset_audit.json and prints a summary. The training pipeline
reads the audit rather than re-deriving these facts, so the model card and the
API's limitation flags cannot drift from what the data actually is.

The audit exists because the headline row count is misleading. 130 rows sounds
workable; 22 distinct feature vectors, with 83% of rows sharing one, is not.
Reporting the first number without the second would be the single most
dishonest thing this project could do.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "combined5_land_acquisition.csv"
OUT = ROOT / "artifacts" / "dataset_audit.json"

TARGET = "delay_days_target"

# Columns that are outcome data, identifiers, or provenance metadata. None of
# them may become a model input.
#
# The leakage group is the important one: every column here is knowable only
# AFTER the delay has happened. Training on any of them produces a model with
# excellent offline metrics and no predictive power.
LEAKAGE_COLUMNS = [
    "delay_days_target",
    "delay_months_target",
    "delay_related_cost_rs",
    "delay_measure_type",
    "delay_cost_imputed",
    "delay_target_imputed",
    "target_quality",
]

IDENTIFIER_COLUMNS = [
    "case_id_combined",
    "region",
    "location",
    "source_report",
    "project_name",
    "mauja",
    "source_annexure",
    "notification_or_period_text",
    "estimate_approved_period",
    "possession_date",
]

PROVENANCE_COLUMNS = [
    "record_status",
    "land_area_imputed",
    "actual_rate_imputed",
    "expected_rate_imputed",
    "any_final_imputation",
    "final_imputation_method",
    "factor_imputation_flag",
    "factor_data_quality",
    "factor_fill_method",
    "factor_imputed_count",
]

# Monetary columns describing the *settlement*, not the project's risk profile.
# They are excluded as predictors because several are derived from the same
# audit figures that produced the target.
SETTLEMENT_COLUMNS = [
    "market_value_land_rs",
    "value_used_for_calculation_rs",
    "additional_compensation_leviable_rs",
    "additional_compensation_levied_rs",
    "calculation_difference_rs",
]


def audit() -> dict:
    df = pd.read_csv(DATA)

    excluded = set(LEAKAGE_COLUMNS + IDENTIFIER_COLUMNS + PROVENANCE_COLUMNS + SETTLEMENT_COLUMNS)
    candidates = [c for c in df.columns if c not in excluded]

    # --- per-feature statistics ---------------------------------------------
    features: list[dict] = []
    for col in candidates:
        series = df[col]
        numeric = pd.to_numeric(series, errors="coerce")
        is_numeric = numeric.notna().sum() > 0

        entry: dict = {
            "column": col,
            "dtype": str(series.dtype),
            "is_numeric": bool(is_numeric),
            "missing": int(series.isna().sum()),
            "missing_pct": round(float(series.isna().mean() * 100), 2),
            "distinct_values": int(series.nunique(dropna=True)),
        }

        if is_numeric:
            entry["variance"] = (
                None if numeric.var() is np.nan else round(float(numeric.var(ddof=0)), 6)
            )
            entry["zero_variance"] = bool(numeric.nunique(dropna=True) <= 1)
            target_numeric = pd.to_numeric(df[TARGET], errors="coerce")
            if numeric.nunique(dropna=True) > 1 and target_numeric.nunique(dropna=True) > 1:
                entry["corr_with_target"] = round(float(numeric.corr(target_numeric)), 4)
            else:
                entry["corr_with_target"] = None
        else:
            entry["zero_variance"] = bool(series.nunique(dropna=True) <= 1)
            entry["corr_with_target"] = None

        features.append(entry)

    usable = [
        f["column"]
        for f in features
        if f["is_numeric"] and not f["zero_variance"] and f["missing_pct"] < 50
    ]
    zero_variance = [f["column"] for f in features if f["zero_variance"]]

    # --- the finding that governs the whole ML design -----------------------
    # How many genuinely different inputs does the model actually see?
    vectors = df[usable].astype(str).agg("|".join, axis=1)
    counts = vectors.value_counts()
    largest = int(counts.iloc[0]) if len(counts) else 0

    target = pd.to_numeric(df[TARGET], errors="coerce")

    # Target spread inside the single largest identical-feature group: the
    # model cannot distinguish these rows at all, so this range is the
    # irreducible error floor for 83% of the data.
    largest_group_key = counts.index[0] if len(counts) else None
    in_group = target[vectors == largest_group_key].dropna() if largest_group_key else pd.Series(dtype=float)

    # --- provenance ----------------------------------------------------------
    record_status = (
        df["record_status"].value_counts().to_dict() if "record_status" in df.columns else {}
    )
    imputed_flags = {
        col: int(pd.to_numeric(df[col], errors="coerce").fillna(0).sum())
        for col in df.columns
        if col.endswith("_imputed")
    }

    # --- leakage check -------------------------------------------------------
    # Assert, don't assume: no excluded column may appear in the usable set.
    leaked = sorted(set(usable) & set(LEAKAGE_COLUMNS))

    return {
        "source_file": DATA.name,
        "rows": int(len(df)),
        "columns_total": int(len(df.columns)),
        "target": TARGET,
        "target_stats": {
            "non_null": int(target.notna().sum()),
            "min": float(target.min()),
            "max": float(target.max()),
            "mean": round(float(target.mean()), 2),
            "median": float(target.median()),
            "std": round(float(target.std(ddof=0)), 2),
        },
        "excluded": {
            "leakage": LEAKAGE_COLUMNS,
            "identifiers": IDENTIFIER_COLUMNS,
            "provenance": PROVENANCE_COLUMNS,
            "settlement_figures": SETTLEMENT_COLUMNS,
            "total_excluded": len(excluded),
        },
        "leakage_check": {
            "leaked_columns_in_feature_set": leaked,
            "passed": len(leaked) == 0,
        },
        "features": {
            "candidates": len(candidates),
            "usable": usable,
            "usable_count": len(usable),
            "zero_variance": zero_variance,
            "zero_variance_count": len(zero_variance),
            "detail": features,
        },
        "distinct_feature_vectors": {
            "count": int(len(counts)),
            "largest_group_rows": largest,
            "largest_group_pct": round(largest / len(df) * 100, 1) if len(df) else 0.0,
            "singleton_groups": int((counts == 1).sum()),
            "target_spread_in_largest_group": {
                "n": int(len(in_group)),
                "min": float(in_group.min()) if len(in_group) else None,
                "max": float(in_group.max()) if len(in_group) else None,
                "median": float(in_group.median()) if len(in_group) else None,
            },
        },
        "provenance": {
            "record_status": record_status,
            "imputed_flag_totals": imputed_flags,
            "factor_imputed_count_unique": (
                sorted(df["factor_imputed_count"].dropna().unique().tolist())
                if "factor_imputed_count" in df.columns
                else []
            ),
        },
    }


def main() -> None:
    report = audit()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    d = report["distinct_feature_vectors"]
    t = report["target_stats"]

    print("\n" + "=" * 66)
    print("  DATASET AUDIT")
    print("=" * 66)
    print(f"  file                     {report['source_file']}")
    print(f"  rows                     {report['rows']}")
    print(f"  columns (total)          {report['columns_total']}")
    print(f"  target                   {report['target']}")
    print(f"  target range             {t['min']:.0f} – {t['max']:.0f} days "
          f"(median {t['median']:.0f}, sd {t['std']:.0f})")
    print()
    print(f"  candidate features       {report['features']['candidates']}")
    print(f"  USABLE features          {report['features']['usable_count']}")
    print(f"  zero-variance dropped    {report['features']['zero_variance_count']}")
    print(f"  excluded columns         {report['excluded']['total_excluded']} "
          f"({len(report['excluded']['leakage'])} for leakage)")
    print()
    print("  --- the finding that governs the ML design ---")
    print(f"  DISTINCT feature vectors {d['count']}   (from {report['rows']} rows)")
    print(f"  largest identical group  {d['largest_group_rows']} rows "
          f"({d['largest_group_pct']}% of the dataset)")
    g = d["target_spread_in_largest_group"]
    if g["n"]:
        print(f"    their targets range    {g['min']:.0f} – {g['max']:.0f} days "
              f"(median {g['median']:.0f})")
        print("    -> the model cannot tell these rows apart; the median is the")
        print("       best any algorithm can do for them")
    print(f"  singleton groups         {d['singleton_groups']}")
    print()
    print("  --- provenance ---")
    for status, n in report["provenance"]["record_status"].items():
        print(f"    {status:<45} {n}")
    print(f"    factor_imputed_count values: {report['provenance']['factor_imputed_count_unique']}")
    print()
    print(f"  leakage check            {'PASS' if report['leakage_check']['passed'] else 'FAIL'}")
    print("=" * 66)
    print(f"  written to {OUT.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
