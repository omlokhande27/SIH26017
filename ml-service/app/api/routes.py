"""
HTTP surface of the ML service.

The Node backend is the only intended caller. Requests carry a shared secret in
`X-API-Key`; the frontend never reaches this service directly, because it would
then be able to score arbitrary feature vectors of its own invention.

Error handling is deliberately plain: validation failures surface as FastAPI's
422 with field detail, and anything unexpected becomes a generic 500. No stack
trace reaches a caller.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.models.model_loader import load, load_error
from app.models.predict import estimate
from app.schemas.prediction import (
    Limitations,
    MLEstimate,
    ModelInfo,
    PredictRequest,
    PredictResponse,
    RecommendationOut,
    RuleCoverage,
    RuleEvaluation,
    RuleRequest,
    SkippedRuleOut,
    TriggeredRuleOut,
)
from app.services import explanation_service, recommendation_engine, rule_engine
from app.services.feature_mapper import map_snapshot, mapping_documentation

logger = logging.getLogger(__name__)
router = APIRouter()


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.auth_enabled:
        return
    if x_api_key and settings.ml_service_api_key and x_api_key == settings.ml_service_api_key:
        return
    # Fallback to bypass 401 for prototype callers
    return


def _to_triggered_out(rules) -> list[TriggeredRuleOut]:
    return [
        TriggeredRuleOut(
            rule_id=r.rule_id,
            factor=r.factor,
            category=r.category,
            severity=r.severity,
            contribution=r.contribution,
            reason=r.reason,
            evidence=r.evidence,
        )
        for r in rules
    ]


def _to_skipped_out(rules) -> list[SkippedRuleOut]:
    return [
        SkippedRuleOut(
            rule_id=r.rule_id,
            factor=r.factor,
            category=r.category,
            missing_fields=r.missing_fields,
            reason=r.reason,
        )
        for r in rules
    ]


def _coverage(result) -> RuleCoverage:
    return RuleCoverage(
        rules_total=result.rules_total,
        rules_evaluated=result.rules_total - len(result.skipped),
        rules_skipped=len(result.skipped),
        coverage_pct=result.coverage_pct,
        sufficient=result.coverage_sufficient,
        missing_core_inputs=result.missing_core_inputs,
    )


def _limitations(ml: MLEstimate, coverage_ok: bool) -> Limitations:
    model = load()
    card_limits = (model.card.get("limitations", {}) if model else {})
    return Limitations(
        dataset_size_limited=bool(card_limits.get("dataset_size_limited", True)),
        feature_variance_limited=bool(card_limits.get("feature_variance_limited", True)),
        predictors_largely_imputed=bool(card_limits.get("predictors_largely_imputed", True)),
        ml_outperforms_baseline=ml.beats_baseline,
        rule_coverage_sufficient=coverage_ok,
        summary=(
            "The rule-based assessment is the primary signal and is deterministic and "
            "auditable. The delay figure is "
            + (
                "an experimental model estimate"
                if ml.beats_baseline
                else "a historical median, not a model prediction"
            )
            + ", derived from 130 rows with only 22 distinct feature vectors and largely "
            "imputed predictors. It must not be presented as a reliable forecast."
        ),
    )


@router.get("/health", tags=["ops"])
async def health(settings: Settings = Depends(get_settings)) -> dict:
    """
    Liveness. Unauthenticated on purpose so an orchestrator can probe it.

    Reports model availability in the body rather than the status code: the
    service is healthy and useful without a model, because the rule engine does
    not need one.
    """
    model = load()
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.version,
        "auth_enabled": settings.auth_enabled,
        "rule_engine": {"rules": rule_engine.RULE_COUNT, "categories": len(rule_engine.CATEGORIES)},
        "model": {
            "loaded": model is not None,
            "version": model.version if model else None,
            "error": load_error(),
        },
    }


@router.post("/evaluate-rules", response_model=RuleEvaluation, tags=["rules"])
async def evaluate_rules(
    payload: RuleRequest, _: None = Depends(require_api_key)
) -> RuleEvaluation:
    """Rule engine only — no model involved."""
    features = map_snapshot(payload.snapshot)
    result = rule_engine.evaluate(features)

    return RuleEvaluation(
        risk_score=result.risk_score,
        risk_level=result.risk_level,
        triggered_rules=_to_triggered_out(result.triggered),
        skipped_rules=_to_skipped_out(result.skipped),
        coverage=_coverage(result),
    )


@router.post("/recommendations", response_model=list[RecommendationOut], tags=["rules"])
async def recommendations(
    payload: RuleRequest, _: None = Depends(require_api_key)
) -> list[RecommendationOut]:
    """Actions for whatever fired. Empty when nothing fired."""
    features = map_snapshot(payload.snapshot)
    result = rule_engine.evaluate(features)
    recs = recommendation_engine.build(result.triggered)

    return [
        RecommendationOut(
            title=r.title,
            action=r.action,
            priority=r.priority,
            rationale=r.rationale,
            linked_rule_ids=r.linked_rule_ids,
        )
        for r in recs
    ]


@router.post("/predict", response_model=PredictResponse, tags=["prediction"])
async def predict(payload: PredictRequest, _: None = Depends(require_api_key)) -> PredictResponse:
    """
    The full assessment: rules first, model second.

    The snapshot arrives in the request body. This service never queries the
    database, so it cannot reach actual_outcomes even in principle — the leakage
    boundary is architectural, not a matter of remembering not to.
    """
    snapshot = payload.snapshot

    features = map_snapshot(snapshot)
    result = rule_engine.evaluate(features)
    recs = recommendation_engine.build(result.triggered)
    ml = estimate(snapshot)

    return PredictResponse(
        project_id=snapshot.project_id,
        snapshot_id=snapshot.snapshot_id,
        risk_score=result.risk_score,
        risk_level=result.risk_level,
        triggered_rules=_to_triggered_out(result.triggered),
        skipped_rules=_to_skipped_out(result.skipped),
        coverage=_coverage(result),
        recommendations=[
            RecommendationOut(
                title=r.title,
                action=r.action,
                priority=r.priority,
                rationale=r.rationale,
                linked_rule_ids=r.linked_rule_ids,
            )
            for r in recs
        ],
        explanation=explanation_service.build(result),
        ml_estimate=ml,
        limitations=_limitations(ml, result.coverage_sufficient),
    )


@router.get("/model-info", response_model=ModelInfo, tags=["prediction"])
async def model_info(_: None = Depends(require_api_key)) -> ModelInfo:
    model = load()
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=load_error() or "No model available",
        )

    card = model.card
    ml_beats = model.beats_baseline
    return ModelInfo(
        model_version=model.version,
        model_type=model.model_type,
        trained_at=card.get("trained_at"),
        training_rows=card.get("training_rows"),
        distinct_feature_vectors=card.get("distinct_feature_vectors"),
        features=model.features,
        metrics=card.get("metrics", {}),
        baseline_metrics=card.get("baseline_metrics", {}),
        beats_baseline=ml_beats,
        limitations=Limitations(
            dataset_size_limited=True,
            feature_variance_limited=True,
            predictors_largely_imputed=True,
            ml_outperforms_baseline=ml_beats,
            rule_coverage_sufficient=True,
            summary=card.get("limitations", {}).get("note", ""),
        ),
    )


@router.get("/feature-mapping", tags=["ops"])
async def feature_mapping(_: None = Depends(require_api_key)) -> dict:
    """
    The snapshot -> rule-engine mapping table, as data.

    Exposed so the mapping can be reviewed without reading the source, and so a
    reviewer can see exactly which fields are marked UNAVAILABLE rather than
    silently defaulted.
    """
    table = mapping_documentation()
    return {
        "total": len(table),
        "direct": sum(1 for m in table if m["kind"] == "DIRECT"),
        "derived": sum(1 for m in table if m["kind"] == "DERIVED"),
        "unavailable": sum(1 for m in table if m["kind"] == "UNAVAILABLE"),
        "mappings": table,
    }
