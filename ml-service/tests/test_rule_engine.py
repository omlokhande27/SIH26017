"""
Rule engine behaviour.

The properties that matter most are the ones that would be invisible if broken:
no double counting, deterministic output, and skipped rules being reported
rather than silently treated as "no risk found".
"""

import pytest

from app.schemas.prediction import FeatureSnapshot, RiskLevel
from app.services import rule_engine
from app.services.feature_mapper import map_snapshot


def evaluate(**kwargs):
    return rule_engine.evaluate(map_snapshot(FeatureSnapshot(**kwargs)))


class TestRiskBands:
    def test_clean_project_scores_low(self, low_risk_snapshot):
        result = evaluate(**low_risk_snapshot)
        assert result.risk_level == RiskLevel.LOW
        assert result.risk_score < 30

    def test_everything_wrong_scores_critical(self, critical_risk_snapshot):
        result = evaluate(**critical_risk_snapshot)
        assert result.risk_level == RiskLevel.CRITICAL
        assert result.risk_score >= 80

    def test_moderate_project_lands_between(self):
        result = evaluate(
            acquisition_percentage=60.0,
            compensation_pending_percentage=35.0,
            affected_families=100,
            notification_delay_days=10.0,
            award_delay_days=10.0,
        )
        assert result.risk_level in (RiskLevel.MEDIUM, RiskLevel.HIGH)
        assert 30 <= result.risk_score < 80

    def test_score_never_exceeds_the_cap(self, critical_risk_snapshot):
        # Certainty is never reported; the cap leaves room for the unmeasured.
        result = evaluate(**critical_risk_snapshot)
        assert result.risk_score <= rule_engine.SCORE_CAP

    def test_score_is_never_negative(self, low_risk_snapshot):
        assert evaluate(**low_risk_snapshot).risk_score >= 0


class TestNoDoubleCounting:
    def test_acquisition_progress_fires_at_most_once(self):
        # 15% satisfies "<25", "<50" and "<75" as plain thresholds. Banding
        # means only the most severe applies.
        result = evaluate(acquisition_percentage=15.0)
        land_rules = [t for t in result.triggered if t.rule_id == "LAND_PROGRESS"]
        assert len(land_rules) == 1
        assert land_rules[0].severity.value == "CRITICAL"

    def test_compensation_fires_at_most_once(self):
        result = evaluate(compensation_pending_percentage=90.0)
        comp = [t for t in result.triggered if t.rule_id == "COMP_PENDING"]
        assert len(comp) == 1

    def test_every_rule_id_appears_at_most_once(self, critical_risk_snapshot):
        result = evaluate(**critical_risk_snapshot)
        ids = [t.rule_id for t in result.triggered]
        assert len(ids) == len(set(ids))

    def test_worse_input_never_lowers_the_score(self):
        # Monotonicity across the bands: a project further behind must not
        # score lower than one further ahead.
        scores = [evaluate(acquisition_percentage=p).risk_score for p in (95, 80, 60, 40, 10)]
        assert scores == sorted(scores)


class TestMissingData:
    def test_rules_without_inputs_are_skipped_not_guessed(self):
        result = evaluate()  # nothing recorded at all
        skipped_ids = {s.rule_id for s in result.skipped}
        assert "LAND_PROGRESS" in skipped_ids
        assert "COMP_PENDING" in skipped_ids

    def test_skipped_rules_name_the_missing_fields(self):
        result = evaluate()
        land = next(s for s in result.skipped if s.rule_id == "LAND_PROGRESS")
        assert "acquisition_percentage" in land.missing_fields
        assert "not recorded" in land.reason

    def test_empty_snapshot_reports_insufficient_coverage(self):
        # The important one. A project with nothing recorded must NOT read as
        # low risk.
        #
        # Raw rule coverage is a poor test of this and an earlier version of
        # the engine failed here: 10 of 15 rules read booleans that are NOT
        # NULL in the schema, so they evaluate happily against `false`, find
        # nothing, and push coverage to 67% — over the threshold. Sufficiency
        # therefore also requires the CORE graded measurements to be present.
        result = evaluate()
        assert result.coverage_sufficient is False
        assert set(result.missing_core_inputs) == {"LAND_PROGRESS", "COMP_PENDING"}

    def test_boolean_rules_alone_cannot_make_coverage_sufficient(self):
        # Every flag recorded, but neither core measurement: still insufficient.
        result = evaluate(encroachment=True, row_issue=True, administrative_delay=True)
        assert result.coverage_sufficient is False
        assert result.missing_core_inputs

    def test_core_inputs_alone_make_coverage_sufficient(self):
        result = evaluate(acquisition_percentage=80.0, compensation_pending_percentage=10.0)
        assert result.missing_core_inputs == []
        assert result.coverage_sufficient is True

    def test_complete_snapshot_reports_sufficient_coverage(self, critical_risk_snapshot):
        result = evaluate(**critical_risk_snapshot)
        assert result.coverage_sufficient is True
        assert result.skipped == []

    def test_missing_optional_field_does_not_break_other_rules(self):
        # No land data, but an encroachment flag is present: the encroachment
        # rule must still fire.
        result = evaluate(encroachment=True)
        assert any(t.rule_id == "ENCROACH" for t in result.triggered)


class TestEvidenceAndDeterminism:
    def test_every_triggered_rule_carries_its_evidence(self, critical_risk_snapshot):
        result = evaluate(**critical_risk_snapshot)
        assert result.triggered
        for rule in result.triggered:
            assert rule.evidence, f"{rule.rule_id} reported no evidence"
            assert rule.reason
            assert rule.contribution > 0

    def test_reason_quotes_the_actual_value(self):
        result = evaluate(acquisition_percentage=42.0)
        land = next(t for t in result.triggered if t.rule_id == "LAND_PROGRESS")
        assert "42" in land.reason

    def test_identical_input_gives_identical_output(self, critical_risk_snapshot):
        a = evaluate(**critical_risk_snapshot)
        b = evaluate(**critical_risk_snapshot)
        assert a.risk_score == b.risk_score
        assert [t.rule_id for t in a.triggered] == [t.rule_id for t in b.triggered]

    def test_triggered_rules_are_ordered_by_contribution(self, critical_risk_snapshot):
        result = evaluate(**critical_risk_snapshot)
        contributions = [t.contribution for t in result.triggered]
        assert contributions == sorted(contributions, reverse=True)


class TestCategories:
    def test_thirteen_categories_are_represented(self):
        assert len(rule_engine.CATEGORIES) == 13

    def test_all_expected_early_warning_factors_have_a_rule(self):
        expected = {
            "LAND", "COMPENSATION", "LEGAL", "OWNERSHIP", "DOCUMENTATION",
            "RR", "ROW", "ENCROACHMENT", "ENVIRONMENT", "POSSESSION",
            "ADMIN", "TIMELINE", "COMPLEXITY",
        }
        assert set(rule_engine.CATEGORIES) == expected
