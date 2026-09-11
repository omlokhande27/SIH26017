"""
Recommendations — derived from what actually fired, never from a template.

Every recommendation is keyed to a rule id. If a rule did not trigger, its
recommendation is not emitted. There is no fallback list of generic advice,
because "improve stakeholder engagement" attached to a project with no recorded
stakeholder problem is noise that teaches officials to ignore the tool.

Priority is inherited from the severity of the rule that produced it, so the
action list is ordered by the same judgement that produced the score.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.prediction import Severity
from app.services.rule_engine import TriggeredRule


@dataclass(frozen=True)
class Recommendation:
    title: str
    action: str
    priority: Severity
    rationale: str
    linked_rule_ids: list[str]


# One entry per rule that can fire. Keyed by rule_id so the link between a
# finding and its action is explicit and testable.
_PLAYBOOK: dict[str, tuple[str, str]] = {
    "LAND_PROGRESS": (
        "Prioritise acquisition for critical project sections",
        "Identify the alignment segments blocking construction start and concentrate "
        "acquisition effort there rather than proceeding parcel-by-parcel. Publish a "
        "section-wise acquisition schedule with named owners.",
    ),
    "COMP_PENDING": (
        "Accelerate compensation approval and disbursement",
        "Convene a disbursal review, separate verified claims from disputed ones, and "
        "clear the verified backlog in tranches. Disputed claims should move to the "
        "grievance process rather than holding up the rest.",
    ),
    "LEGAL_CASES": (
        "Establish a legal case monitoring and resolution workflow",
        "Assign a nodal legal officer, maintain a case-wise tracker with next hearing "
        "dates, and seek early hearing or out-of-court settlement where the dispute is "
        "over quantum rather than entitlement.",
    ),
    "OWN_DISPUTE": (
        "Refer the ownership dispute to the competent authority",
        "Compile the survey record, mutation history and claimant submissions, and refer "
        "the dispute for adjudication. Ring-fence the disputed parcels so the remainder "
        "of acquisition can proceed.",
    ),
    "OWN_TITLE": (
        "Resolve the title dispute before award",
        "Commission a title verification through the revenue department. An award passed "
        "on contested title tends to produce litigation later, which costs more time than "
        "resolving it now.",
    ),
    "DOC_RECORDS": (
        "Reconcile land records with field measurement",
        "Commission a joint survey with the revenue department to reconcile survey records "
        "against measured boundaries, and initiate mutation for the discrepancies found.",
    ),
    "RR_PENDING": (
        "Review and clear pending rehabilitation and resettlement",
        "Audit outstanding R&R entitlements family by family, confirm resettlement site "
        "readiness, and publish an allotment schedule. Possession should not be pursued "
        "ahead of resettlement.",
    ),
    "ROW_ISSUE": (
        "Coordinate with affected authorities and landowners on right of way",
        "Convene the utility owners and affected landowners together, agree a shifting or "
        "realignment plan, and record it. RoW issues resolved in isolation tend to "
        "resurface at construction.",
    ),
    "ENCROACH": (
        "Initiate the statutory encroachment removal process",
        "Conduct a joint demarcation survey, issue statutory notices, and schedule removal "
        "with the district administration. Where encroachers are eligible for R&R, route "
        "them through that process rather than enforcement alone.",
    ),
    "FOREST_CLEAR": (
        "Escalate the pending forest or environmental clearance",
        "Assign a nodal officer to pursue the diversion proposal weekly with the competent "
        "authority, and confirm compensatory afforestation land has been identified — that "
        "is the usual reason such proposals stall.",
    ),
    "POSSESSION": (
        "Complete handover of physical possession",
        "Identify why possession has not followed the award — resettlement, standing crop, "
        "or resistance — and address that specific cause. An award without possession "
        "delivers nothing to the project.",
    ),
    "ADMIN_DELAY": (
        "Clear the internal approval bottleneck",
        "Trace the file to the pending desk, set a decision deadline with the competent "
        "authority, and escalate through the project review mechanism if it is not met.",
    ),
    "TL_NOTIFICATION": (
        "Review the pre-notification process for this project",
        "Examine what delayed the statutory notification and whether the same cause still "
        "affects downstream steps. A late start compounds through every subsequent stage.",
    ),
    "TL_AWARD": (
        "Expedite the pending award",
        "Review objections and valuation disputes holding up the award, and convene the "
        "competent authority to pass it on the undisputed portion where the statute permits.",
    ),
    "SCALE_FAMILIES": (
        "Scale up grievance handling for the affected population",
        "A displacement footprint this size needs dedicated grievance capacity. Establish "
        "a field-level grievance cell with published timelines rather than routing "
        "everything through the project office.",
    ),
}


def build(triggered: list[TriggeredRule]) -> list[Recommendation]:
    """
    Produce one recommendation per triggered rule, ordered by contribution.

    Nothing is emitted for a rule that did not fire, and nothing is emitted when
    no rule fired at all. An empty list is the honest answer to "this project
    shows no recorded risk factors".
    """
    recommendations: list[Recommendation] = []

    for rule in sorted(triggered, key=lambda t: t.contribution, reverse=True):
        entry = _PLAYBOOK.get(rule.rule_id)
        if entry is None:
            # A rule with no playbook entry is a gap to fix, not something to
            # paper over with generic advice.
            continue
        title, action = entry
        recommendations.append(
            Recommendation(
                title=title,
                action=action,
                priority=rule.severity,
                # The rationale quotes the evidence, so the reader can see what
                # prompted the action rather than taking it on trust.
                rationale=rule.reason,
                linked_rule_ids=[rule.rule_id],
            )
        )

    return recommendations


def playbook_coverage() -> dict[str, bool]:
    """Which rules have a recommendation. Used by a test to keep them in step."""
    from app.services.rule_engine import RULES

    return {r.rule_id: r.rule_id in _PLAYBOOK for r in RULES}
