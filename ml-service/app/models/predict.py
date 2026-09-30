"""
The experimental ML estimate.

######################################################################
# WHY THIS IS LABELLED EXPERIMENTAL AND ALWAYS WILL BE, ON THIS DATA  #
#                                                                    #
# Grouped cross-validation result (artifacts/model_card.json):        #
#                                                                    #
#     median_baseline   MAE 306.8 days   R² -0.009                   #
#     random_forest     MAE 323.6 days   R² -0.045                   #
#     ridge             MAE 332.3 days   R² -0.053                   #
#                                                                    #
# Both models are WORSE than predicting the median every time, and    #
# every R² is negative — meaning they explain less variance than a    #
# horizontal line. That is not a tuning failure. 108 of 130 rows      #
# share one identical feature vector whose real delays span 12 to     #
# 2070 days; nothing can separate them.                              #
#                                                                    #
# So the service reports the median, labels it BASELINE_MEDIAN, and   #
# sets confidence LOW. It is a reference point, not a forecast.       #
######################################################################

A second mapping lives here, distinct from the rule engine's: the training CSV
and the database snapshot name the same concepts differently, and the model was
fitted on the CSV's columns. Feeding it snapshot names would silently produce
an all-NaN row.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.models.model_loader import LoadedModel, load
from app.schemas.prediction import FeatureSnapshot, MLEstimate

# Training-CSV column  ->  how to read it from a snapshot.
# Only exact correspondences. Anything uncertain is left NaN and imputed by the
# pipeline's median imputer, which is a stated modelling choice rather than a
# fabricated observation.
def _snapshot_to_model_row(s: FeatureSnapshot, features: list[str]) -> pd.DataFrame:
    mapping: dict[str, float | None] = {
        "land_required_ha": s.land_required_ha,
        "land_acquired_ha": s.land_acquired_ha,
        "acquisition_percentage": s.acquisition_percentage,
        "compensation_pending": s.compensation_pending,
        "compensation_pending_percentage": s.compensation_pending_percentage,
        "affected_landowners": float(s.affected_landowners) if s.affected_landowners is not None else None,
        "affected_families": float(s.affected_families) if s.affected_families is not None else None,
        "court_cases_count": float(s.court_cases_count) if s.court_cases_count is not None else None,
        "litigation_flag": 1.0 if s.litigation_flag else 0.0,
        "land_dispute_flag": 1.0 if s.land_dispute_flag else 0.0,
        "title_issue_flag": 1.0 if s.title_issue_flag else 0.0,
        "land_record_issue_flag": 1.0 if s.land_record_issue_flag else 0.0,
        "r_and_r_required": 1.0 if s.r_and_r_required else 0.0,
        "r_and_r_pending": 1.0 if s.r_and_r_pending else 0.0,
        "row_issue": 1.0 if s.row_issue else 0.0,
        "encroachment": 1.0 if s.encroachment else 0.0,
        "forest_clearance_pending": 1.0 if s.forest_clearance_pending else 0.0,
        "possession_pending": 1.0 if s.possession_pending else 0.0,
        "administrative_delay": 1.0 if s.administrative_delay else 0.0,
        "notification_delay_days": s.notification_delay_days,
        "award_delay_days": s.award_delay_days,
    }
    row = {f: mapping.get(f, np.nan) for f in features}
    return pd.DataFrame([row], columns=features).apply(pd.to_numeric, errors="coerce")


_UNAVAILABLE_NOTE = (
    "No trained model artifact is available. The rule-based assessment above is "
    "unaffected and remains the primary signal."
)


def estimate(snapshot: FeatureSnapshot) -> MLEstimate:
    model: LoadedModel | None = load()

    if model is None:
        return MLEstimate(
            predicted_delay_days=None,
            prediction_type="UNAVAILABLE",
            model_version=None,
            model_type=None,
            confidence="NONE",
            beats_baseline=False,
            note=_UNAVAILABLE_NOTE,
        )

    X = _snapshot_to_model_row(snapshot, model.features)

    try:
        raw = float(model.pipeline.predict(X)[0])
    except Exception:  # noqa: BLE001
        return MLEstimate(
            predicted_delay_days=None,
            prediction_type="UNAVAILABLE",
            model_version=model.version,
            model_type=model.model_type,
            confidence="NONE",
            beats_baseline=model.beats_baseline,
            note="The model could not score this feature vector; no estimate is reported.",
        )

    # A negative delay is not meaningful. Clamping is safe here because the
    # value is a central-tendency estimate, not a measurement.
    days = round(max(raw, 0.0), 1)

    if model.beats_baseline:
        return MLEstimate(
            predicted_delay_days=days,
            prediction_type="EXPERIMENTAL_ML_ESTIMATE",
            model_version=model.version,
            model_type=model.model_type,
            confidence="LOW",
            beats_baseline=True,
            note=(
                "EXPERIMENTAL. The model outperformed a median baseline in grouped "
                "cross-validation, but on 130 rows with 22 distinct feature vectors. "
                "Treat as indicative, not as a forecast."
            ),
        )

    return MLEstimate(
        predicted_delay_days=days,
        prediction_type="BASELINE_MEDIAN",
        model_version=model.version,
        model_type=model.model_type,
        confidence="LOW",
        beats_baseline=False,
        note=(
            f"This is the MEDIAN historical delay ({days:.0f} days), not a model prediction. "
            "No trained model beat a median baseline in grouped cross-validation — every "
            "candidate scored a negative R², explaining less variance than a horizontal "
            "line. It is a reference point for context, and carries no project-specific "
            "signal. Use the rule-based assessment for decisions."
        ),
    )
