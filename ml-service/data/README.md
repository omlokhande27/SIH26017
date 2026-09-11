# Datasets

## Provenance

| File | Rows | Origin | Use |
|---|---|---|---|
| `combined5_land_acquisition.csv` | 130 | Compiled from CAG audit reports | The ML training set |
| `neededfactors.csv` | 50 | Feature-engineering draft, subset of the above | Reference only — not trained on |
| `real_case_studies.csv` | 10 | Narrative case summaries from public reports | Demo/validation narrative only — **never merged into training** |

## Honesty labels

`combined5_land_acquisition.csv` carries its own provenance columns, and they
matter more than the row count:

- `record_status` — REAL, REAL + IMPUTED, REAL + IMPUTED PREDICTORS,
  REAL + IMPUTED PREDICTORS + PROXY TARGET
- `delay_target_imputed`, `land_area_imputed`, `actual_rate_imputed`, … — per-field flags
- `factor_imputed_count` — **24 for every row**, including the 4 marked REAL

That last one is the headline: the 22 predictor columns used for modelling are
imputed or derived for the entire dataset. Only the *target* is real for most
rows.

`real_case_studies.csv` is **not** schema-compatible with the training set: it
has no `delay_days_target`, different columns, and narrative text fields.
Merging it would mean inventing a target. It is excluded from training by
design, not by oversight.

## Reproducing the audit

```bash
cd ml-service
.venv/bin/python scripts/audit_dataset.py
```

Writes `artifacts/dataset_audit.json` and prints the summary. Nothing else in
the pipeline reads the raw CSVs without going through this audit first.
