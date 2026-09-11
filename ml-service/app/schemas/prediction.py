"""Request and response contracts for the ML service."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class FeatureSnapshot(BaseModel):
    """
    The ML input record — mirrors `public.project_feature_snapshots` exactly.

    ######################################################################
    # THIS MODEL IS THE LEAKAGE BOUNDARY.                                #
    #                                                                    #
    # It has no field for actual_delay_days, delay_days_target, actual   #
    # completion dates, realised cost overruns or any other outcome, and #
    # `extra="forbid"` means a caller cannot smuggle one in — the request #
    # is rejected at the edge with 422.                                  #
    #                                                                    #
    # So the service cannot receive outcome data even by mistake. It also #
    # never queries the database, so it cannot go and fetch any.         #
    ######################################################################

    Every field is Optional because the database permits NULL for most of them.
    A missing value stays missing: it is never defaulted to 0, because a
    fabricated zero is indistinguishable from a real measurement of zero.
    """

    model_config = {"extra": "forbid"}

    snapshot_id: str | None = None
    project_id: str | None = None
    snapshot_date: str | None = None

    # Land
    land_required_ha: float | None = Field(default=None, ge=0)
    land_acquired_ha: float | None = Field(default=None, ge=0)
    acquisition_percentage: float | None = Field(default=None, ge=0, le=100)

    # Compensation
    compensation_pending: float | None = Field(default=None, ge=0)
    compensation_pending_percentage: float | None = Field(default=None, ge=0, le=100)

    # Social scale
    affected_landowners: int | None = Field(default=None, ge=0)
    affected_families: int | None = Field(default=None, ge=0)

    # Legal
    court_cases_count: int = Field(default=0, ge=0)
    litigation_flag: bool = False
    land_dispute_flag: bool = False
    title_issue_flag: bool = False
    land_record_issue_flag: bool = False

    # Risk factors
    r_and_r_required: bool = False
    r_and_r_pending: bool = False
    row_issue: bool = False
    encroachment: bool = False
    forest_clearance_pending: bool = False
    possession_pending: bool = False
    administrative_delay: bool = False

    # Elapsed time — already-observed durations, never forward-looking
    notification_delay_days: float | None = Field(default=None, ge=0)
    award_delay_days: float | None = Field(default=None, ge=0)

    @field_validator("acquisition_percentage", "compensation_pending_percentage")
    @classmethod
    def _percentage_range(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("percentage must be between 0 and 100")
        return v


class TriggeredRuleOut(BaseModel):
    """One rule that fired, with the evidence that fired it."""

    rule_id: str
    factor: str
    category: str
    severity: Severity
    contribution: float = Field(description="Points added to the 0-100 risk score")
    reason: str = Field(description="Plain-language explanation")
    evidence: dict[str, Any] = Field(
        default_factory=dict,
        description="The actual field values that triggered this rule",
    )


class SkippedRuleOut(BaseModel):
    """A rule that could not be evaluated, and why."""

    rule_id: str
    factor: str
    category: str
    missing_fields: list[str]
    reason: str


class RecommendationOut(BaseModel):
    """An action tied to a specific triggered rule — never generic advice."""

    title: str
    action: str
    priority: Severity
    rationale: str
    linked_rule_ids: list[str]


class RuleEvaluation(BaseModel):
    risk_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    triggered_rules: list[TriggeredRuleOut]
    skipped_rules: list[SkippedRuleOut]
    coverage: "RuleCoverage"


class RuleCoverage(BaseModel):
    """
    How much of the rule set could actually be evaluated.

    This exists because skipping rules deflates the score. A project with no
    data recorded would otherwise score as low-risk, which is the opposite of
    the truth — it is a project we know nothing about. The API surfaces
    coverage so a low score on thin data can never be read as reassurance.
    """

    rules_total: int
    rules_evaluated: int
    rules_skipped: int
    coverage_pct: float
    sufficient: bool = Field(
        description="False when too little of the rule set could run for the score to mean much"
    )
    missing_core_inputs: list[str] = Field(
        default_factory=list,
        description=(
            "Core rules that could not be evaluated. While this is non-empty the risk score "
            "is not a reliable assessment, regardless of how low it is."
        ),
    )


class MLEstimate(BaseModel):
    """
    The experimental delay estimate.

    `prediction_type` is never "PREDICTION" — see app/models/predict.py for why
    this model is labelled EXPERIMENTAL and what the dataset cannot support.
    """

    predicted_delay_days: float | None
    prediction_type: Literal["EXPERIMENTAL_ML_ESTIMATE", "BASELINE_MEDIAN", "UNAVAILABLE"]
    model_version: str | None
    model_type: str | None
    confidence: Literal["LOW", "NONE"]
    beats_baseline: bool = Field(
        description="Whether the trained model outperformed a median baseline in cross-validation"
    )
    note: str


class Limitations(BaseModel):
    dataset_size_limited: bool
    feature_variance_limited: bool
    predictors_largely_imputed: bool
    ml_outperforms_baseline: bool
    rule_coverage_sufficient: bool
    summary: str


class PredictResponse(BaseModel):
    """
    The complete assessment.

    Ordering is deliberate: the rule engine's output comes first because it is
    the primary decision-support signal. The ML estimate is secondary and
    labelled as such.
    """

    project_id: str | None
    snapshot_id: str | None

    # PRIMARY — deterministic, auditable, explainable
    risk_score: float
    risk_level: RiskLevel
    triggered_rules: list[TriggeredRuleOut]
    skipped_rules: list[SkippedRuleOut]
    coverage: RuleCoverage
    recommendations: list[RecommendationOut]
    explanation: str

    # SECONDARY — experimental
    ml_estimate: MLEstimate

    limitations: Limitations


class RuleRequest(BaseModel):
    model_config = {"extra": "forbid"}
    snapshot: FeatureSnapshot


class PredictRequest(BaseModel):
    model_config = {"extra": "forbid"}
    snapshot: FeatureSnapshot


class ModelInfo(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_version: str | None
    model_type: str | None
    trained_at: str | None
    training_rows: int | None
    distinct_feature_vectors: int | None
    features: list[str]
    metrics: dict[str, Any]
    baseline_metrics: dict[str, Any]
    beats_baseline: bool
    limitations: Limitations


RuleEvaluation.model_rebuild()
