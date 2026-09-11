"""
Feature mapper: the boundary where a snapshot becomes rule-engine input.

The property under test throughout is that NOTHING IS INVENTED. A missing
snapshot value must produce a missing mapped field, never a zero, a default, or
a plausible-looking substitute.
"""

import pytest

from app.schemas.prediction import FeatureSnapshot
from app.services.feature_mapper import (
    MAPPING_TABLE,
    MappingKind,
    UNAVAILABLE_FIELDS,
    map_snapshot,
    mapping_documentation,
)


class TestDirectMappings:
    def test_maps_every_supported_numeric_field(self):
        mapped = map_snapshot(FeatureSnapshot(
            land_required_ha=145.5,
            acquisition_percentage=91.0,
            affected_landowners=540,
            affected_families=480,
            court_cases_count=2,
            notification_delay_days=42.0,
            award_delay_days=148.0,
            compensation_pending=46_000_000.0,
            compensation_pending_percentage=11.17,
        ))
        assert mapped.get("land_area_required") == 145.5
        assert mapped.get("acquisition_percentage") == 91.0
        assert mapped.get("number_of_landowners") == 540
        assert mapped.get("number_of_affected_families") == 480
        assert mapped.get("pending_court_cases") == 2
        assert mapped.get("notification_delay_days") == 42.0
        assert mapped.get("award_delay_days") == 148.0
        assert mapped.get("compensation_pending_amount") == 46_000_000.0

    def test_maps_every_boolean_flag(self):
        mapped = map_snapshot(FeatureSnapshot(
            litigation_flag=True,
            land_dispute_flag=True,
            title_issue_flag=True,
            land_record_issue_flag=True,
            r_and_r_required=True,
            r_and_r_pending=True,
            row_issue=True,
            encroachment=True,
            forest_clearance_pending=True,
            possession_pending=True,
            administrative_delay=True,
        ))
        for field in (
            "has_litigation", "has_ownership_dispute", "has_land_dispute", "has_title_issue",
            "has_land_record_issue", "rehabilitation_required", "rehabilitation_pending",
            "has_row_issue", "has_encroachment", "forest_clearance_pending",
            "possession_pending", "has_administrative_delay",
        ):
            assert mapped.get(field) is True, field


class TestDerivedMappings:
    def test_compensation_completion_is_the_exact_complement(self):
        mapped = map_snapshot(FeatureSnapshot(compensation_pending_percentage=65.8667))
        assert mapped.get("compensation_completion_percentage") == pytest.approx(34.1333)

    def test_litigation_derives_from_either_source(self):
        # The database keeps flag and count in agreement, but the mapper must
        # not depend on that holding.
        assert map_snapshot(FeatureSnapshot(court_cases_count=3)).get("has_litigation") is True
        assert map_snapshot(FeatureSnapshot(litigation_flag=True)).get("has_litigation") is True
        assert map_snapshot(FeatureSnapshot()).get("has_litigation") is False

    def test_ownership_dispute_covers_both_kinds(self):
        assert map_snapshot(FeatureSnapshot(land_dispute_flag=True)).get("has_ownership_dispute")
        assert map_snapshot(FeatureSnapshot(title_issue_flag=True)).get("has_ownership_dispute")


class TestNothingIsInvented:
    def test_missing_numeric_stays_missing(self):
        mapped = map_snapshot(FeatureSnapshot())
        assert not mapped.has("acquisition_percentage")
        assert mapped.get("acquisition_percentage") is None

    def test_missing_value_is_not_defaulted_to_zero(self):
        # The whole point. A fabricated 0 is indistinguishable from a real
        # measurement of zero and would fire rules as though it were observed.
        mapped = map_snapshot(FeatureSnapshot())
        assert "acquisition_percentage" not in mapped.values
        assert "compensation_pending_percentage" not in mapped.values

    def test_missing_fields_are_recorded(self):
        mapped = map_snapshot(FeatureSnapshot())
        assert "acquisition_percentage" in mapped.missing_from_snapshot

    def test_zero_is_preserved_as_a_real_measurement(self):
        # 0% acquired is a genuine and alarming observation, not an absence.
        mapped = map_snapshot(FeatureSnapshot(acquisition_percentage=0.0))
        assert mapped.has("acquisition_percentage")
        assert mapped.get("acquisition_percentage") == 0.0


class TestUnavailableFields:
    def test_unavailable_fields_are_declared(self):
        mapped = map_snapshot(FeatureSnapshot())
        assert "land_record_completeness" in mapped.unavailable
        assert "unauthorized_occupation_cases" in mapped.unavailable

    def test_unavailable_fields_never_receive_a_value(self):
        # These are the fields the inherited engine wants as counts and
        # percentages where the snapshot has booleans. Fabricating them is the
        # exact failure this layer exists to prevent.
        mapped = map_snapshot(FeatureSnapshot(encroachment=True, land_record_issue_flag=True))
        for field in UNAVAILABLE_FIELDS:
            assert field not in mapped.values, f"{field} was invented"

    def test_boolean_is_never_promoted_to_a_count(self):
        mapped = map_snapshot(FeatureSnapshot(encroachment=True))
        assert mapped.get("has_encroachment") is True
        assert "unauthorized_occupation_cases" not in mapped.values


class TestMappingTable:
    def test_every_mapping_is_documented(self):
        for m in MAPPING_TABLE:
            assert m.target and m.source and m.note, f"undocumented mapping: {m}"

    def test_table_covers_all_three_kinds(self):
        kinds = {m.kind for m in MAPPING_TABLE}
        assert kinds == {MappingKind.DIRECT, MappingKind.DERIVED, MappingKind.UNAVAILABLE}

    def test_documentation_is_serialisable(self):
        doc = mapping_documentation()
        assert len(doc) == len(MAPPING_TABLE)
        assert all({"rule_engine_field", "kind", "snapshot_source", "note"} <= set(d) for d in doc)

    def test_no_field_is_both_available_and_unavailable(self):
        available = {m.target for m in MAPPING_TABLE if m.kind is not MappingKind.UNAVAILABLE}
        assert not (available & UNAVAILABLE_FIELDS)


class TestInvalidValues:
    @pytest.mark.parametrize("field,value", [
        ("acquisition_percentage", 150.0),
        ("acquisition_percentage", -1.0),
        ("compensation_pending_percentage", 101.0),
        ("land_required_ha", -5.0),
        ("court_cases_count", -1),
    ])
    def test_invalid_values_are_rejected_at_the_schema(self, field, value):
        # Rejected before mapping, so a bad value can never reach a rule.
        with pytest.raises(Exception):
            FeatureSnapshot(**{field: value})
