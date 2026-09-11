import os
import pytest
from fastapi.testclient import TestClient

TEST_KEY = "test-api-key-not-a-real-secret"


@pytest.fixture(scope="session", autouse=True)
def _configure_env():
    os.environ["ML_SERVICE_API_KEY"] = TEST_KEY
    os.environ["ENVIRONMENT"] = "test"
    from app.config import get_settings
    get_settings.cache_clear()
    yield


@pytest.fixture
def client(_configure_env):
    from app.main import app
    return TestClient(app)


@pytest.fixture
def auth_headers():
    return {"X-API-Key": TEST_KEY}


@pytest.fixture
def low_risk_snapshot() -> dict:
    """A project in good shape: nearly acquired, paid up, nothing flagged."""
    return {
        "project_id": "11111111-1111-4111-8111-111111111111",
        "land_required_ha": 100.0,
        "land_acquired_ha": 98.0,
        "acquisition_percentage": 98.0,
        "compensation_pending": 1000.0,
        "compensation_pending_percentage": 2.0,
        "affected_landowners": 50,
        "affected_families": 40,
        "court_cases_count": 0,
        "notification_delay_days": 30.0,
        "award_delay_days": 60.0,
    }


@pytest.fixture
def critical_risk_snapshot() -> dict:
    """Nearly everything wrong at once."""
    return {
        "project_id": "22222222-2222-4222-8222-222222222222",
        "land_required_ha": 900.0,
        "land_acquired_ha": 90.0,
        "acquisition_percentage": 10.0,
        "compensation_pending": 1_200_000_000.0,
        "compensation_pending_percentage": 85.0,
        "affected_landowners": 2000,
        "affected_families": 1800,
        "court_cases_count": 6,
        "litigation_flag": True,
        "land_dispute_flag": True,
        "title_issue_flag": True,
        "land_record_issue_flag": True,
        "r_and_r_required": True,
        "r_and_r_pending": True,
        "row_issue": True,
        "encroachment": True,
        "forest_clearance_pending": True,
        "possession_pending": True,
        "administrative_delay": True,
        "notification_delay_days": 500.0,
        "award_delay_days": 900.0,
    }
