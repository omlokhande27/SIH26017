"""
Feature mapping layer: database snapshot -> rule engine inputs.

######################################################################
# WHY THIS LAYER EXISTS, AND WHY IT IS NOT A RENAME TABLE            #
#                                                                    #
# The inherited rule engine (risk_rules.py, 1209 lines, 13 rule      #
# categories) reads 47 project fields. The deployed snapshot schema  #
# has 21. Exactly ONE name matches: notification_delay_days.         #
#                                                                    #
# The mismatch is not cosmetic, it is a difference in KIND. The rule #
# engine expects counts and percentages:                             #
#                                                                    #
#     ownership_litigation_cases        an integer count             #
#     land_record_completeness          a 0-100 percentage           #
#     unauthorized_occupation_cases     an integer count             #
#     resettlement_site_readiness_pct   a 0-100 percentage           #
#                                                                    #
# The snapshot records BOOLEANS for the same concepts:               #
#                                                                    #
#     title_issue_flag                  true / false                 #
#     land_record_issue_flag            true / false                 #
#     encroachment                      true / false                 #
#     r_and_r_pending                   true / false                 #
#                                                                    #
# Turning `encroachment = true` into `unauthorized_occupation_cases  #
# = 5` would be inventing a measurement. Turning                     #
# `land_record_issue_flag = true` into `land_record_completeness =   #
# 40` would be worse: a fabricated number that reads as surveyed     #
# fact and flows straight into a weighted score.                     #
#                                                                    #
# So this layer maps what genuinely maps, marks everything else      #
# UNAVAILABLE, and the rule engine skips rules it cannot evaluate.   #
# Nothing is imputed here. Ever.                                     #
######################################################################

Every mapping below is one of three kinds, and the kind is recorded:

  DIRECT      the same measurement under a different name
  DERIVED     computed from snapshot fields by an exact, stated formula
  UNAVAILABLE the snapshot cannot support it; dependent rules are skipped
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.schemas.prediction import FeatureSnapshot


class MappingKind(str, Enum):
    DIRECT = "DIRECT"
    DERIVED = "DERIVED"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class MappingRule:
    """One documented mapping from the snapshot to a rule-engine input."""

    target: str
    kind: MappingKind
    source: str
    note: str


# ---------------------------------------------------------------------------
# THE MAPPING TABLE — the authoritative record of what maps and what does not
# ---------------------------------------------------------------------------
MAPPING_TABLE: tuple[MappingRule, ...] = (
    # --- DIRECT -------------------------------------------------------------
    MappingRule("land_area_required", MappingKind.DIRECT, "land_required_ha",
                "Same quantity, hectares."),
    MappingRule("acquisition_percentage", MappingKind.DIRECT, "acquisition_percentage",
                "Generated column, copied from the database."),
    MappingRule("number_of_landowners", MappingKind.DIRECT, "affected_landowners",
                "Same count."),
    MappingRule("number_of_affected_families", MappingKind.DIRECT, "affected_families",
                "Same count."),
    MappingRule("pending_court_cases", MappingKind.DIRECT, "court_cases_count",
                "Count of ACTIVE court cases, already scoped by the backend."),
    MappingRule("notification_delay_days", MappingKind.DIRECT, "notification_delay_days",
                "The one field whose name matches. Days from planned start to notification."),
    MappingRule("award_delay_days", MappingKind.DIRECT, "award_delay_days",
                "Days from notification to award, or to now while outstanding."),
    MappingRule("compensation_pending_amount", MappingKind.DIRECT, "compensation_pending",
                "Generated column, INR."),
    MappingRule("compensation_pending_percentage", MappingKind.DIRECT,
                "compensation_pending_percentage", "Generated column."),

    # --- DERIVED ------------------------------------------------------------
    MappingRule("compensation_completion_percentage", MappingKind.DERIVED,
                "100 - compensation_pending_percentage",
                "Exact complement; no estimation involved."),
    MappingRule("has_litigation", MappingKind.DERIVED, "litigation_flag OR court_cases_count > 0",
                "Boolean presence, not a count. The database keeps these two in agreement."),
    MappingRule("has_ownership_dispute", MappingKind.DERIVED,
                "land_dispute_flag OR title_issue_flag",
                "Either kind of ownership contest. Presence only."),
    MappingRule("has_land_record_issue", MappingKind.DERIVED, "land_record_issue_flag",
                "Presence only — the snapshot has no completeness percentage."),
    MappingRule("rehabilitation_required", MappingKind.DERIVED, "r_and_r_required", "Presence."),
    MappingRule("rehabilitation_pending", MappingKind.DERIVED, "r_and_r_pending", "Presence."),
    MappingRule("has_row_issue", MappingKind.DERIVED, "row_issue", "Presence."),
    MappingRule("has_encroachment", MappingKind.DERIVED, "encroachment", "Presence."),
    MappingRule("forest_clearance_pending", MappingKind.DERIVED, "forest_clearance_pending",
                "Presence."),
    MappingRule("possession_pending", MappingKind.DERIVED, "possession_pending", "Presence."),
    MappingRule("has_administrative_delay", MappingKind.DERIVED, "administrative_delay",
                "Presence."),

    # --- UNAVAILABLE --------------------------------------------------------
    # Each of these is a field the inherited rule engine reads and the snapshot
    # cannot supply. Rules depending on them are skipped, never guessed.
    MappingRule("ownership_litigation_cases", MappingKind.UNAVAILABLE, "—",
                "Snapshot records a boolean, not a case count. Would require inventing a number."),
    MappingRule("land_record_completeness", MappingKind.UNAVAILABLE, "—",
                "Snapshot has a boolean flag, not a 0-100 completeness survey."),
    MappingRule("unauthorized_occupation_cases", MappingKind.UNAVAILABLE, "—",
                "Snapshot records encroachment as a boolean, not a case count."),
    MappingRule("resettlement_site_readiness_percentage", MappingKind.UNAVAILABLE, "—",
                "Not captured anywhere in the schema."),
    MappingRule("rehabilitation_completion_percentage", MappingKind.UNAVAILABLE, "—",
                "Not captured; only required/pending booleans exist."),
    MappingRule("survey_completion_percentage", MappingKind.UNAVAILABLE, "—",
                "Not captured. Distinct from acquisition_percentage and must not be conflated."),
    MappingRule("possession_percentage", MappingKind.UNAVAILABLE, "—",
                "Not captured. possession_pending is a boolean, not a proportion."),
    MappingRule("number_of_affected_villages", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("number_of_land_parcels", MappingKind.UNAVAILABLE, "—",
                "Held on land_acquisition but deliberately not copied into the snapshot."),
    MappingRule("stakeholder_response_rate", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("grievance_resolution_rate", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("district_historical_delay_rate", MappingKind.UNAVAILABLE, "—",
                "Would need an aggregate over historical outcomes. Computing it at prediction "
                "time from outcomes of other projects is a leakage risk and is out of scope."),
    MappingRule("project_type_historical_delay_rate", MappingKind.UNAVAILABLE, "—",
                "Same leakage concern as district_historical_delay_rate."),
    MappingRule("number_of_departments_involved", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("number_of_approvals_pending", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("documents_required", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("missing_documents", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("environmental_clearance_status", MappingKind.UNAVAILABLE, "—",
                "Only the forest-clearance boolean exists."),
    MappingRule("is_interstate_project", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("land_use_type", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("planned_acquisition_duration", MappingKind.UNAVAILABLE, "—", "Not captured."),
    MappingRule("total_delay_accumulated_so_far", MappingKind.UNAVAILABLE, "—",
                "Partially expressible via award_delay_days, but not equivalent; not mapped "
                "rather than approximated."),
    MappingRule("landowner_objections", MappingKind.UNAVAILABLE, "—",
                "LANDOWNER_OBJECTION exists in risk_factor_types but is not one of the 21 "
                "snapshot columns, so it cannot reach this service."),
    MappingRule("landowner_agitation", MappingKind.UNAVAILABLE, "—",
                "Not captured in the snapshot schema."),
)

DIRECT_OR_DERIVED = {
    m.target for m in MAPPING_TABLE if m.kind is not MappingKind.UNAVAILABLE
}
UNAVAILABLE_FIELDS = {m.target for m in MAPPING_TABLE if m.kind is MappingKind.UNAVAILABLE}


@dataclass
class MappedFeatures:
    """
    Rule-engine inputs, with availability tracked per field.

    `values` holds only fields that genuinely have a value. A field that is
    absent from `values` is absent because the data is missing — the dataclass
    provides no defaults, precisely so a caller cannot mistake a default for a
    measurement.
    """

    values: dict[str, Any] = field(default_factory=dict)
    unavailable: set[str] = field(default_factory=set)
    missing_from_snapshot: set[str] = field(default_factory=set)

    def has(self, *names: str) -> bool:
        """True only when every named field carries a real value."""
        return all(n in self.values and self.values[n] is not None for n in names)

    def get(self, name: str) -> Any:
        return self.values.get(name)

    def missing(self, *names: str) -> list[str]:
        return [n for n in names if not self.has(n)]


def map_snapshot(snapshot: FeatureSnapshot) -> MappedFeatures:
    """
    Translate a database snapshot into rule-engine inputs.

    Nothing is imputed. A NULL in the snapshot produces an absent field, which
    causes dependent rules to be skipped and reported as skipped.
    """
    mapped = MappedFeatures(unavailable=set(UNAVAILABLE_FIELDS))
    v = mapped.values

    def put(name: str, value: Any) -> None:
        if value is None:
            mapped.missing_from_snapshot.add(name)
        else:
            v[name] = value

    # DIRECT
    put("land_area_required", snapshot.land_required_ha)
    put("acquisition_percentage", snapshot.acquisition_percentage)
    put("number_of_landowners", snapshot.affected_landowners)
    put("number_of_affected_families", snapshot.affected_families)
    put("pending_court_cases", snapshot.court_cases_count)
    put("notification_delay_days", snapshot.notification_delay_days)
    put("award_delay_days", snapshot.award_delay_days)
    put("compensation_pending_amount", snapshot.compensation_pending)
    put("compensation_pending_percentage", snapshot.compensation_pending_percentage)

    # DERIVED — exact formulas only
    if snapshot.compensation_pending_percentage is not None:
        v["compensation_completion_percentage"] = round(
            100.0 - snapshot.compensation_pending_percentage, 4
        )
    else:
        mapped.missing_from_snapshot.add("compensation_completion_percentage")

    # Booleans are NOT NULL in the schema, so these are always available.
    v["has_litigation"] = bool(snapshot.litigation_flag or snapshot.court_cases_count > 0)
    v["has_ownership_dispute"] = bool(snapshot.land_dispute_flag or snapshot.title_issue_flag)
    v["has_land_dispute"] = bool(snapshot.land_dispute_flag)
    v["has_title_issue"] = bool(snapshot.title_issue_flag)
    v["has_land_record_issue"] = bool(snapshot.land_record_issue_flag)
    v["rehabilitation_required"] = bool(snapshot.r_and_r_required)
    v["rehabilitation_pending"] = bool(snapshot.r_and_r_pending)
    v["has_row_issue"] = bool(snapshot.row_issue)
    v["has_encroachment"] = bool(snapshot.encroachment)
    v["forest_clearance_pending"] = bool(snapshot.forest_clearance_pending)
    v["possession_pending"] = bool(snapshot.possession_pending)
    v["has_administrative_delay"] = bool(snapshot.administrative_delay)

    return mapped


def mapping_documentation() -> list[dict[str, str]]:
    """The mapping table as data, for /model-info and the docs."""
    return [
        {"rule_engine_field": m.target, "kind": m.kind.value, "snapshot_source": m.source,
         "note": m.note}
        for m in MAPPING_TABLE
    ]
