"""
Rule-based early-warning engine — the PRIMARY decision-support signal.

WHY RULES LEAD, AND THE MODEL FOLLOWS
-------------------------------------
The audited dataset has 130 rows but only 22 distinct feature vectors, with 108
of them (83%) identical and their real delays spanning 12 to 2070 days. No
algorithm can separate those rows; the best any model can do for 83% of the
data is emit the median. A model trained on that cannot carry a decision.

Domain rules can. They are deterministic, auditable, explain themselves, and
encode knowledge the dataset does not contain. So the rules are the product and
the model is an experiment running alongside it.

RELATIONSHIP TO THE INHERITED risk_rules.py
-------------------------------------------
The thresholds, mutually-exclusive banding and category weighting here follow
that file's design, which was reviewed before anything was written. It is not
imported, because it reads 47 project fields and the deployed snapshot supplies
21 — a difference in kind, not just in name (see feature_mapper.py). Importing
it would have meant inventing values for 30-odd fields.

Instead each rule DECLARES the mapped fields it needs. Rules whose inputs are
unavailable are skipped and reported, never evaluated against a guess.

NO DOUBLE COUNTING
------------------
Rules within a band are mutually exclusive: acquisition progress fires at most
one of its four severity levels, so a project at 15% is penalised once, not
once for "under 75%", again for "under 50%", and again for "under 25%".
Enforced structurally by `banded_rule`, not by discipline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Sequence

from app.schemas.prediction import RiskLevel, Severity
from app.services.feature_mapper import MappedFeatures

# Every project starts here. A land acquisition with nothing recorded against it
# is not risk-free; it is unassessed. Matches risk_rules.py's BASE_PROBABILITY.
BASE_SCORE = 15.0

# Never report certainty. 95 leaves room for the unmeasured.
SCORE_CAP = 95.0

RISK_BANDS: tuple[tuple[float, float, RiskLevel], ...] = (
    (0.0, 30.0, RiskLevel.LOW),
    (30.0, 60.0, RiskLevel.MEDIUM),
    (60.0, 80.0, RiskLevel.HIGH),
    (80.0, 100.1, RiskLevel.CRITICAL),
)

# Below this, a low score says more about missing data than about low risk.
MIN_COVERAGE_PCT = 60.0

# ---------------------------------------------------------------------------
# CORE RULES — the ones whose absence invalidates the whole assessment.
#
# Most rules read booleans, which are NOT NULL in the schema. A `false` there
# means "no such risk factor has been recorded", so those rules always
# "evaluate" successfully and only ever ADD risk. That makes raw rule coverage
# a bad measure of whether we actually know anything: a project with nothing
# entered at all evaluated 10 of 15 rules, found nothing, and scored LOW with
# 67% coverage — reading as reassuring when the truth was that no one had
# recorded any data.
#
# These two rules are different. They read graded measurements that can move
# the score in either direction, and they are the substance of an acquisition's
# status. Without them there is no assessment worth the name, whatever the
# other rules found.
# ---------------------------------------------------------------------------
CORE_RULE_IDS: frozenset[str] = frozenset({"LAND_PROGRESS", "COMP_PENDING"})


@dataclass(frozen=True)
class TriggeredRule:
    rule_id: str
    factor: str
    category: str
    severity: Severity
    contribution: float
    reason: str
    evidence: dict[str, Any]


@dataclass(frozen=True)
class SkippedRule:
    rule_id: str
    factor: str
    category: str
    missing_fields: list[str]
    reason: str


@dataclass(frozen=True)
class Rule:
    rule_id: str
    factor: str
    category: str
    requires: tuple[str, ...]
    evaluate: Callable[[MappedFeatures], TriggeredRule | None]


@dataclass
class RiskResult:
    risk_score: float
    risk_level: RiskLevel
    triggered: list[TriggeredRule]
    skipped: list[SkippedRule]
    rules_total: int
    coverage_pct: float
    coverage_sufficient: bool
    missing_core_inputs: list[str]

    @property
    def rules_skipped_count(self) -> int:
        return len(self.skipped)


def _band(score: float) -> RiskLevel:
    for lower, upper, level in RISK_BANDS:
        if lower <= score < upper:
            return level
    return RiskLevel.CRITICAL


def banded_rule(
    rule_id: str,
    factor: str,
    category: str,
    requires: tuple[str, ...],
    value_of: Callable[[MappedFeatures], float],
    bands: Sequence[tuple[float, float, Severity, float, str]],
    ascending: bool = True,
) -> Rule:
    """
    Build a rule whose severity bands are MUTUALLY EXCLUSIVE.

    `bands` are (low, high, severity, contribution, reason_template) and are
    checked in order; the first match wins and evaluation stops. That is what
    makes double counting structurally impossible — the same underlying fact
    cannot add points twice.

    `ascending` describes the metric's direction: True when a HIGHER value is
    worse (pending percentage), False when a LOWER value is worse (acquisition
    progress). It only affects which end the bands are read from; the
    exclusivity is the same either way.
    """

    def _evaluate(features: MappedFeatures) -> TriggeredRule | None:
        value = value_of(features)
        for low, high, severity, contribution, template in bands:
            if low <= value < high:
                return TriggeredRule(
                    rule_id=rule_id,
                    factor=factor,
                    category=category,
                    severity=severity,
                    contribution=contribution,
                    reason=template.format(value=_fmt(value)),
                    evidence={name: features.get(name) for name in requires},
                )
        return None

    _ = ascending  # documented above; bands already encode direction
    return Rule(rule_id, factor, category, requires, _evaluate)


def flag_rule(
    rule_id: str,
    factor: str,
    category: str,
    requires: tuple[str, ...],
    predicate: Callable[[MappedFeatures], bool],
    severity: Severity,
    contribution: float,
    reason: str,
) -> Rule:
    """A rule that fires on a boolean condition being present."""

    def _evaluate(features: MappedFeatures) -> TriggeredRule | None:
        if not predicate(features):
            return None
        return TriggeredRule(
            rule_id=rule_id,
            factor=factor,
            category=category,
            severity=severity,
            contribution=contribution,
            reason=reason,
            evidence={name: features.get(name) for name in requires},
        )

    return Rule(rule_id, factor, category, requires, _evaluate)


def _fmt(value: float) -> str:
    return f"{value:.0f}" if float(value).is_integer() else f"{value:.1f}"


# ---------------------------------------------------------------------------
# THE RULE SET — 13 categories, matching the inherited engine's taxonomy,
# restricted to what the snapshot can actually support.
# ---------------------------------------------------------------------------
RULES: tuple[Rule, ...] = (
    # 1. LAND ACQUISITION PROGRESS -----------------------------------------
    banded_rule(
        "LAND_PROGRESS", "Land Acquisition Progress", "LAND",
        ("acquisition_percentage",),
        lambda f: float(f.get("acquisition_percentage")),
        bands=(
            (0.0, 25.0, Severity.CRITICAL, 25.0,
             "Only {value}% of required land has been acquired — acquisition has barely begun"),
            (25.0, 50.0, Severity.HIGH, 18.0,
             "Only {value}% of required land has been acquired"),
            (50.0, 75.0, Severity.MEDIUM, 10.0,
             "{value}% of required land acquired — a substantial share remains"),
            (75.0, 95.0, Severity.LOW, 4.0,
             "{value}% of required land acquired — nearing completion"),
        ),
        ascending=False,
    ),

    # 2. COMPENSATION -------------------------------------------------------
    banded_rule(
        "COMP_PENDING", "Pending Compensation", "COMPENSATION",
        ("compensation_pending_percentage",),
        lambda f: float(f.get("compensation_pending_percentage")),
        bands=(
            (0.0, 10.0, Severity.LOW, 0.0, "{value}% of compensation outstanding"),
            (10.0, 30.0, Severity.LOW, 5.0, "{value}% of compensation outstanding"),
            (30.0, 60.0, Severity.MEDIUM, 12.0, "{value}% of compensation outstanding"),
            (60.0, 100.1, Severity.CRITICAL, 22.0,
             "{value}% of compensation is unpaid — the dominant financial obstacle"),
        ),
    ),

    # 3. LEGAL / LITIGATION -------------------------------------------------
    banded_rule(
        "LEGAL_CASES", "Active Court Cases", "LEGAL",
        ("pending_court_cases",),
        lambda f: float(f.get("pending_court_cases")),
        bands=(
            (1.0, 2.0, Severity.HIGH, 15.0, "{value} active court case is contesting the project"),
            (2.0, 5.0, Severity.HIGH, 20.0, "{value} active court cases are contesting the project"),
            (5.0, 1e9, Severity.CRITICAL, 26.0,
             "{value} active court cases — sustained legal obstruction"),
        ),
    ),

    # 4. OWNERSHIP DISPUTES -------------------------------------------------
    flag_rule(
        "OWN_DISPUTE", "Land Ownership Dispute", "OWNERSHIP",
        ("has_land_dispute",),
        lambda f: bool(f.get("has_land_dispute")),
        Severity.HIGH, 12.0,
        "A land ownership dispute is open against this project",
    ),
    flag_rule(
        "OWN_TITLE", "Title Dispute", "OWNERSHIP",
        ("has_title_issue",),
        lambda f: bool(f.get("has_title_issue")),
        Severity.HIGH, 12.0,
        "A title dispute is unresolved — ownership cannot be conclusively established",
    ),

    # 5. LAND RECORDS -------------------------------------------------------
    flag_rule(
        "DOC_RECORDS", "Land Record Problems", "DOCUMENTATION",
        ("has_land_record_issue",),
        lambda f: bool(f.get("has_land_record_issue")),
        Severity.MEDIUM, 9.0,
        "Land records are incomplete or inconsistent with field measurement",
    ),

    # 6. REHABILITATION AND RESETTLEMENT ------------------------------------
    flag_rule(
        "RR_PENDING", "Rehabilitation and Resettlement", "RR",
        ("rehabilitation_pending",),
        lambda f: bool(f.get("rehabilitation_pending")),
        Severity.CRITICAL, 18.0,
        "R&R obligations are outstanding — displaced families are not yet resettled",
    ),

    # 7. RIGHT OF WAY -------------------------------------------------------
    flag_rule(
        "ROW_ISSUE", "Right of Way", "ROW",
        ("has_row_issue",),
        lambda f: bool(f.get("has_row_issue")),
        Severity.HIGH, 12.0,
        "Right of way is not secured or is being contested",
    ),

    # 8. ENCROACHMENT -------------------------------------------------------
    flag_rule(
        "ENCROACH", "Encroachment", "ENCROACHMENT",
        ("has_encroachment",),
        lambda f: bool(f.get("has_encroachment")),
        Severity.HIGH, 12.0,
        "Unauthorised occupation of project land has been recorded",
    ),

    # 9. ENVIRONMENTAL / FOREST CLEARANCE -----------------------------------
    flag_rule(
        "FOREST_CLEAR", "Forest / Environmental Clearance", "ENVIRONMENT",
        ("forest_clearance_pending",),
        lambda f: bool(f.get("forest_clearance_pending")),
        Severity.CRITICAL, 16.0,
        "Statutory forest or environmental clearance is still outstanding",
    ),

    # 10. POSSESSION --------------------------------------------------------
    flag_rule(
        "POSSESSION", "Possession Pending", "POSSESSION",
        ("possession_pending",),
        lambda f: bool(f.get("possession_pending")),
        Severity.HIGH, 12.0,
        "An award has been passed but physical possession has not been handed over",
    ),

    # 11. ADMINISTRATIVE ----------------------------------------------------
    flag_rule(
        "ADMIN_DELAY", "Administrative Delay", "ADMIN",
        ("has_administrative_delay",),
        lambda f: bool(f.get("has_administrative_delay")),
        Severity.MEDIUM, 9.0,
        "An internal approval or processing bottleneck has been reported",
    ),

    # 12. TIMELINE — notification ------------------------------------------
    banded_rule(
        "TL_NOTIFICATION", "Notification Delay", "TIMELINE",
        ("notification_delay_days",),
        lambda f: float(f.get("notification_delay_days")),
        bands=(
            (180.0, 365.0, Severity.MEDIUM, 8.0,
             "Statutory notification came {value} days after the planned project start"),
            (365.0, 1e9, Severity.HIGH, 14.0,
             "Statutory notification came {value} days after the planned project start"),
        ),
    ),

    # 13. TIMELINE — award --------------------------------------------------
    banded_rule(
        "TL_AWARD", "Award Delay", "TIMELINE",
        ("award_delay_days",),
        lambda f: float(f.get("award_delay_days")),
        bands=(
            (180.0, 365.0, Severity.MEDIUM, 8.0,
             "The award has been outstanding {value} days since notification"),
            (365.0, 730.0, Severity.HIGH, 14.0,
             "The award has been outstanding {value} days since notification"),
            (730.0, 1e9, Severity.CRITICAL, 20.0,
             "The award has been outstanding {value} days since notification — "
             "well beyond the statutory expectation"),
        ),
    ),

    # 14. SCALE OF SOCIAL IMPACT -------------------------------------------
    banded_rule(
        "SCALE_FAMILIES", "Scale of Displacement", "COMPLEXITY",
        ("number_of_affected_families",),
        lambda f: float(f.get("number_of_affected_families")),
        bands=(
            (500.0, 1500.0, Severity.MEDIUM, 7.0,
             "{value} families are affected — coordination load is substantial"),
            (1500.0, 1e9, Severity.HIGH, 11.0,
             "{value} families are affected — very large displacement footprint"),
        ),
    ),
)

RULE_COUNT = len(RULES)
CATEGORIES = sorted({r.category for r in RULES})


def evaluate(features: MappedFeatures) -> RiskResult:
    """
    Run every rule the mapped features can support.

    Rules whose inputs are missing are SKIPPED and reported. They are never
    evaluated against a substituted value, because a rule fed a guess produces
    a confident finding about something nobody measured.
    """
    triggered: list[TriggeredRule] = []
    skipped: list[SkippedRule] = []

    for rule in RULES:
        missing = features.missing(*rule.requires)
        if missing:
            skipped.append(
                SkippedRule(
                    rule_id=rule.rule_id,
                    factor=rule.factor,
                    category=rule.category,
                    missing_fields=missing,
                    reason=(
                        f"Cannot evaluate: {', '.join(missing)} "
                        f"{'is' if len(missing) == 1 else 'are'} not recorded for this project."
                    ),
                )
            )
            continue

        result = rule.evaluate(features)
        # A rule that fired with zero contribution is informational only — the
        # condition is present but not severe enough to move the score.
        if result is not None and result.contribution > 0:
            triggered.append(result)

    raw = BASE_SCORE + sum(t.contribution for t in triggered)
    score = round(min(raw, SCORE_CAP), 1)

    evaluated = RULE_COUNT - len(skipped)
    coverage = round(evaluated / RULE_COUNT * 100, 1) if RULE_COUNT else 0.0

    skipped_ids = {s.rule_id for s in skipped}
    missing_core = sorted(CORE_RULE_IDS & skipped_ids)

    # Sufficiency needs BOTH: enough of the rule set ran, AND the core
    # measurements were present. The second condition is what stops an empty
    # project from passing on the strength of boolean rules that found nothing
    # because nothing had been entered.
    sufficient = coverage >= MIN_COVERAGE_PCT and not missing_core

    return RiskResult(
        risk_score=score,
        risk_level=_band(score),
        triggered=sorted(triggered, key=lambda t: t.contribution, reverse=True),
        skipped=skipped,
        rules_total=RULE_COUNT,
        coverage_pct=coverage,
        coverage_sufficient=sufficient,
        missing_core_inputs=missing_core,
    )
