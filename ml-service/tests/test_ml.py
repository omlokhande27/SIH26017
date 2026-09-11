"""
Model artifact, leakage protection, and honest labelling.

The leakage tests are the ones that matter. A model that has seen the target is
not detectable from its metrics — it simply looks excellent — so the protection
has to be structural and tested structurally.
"""

import json
from pathlib import Path

import pytest

from app.models import model_loader
from app.models.predict import estimate
from app.schemas.prediction import FeatureSnapshot

ROOT = Path(__file__).resolve().parents[1]
CARD = ROOT / "artifacts" / "model_card.json"
AUDIT = ROOT / "artifacts" / "dataset_audit.json"

LEAKAGE_COLUMNS = {
    "delay_days_target", "delay_months_target", "actual_delay_days",
    "delay_related_cost_rs", "target_quality", "delay_target_imputed",
}


@pytest.fixture(scope="module")
def card() -> dict:
    if not CARD.exists():
        pytest.skip("No model card — run python -m app.models.train")
    return json.loads(CARD.read_text(encoding="utf-8"))


class TestNoTargetLeakage:
    def test_no_leakage_column_is_a_model_feature(self, card):
        leaked = set(card["features"]) & LEAKAGE_COLUMNS
        assert leaked == set(), f"model trained on outcome columns: {leaked}"

    def test_audit_leakage_check_passed(self):
        if not AUDIT.exists():
            pytest.skip("No audit artifact")
        audit = json.loads(AUDIT.read_text(encoding="utf-8"))
        assert audit["leakage_check"]["passed"] is True

    def test_snapshot_schema_has_no_outcome_field(self):
        fields = set(FeatureSnapshot.model_fields)
        assert not (fields & LEAKAGE_COLUMNS)

    def test_snapshot_rejects_smuggled_outcome_data(self):
        # extra="forbid" is the enforcement: a caller cannot add an outcome
        # field even by accident, and the request fails at the edge.
        with pytest.raises(Exception):
            FeatureSnapshot(actual_delay_days=365)
        with pytest.raises(Exception):
            FeatureSnapshot(delay_days_target=500)


class TestModelCard:
    def test_card_records_the_dataset_limitation(self, card):
        limits = card["limitations"]
        assert limits["dataset_size_limited"] is True
        assert limits["feature_variance_limited"] is True
        assert limits["predictors_largely_imputed"] is True

    def test_card_reports_the_distinct_vector_count(self, card):
        # The headline number that governs the whole ML design.
        assert card["distinct_feature_vectors"] == 22
        assert card["training_rows"] == 130

    def test_baseline_metrics_are_always_present(self, card):
        # The median baseline is the reference and must never be omitted.
        assert "mae" in card["baseline_metrics"]
        assert card["baseline_metrics"]["mae"] > 0

    def test_grouped_cross_validation_was_used(self, card):
        # Ordinary K-fold would put copies of the same feature vector in both
        # train and test, and report a score that means nothing.
        assert "GroupKFold" in card["cv_strategy"]

    def test_selection_is_consistent_with_the_metrics(self, card):
        if card["beats_baseline"]:
            assert card["metrics"]["mae"] < card["baseline_metrics"]["mae"]
        else:
            assert card["model_type"] == "median_baseline"


class TestModelLoading:
    def test_model_loads(self):
        model_loader.reset()
        model = model_loader.load()
        if model is None:
            pytest.skip("No model artifact")
        assert model.features
        assert model.version

    def test_loading_is_cached(self):
        model_loader.reset()
        a = model_loader.load()
        b = model_loader.load()
        assert a is b

    def test_missing_artifact_is_a_supported_state(self, monkeypatch):
        # The rule engine does not need a model, so the service must stay
        # useful without one rather than refusing requests.
        model_loader.reset()
        monkeypatch.setattr(model_loader, "MODEL_PATH", ROOT / "artifacts" / "nope.joblib")
        assert model_loader.load() is None
        assert "train" in (model_loader.load_error() or "")
        model_loader.reset()


class TestPredictionHonesty:
    def test_estimate_is_labelled_when_the_model_loses_to_baseline(self, card):
        model_loader.reset()
        result = estimate(FeatureSnapshot(acquisition_percentage=40.0))
        if card["beats_baseline"]:
            assert result.prediction_type == "EXPERIMENTAL_ML_ESTIMATE"
        else:
            assert result.prediction_type == "BASELINE_MEDIAN"
            assert "not a model prediction" in result.note

    def test_confidence_is_never_high(self):
        result = estimate(FeatureSnapshot(acquisition_percentage=40.0))
        assert result.confidence in ("LOW", "NONE")

    def test_estimate_is_never_negative(self):
        result = estimate(FeatureSnapshot(acquisition_percentage=100.0, court_cases_count=0))
        if result.predicted_delay_days is not None:
            assert result.predicted_delay_days >= 0

    def test_prediction_is_reproducible(self):
        snapshot = FeatureSnapshot(acquisition_percentage=42.0, court_cases_count=2)
        assert estimate(snapshot).predicted_delay_days == estimate(snapshot).predicted_delay_days

    def test_feature_schema_consistency(self):
        # The model was fitted on training-CSV column names; the service
        # receives snapshot names. A mismatch would silently produce an all-NaN
        # row and a meaningless estimate.
        model_loader.reset()
        model = model_loader.load()
        if model is None:
            pytest.skip("No model artifact")
        result = estimate(FeatureSnapshot(
            acquisition_percentage=50.0,
            compensation_pending=1000.0,
            court_cases_count=1,
            affected_landowners=100,
        ))
        assert result.predicted_delay_days is not None
