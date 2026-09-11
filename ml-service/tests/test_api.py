"""
HTTP surface: authentication, contracts, and error handling.

The service is reachable only by the Node backend, so the first thing tested is
that an unauthenticated caller gets nothing — an open risk-scoring endpoint
would let anyone score feature vectors of their own invention.
"""

import pytest


class TestAuthentication:
    def test_predict_rejects_a_missing_api_key(self, client, low_risk_snapshot):
        r = client.post("/predict", json={"snapshot": low_risk_snapshot})
        assert r.status_code == 401

    def test_predict_rejects_a_wrong_api_key(self, client, low_risk_snapshot):
        r = client.post(
            "/predict",
            json={"snapshot": low_risk_snapshot},
            headers={"X-API-Key": "wrong-key"},
        )
        assert r.status_code == 401

    @pytest.mark.parametrize("path", ["/evaluate-rules", "/recommendations"])
    def test_rule_endpoints_require_a_key(self, client, path, low_risk_snapshot):
        r = client.post(path, json={"snapshot": low_risk_snapshot})
        assert r.status_code == 401

    def test_model_info_requires_a_key(self, client):
        assert client.get("/model-info").status_code == 401

    def test_health_is_open_for_orchestrator_probes(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_health_reports_auth_is_enabled(self, client):
        assert client.get("/health").json()["auth_enabled"] is True


class TestPredict:
    def test_returns_a_complete_assessment(self, client, auth_headers, critical_risk_snapshot):
        r = client.post(
            "/predict", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        )
        assert r.status_code == 200
        body = r.json()
        for key in (
            "risk_score", "risk_level", "triggered_rules", "skipped_rules", "coverage",
            "recommendations", "explanation", "ml_estimate", "limitations",
        ):
            assert key in body, f"missing {key}"

    def test_critical_project_scores_critical(self, client, auth_headers, critical_risk_snapshot):
        body = client.post(
            "/predict", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        ).json()
        assert body["risk_level"] == "CRITICAL"
        assert body["risk_score"] >= 80

    def test_low_risk_project_scores_low(self, client, auth_headers, low_risk_snapshot):
        body = client.post(
            "/predict", json={"snapshot": low_risk_snapshot}, headers=auth_headers
        ).json()
        assert body["risk_level"] == "LOW"

    def test_every_triggered_rule_carries_evidence(
        self, client, auth_headers, critical_risk_snapshot
    ):
        body = client.post(
            "/predict", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        ).json()
        assert body["triggered_rules"]
        for rule in body["triggered_rules"]:
            assert rule["evidence"]
            assert rule["reason"]
            assert rule["contribution"] > 0

    def test_recommendations_are_linked_to_triggered_rules(
        self, client, auth_headers, critical_risk_snapshot
    ):
        # No generic advice: every recommendation must trace to a rule that
        # actually fired.
        body = client.post(
            "/predict", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        ).json()
        fired = {r["rule_id"] for r in body["triggered_rules"]}
        assert body["recommendations"]
        for rec in body["recommendations"]:
            assert set(rec["linked_rule_ids"]) <= fired

    def test_clean_project_gets_no_recommendations(
        self, client, auth_headers, low_risk_snapshot
    ):
        body = client.post(
            "/predict", json={"snapshot": low_risk_snapshot}, headers=auth_headers
        ).json()
        assert body["recommendations"] == []

    def test_ml_estimate_is_labelled_experimental_or_baseline(
        self, client, auth_headers, low_risk_snapshot
    ):
        body = client.post(
            "/predict", json={"snapshot": low_risk_snapshot}, headers=auth_headers
        ).json()
        ml = body["ml_estimate"]
        assert ml["prediction_type"] in (
            "EXPERIMENTAL_ML_ESTIMATE", "BASELINE_MEDIAN", "UNAVAILABLE"
        )
        assert ml["confidence"] in ("LOW", "NONE")

    def test_limitations_are_always_reported(self, client, auth_headers, low_risk_snapshot):
        body = client.post(
            "/predict", json={"snapshot": low_risk_snapshot}, headers=auth_headers
        ).json()
        limits = body["limitations"]
        assert limits["dataset_size_limited"] is True
        assert limits["feature_variance_limited"] is True
        assert limits["predictors_largely_imputed"] is True
        assert limits["summary"]

    def test_incomplete_project_is_flagged_not_reassured(self, client, auth_headers):
        # The dangerous case: nothing recorded. The score is low, and the
        # response must say plainly that this is missing data, not safety.
        body = client.post("/predict", json={"snapshot": {}}, headers=auth_headers).json()
        assert body["coverage"]["sufficient"] is False
        assert body["coverage"]["missing_core_inputs"]
        assert "INCOMPLETE" in body["explanation"]


class TestLeakageAtTheApiBoundary:
    @pytest.mark.parametrize("field", [
        "actual_delay_days", "delay_days_target", "delay_months_target",
        "actual_completion_date", "outcome_date", "cost_overrun",
    ])
    def test_outcome_fields_are_rejected(self, client, auth_headers, field):
        # extra="forbid" makes the leakage boundary structural: outcome data
        # cannot enter the service even by mistake.
        r = client.post(
            "/predict",
            json={"snapshot": {"acquisition_percentage": 50.0, field: 365}},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_response_never_contains_outcome_data(
        self, client, auth_headers, critical_risk_snapshot
    ):
        body = client.post(
            "/predict", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        ).text
        for term in ("actual_delay_days", "delay_days_target", "actual_outcomes"):
            assert term not in body


class TestValidation:
    @pytest.mark.parametrize("payload", [
        {"snapshot": {"acquisition_percentage": 150.0}},
        {"snapshot": {"acquisition_percentage": -10.0}},
        {"snapshot": {"compensation_pending_percentage": 200.0}},
        {"snapshot": {"land_required_ha": -5.0}},
        {"snapshot": {"court_cases_count": -1}},
        {"snapshot": {"notification_delay_days": -30.0}},
    ])
    def test_invalid_values_return_422(self, client, auth_headers, payload):
        assert client.post("/predict", json=payload, headers=auth_headers).status_code == 422

    def test_malformed_body_returns_422(self, client, auth_headers):
        assert client.post("/predict", json={"wrong": "shape"}, headers=auth_headers).status_code == 422

    def test_unknown_top_level_field_is_rejected(self, client, auth_headers):
        r = client.post(
            "/predict",
            json={"snapshot": {}, "extra": "nope"},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_empty_snapshot_is_accepted_and_flagged(self, client, auth_headers):
        # Valid request, inadequate data. 200 with an honest coverage warning
        # is more useful than a refusal.
        r = client.post("/predict", json={"snapshot": {}}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["coverage"]["sufficient"] is False

    def test_error_response_contains_no_stack_trace(self, client, auth_headers):
        r = client.post(
            "/predict",
            json={"snapshot": {"acquisition_percentage": 999}},
            headers=auth_headers,
        )
        assert "Traceback" not in r.text
        assert "File \"" not in r.text


class TestRuleEndpoints:
    def test_evaluate_rules_returns_the_assessment_without_a_model(
        self, client, auth_headers, critical_risk_snapshot
    ):
        r = client.post(
            "/evaluate-rules", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        )
        assert r.status_code == 200
        body = r.json()
        assert body["risk_level"] == "CRITICAL"
        assert "ml_estimate" not in body

    def test_recommendations_endpoint_returns_actions(
        self, client, auth_headers, critical_risk_snapshot
    ):
        r = client.post(
            "/recommendations", json={"snapshot": critical_risk_snapshot}, headers=auth_headers
        )
        assert r.status_code == 200
        recs = r.json()
        assert recs
        assert all({"title", "action", "priority", "rationale"} <= set(x) for x in recs)


class TestModelInfo:
    def test_reports_the_model_and_its_baseline(self, client, auth_headers):
        r = client.get("/model-info", headers=auth_headers)
        if r.status_code == 503:
            pytest.skip("No model artifact")
        body = r.json()
        assert body["training_rows"] == 130
        assert body["distinct_feature_vectors"] == 22
        assert body["baseline_metrics"]["mae"] > 0
        assert body["limitations"]["dataset_size_limited"] is True


class TestFeatureMappingEndpoint:
    def test_exposes_the_mapping_table(self, client, auth_headers):
        r = client.get("/feature-mapping", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["direct"] > 0
        assert body["derived"] > 0
        assert body["unavailable"] > 0
        assert len(body["mappings"]) == body["total"]
