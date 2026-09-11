"""
Plain-language explanation of an assessment.

Assembled deterministically from the triggered rules — no language model is
involved, and none should be: this text states what the system found and why,
and it must be reproducible and defensible. An LLM layer may rephrase this
later (Phase 6), but it cannot be the source of the facts.
"""

from __future__ import annotations

from app.schemas.prediction import RiskLevel
from app.services.rule_engine import RiskResult

_LEVEL_OPENING = {
    RiskLevel.LOW: "This project shows a low recorded risk of land-acquisition delay",
    RiskLevel.MEDIUM: "This project shows a moderate risk of land-acquisition delay",
    RiskLevel.HIGH: "This project is at high risk of land-acquisition delay",
    RiskLevel.CRITICAL: "This project is at critical risk of land-acquisition delay",
}


def build(result: RiskResult) -> str:
    parts: list[str] = [
        f"{_LEVEL_OPENING[result.risk_level]} (risk score {result.risk_score:.0f}/100)."
    ]

    if not result.triggered:
        parts.append(
            "No early-warning factors were triggered by the recorded data. "
            "Note that this reflects what has been entered, not an independent inspection."
        )
    else:
        top = result.triggered[:3]
        drivers = "; ".join(f"{t.factor.lower()} ({t.reason.rstrip('.')})" for t in top)
        parts.append(f"The main contributors are: {drivers}.")

        if len(result.triggered) > 3:
            parts.append(
                f"A further {len(result.triggered) - 3} factor(s) also contributed to the score."
            )

    # Coverage is stated whenever it is incomplete, because a low score on thin
    # data is not the same as a low score on complete data — and the difference
    # is invisible unless it is said out loud.
    if not result.coverage_sufficient:
        detail = (
            f"only {result.coverage_pct:.0f}% of the rule set could be evaluated "
            f"({result.rules_skipped_count} of {result.rules_total} rules skipped)"
        )
        if result.missing_core_inputs:
            names = {
                "LAND_PROGRESS": "land acquisition progress",
                "COMP_PENDING": "compensation status",
            }
            missing = ", ".join(names.get(r, r) for r in result.missing_core_inputs)
            detail = f"{missing} {'is' if len(result.missing_core_inputs) == 1 else 'are'} not recorded, and {detail}"

        parts.append(
            f"IMPORTANT: this assessment is INCOMPLETE — {detail}. A low score here reflects "
            "missing records as much as low risk, and must not be read as reassurance. "
            "Complete the project data before relying on it."
        )
    elif result.skipped:
        parts.append(
            f"{len(result.skipped)} rule(s) could not be evaluated because the underlying "
            "data is not recorded; they are listed separately."
        )

    return " ".join(parts)
