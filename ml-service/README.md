# LandGuard AI — ML Service

Rule-based early-warning engine (**primary**) and an experimental delay
estimator (**secondary**), behind a FastAPI service that the Node backend calls.

---

## The honest headline

**No trained model beat a median baseline.** Grouped cross-validation:

| Model | MAE (days) | RMSE | R² |
|---|---:|---:|---:|
| **median_baseline** | **306.8** | 374.2 | −0.009 |
| random_forest | 323.6 | 405.9 | −0.045 |
| ridge | 332.3 | 430.7 | −0.053 |

Every R² is negative — the models explain *less* variance than a horizontal
line. That is not a tuning failure, and no amount of hyperparameter search will
fix it:

> The dataset has **130 rows but only 22 distinct feature vectors**. 108 of
> them (83%) are **identical**, and their real delays span **12 to 2070 days**.
> For 83% of the data the model has no information to tell one row from
> another, so the best any algorithm can do is emit the median. All 22
> predictor columns are imputed or derived for every row, including the four
> marked `REAL`.

So the service reports the median, labels it `BASELINE_MEDIAN`, sets confidence
`LOW`, and says in the response that it is not a model prediction. The rule
engine carries the product.

Reproduce: `.venv/bin/python scripts/audit_dataset.py && .venv/bin/python -m app.models.train`

---

## Setup

```bash
cd ml-service
python3.12 -m venv .venv          # 3.12, not 3.14 — wheel availability
.venv/bin/pip install -r requirements.txt

.venv/bin/python scripts/audit_dataset.py     # writes artifacts/dataset_audit.json
.venv/bin/python -m app.models.train          # writes artifacts/model.joblib + model_card.json

ML_SERVICE_API_KEY=$(openssl rand -base64 32) \
  .venv/bin/python -m uvicorn app.main:app --port 8000
```

Tests: `.venv/bin/python -m pytest tests/ -q`

---

## Endpoints

All except `/health` require `X-API-Key`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness. Open, so an orchestrator can probe it. Reports model state in the body. |
| POST | `/predict` | Full assessment — rules, recommendations, explanation, ML estimate |
| POST | `/evaluate-rules` | Rule engine only, no model |
| POST | `/recommendations` | Actions for whatever fired |
| GET | `/model-info` | Model card, metrics, and the baseline it was compared against |
| GET | `/feature-mapping` | The snapshot → rule-engine mapping table, as data |

`ENVIRONMENT=production` without `ML_SERVICE_API_KEY` **refuses to start**. An
unauthenticated ML endpoint on a network is an open risk-scoring oracle.

---

## Architecture

```
Project data → Feature snapshot → [ML service boundary]
                                        │
                                  Feature mapper
                                   ├──────────────┐
                                   ▼              ▼
                            Rule engine      ML estimate
                            (PRIMARY)        (SECONDARY)
                                   └──────┬───────┘
                                          ▼
                                  Prediction result
```

### Leakage boundary

The service **never queries a database** — it holds no credentials and receives
the snapshot in the request body, so it cannot reach `actual_outcomes` even in
principle. `FeatureSnapshot` uses `extra="forbid"`, so a payload carrying
`actual_delay_days` is rejected with 422 at the edge rather than quietly
ignored.

Training applies the same boundary: `scripts/audit_dataset.py` classifies seven
columns as leakage and `train.py` refuses to run if any reaches the feature
matrix.

### Why grouped cross-validation

Ordinary K-fold puts copies of the same feature vector in both train and test,
so a model that has memorised "this vector → median of its training rows"
scores well without generalising. `GroupKFold` over identical feature vectors
prevents that. It makes the reported numbers worse, which is the point.

---

## Feature mapping

The inherited `risk_rules.py` reads **47** project fields. The deployed snapshot
has **21**. Exactly one name matches.

The mismatch is a difference in *kind*, not naming: the rule engine wants counts
and percentages (`unauthorized_occupation_cases`, `land_record_completeness`)
where the snapshot records **booleans** (`encroachment`, `land_record_issue_flag`).
Turning `encroachment = true` into `unauthorized_occupation_cases = 5` would be
inventing a measurement.

So `app/services/feature_mapper.py` maps what genuinely maps and marks the rest
**UNAVAILABLE** — 9 DIRECT, 11 DERIVED, 24 UNAVAILABLE. Rules whose inputs are
unavailable are **skipped and reported**, never evaluated against a guess.

### Coverage, and why it is not just a percentage

Skipping rules deflates the score, so a project with nothing recorded would
otherwise read as low-risk — the opposite of the truth.

Raw rule coverage is a poor guard here: 10 of the 15 rules read booleans that
are `NOT NULL` in the schema, so they evaluate happily against `false`, find
nothing, and push coverage to 67%. An early version of the engine passed its
sufficiency check on an entirely empty project for exactly that reason.

Sufficiency therefore also requires the **core** graded measurements —
acquisition progress and compensation status. Without them the response carries
`sufficient: false`, `missing_core_inputs`, and an explanation that says the
assessment is INCOMPLETE.

---

## Rule engine

15 rules across 13 categories: land progress, compensation, litigation,
ownership disputes, land records, R&R, RoW, encroachment, forest clearance,
possession, administrative delay, timeline (notification and award), and scale
of displacement.

Severity bands within a rule are **mutually exclusive** — a project at 15%
acquisition is penalised once, not once each for "<75", "<50" and "<25". That is
enforced structurally by `banded_rule`, not by discipline.

Score: `15 (base) + Σ contributions`, capped at 95. The base reflects that an
acquisition with nothing recorded is unassessed rather than risk-free; the cap
leaves room for the unmeasured.

Every triggered rule returns its `evidence` — the field values that fired it —
so a reader can check the finding rather than trust it.

---

## Datasets

See `data/README.md`. `real_case_studies.csv` is **not** merged into training:
it has no target column and a different schema, so merging it would mean
inventing one.
