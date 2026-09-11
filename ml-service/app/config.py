"""Service configuration. Secrets come from the environment, never from source."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "landguard-ml"
    version: str = "0.1.0"
    environment: str = "development"

    # ------------------------------------------------------------------
    # Shared secret for the Node backend. Optional ONLY in development.
    #
    # `require_api_key()` below refuses to start an unprotected service in
    # production: an unauthenticated ML endpoint reachable from a network is
    # an open risk-scoring oracle over whatever a caller chooses to send.
    # ------------------------------------------------------------------
    ml_service_api_key: str | None = None

    @property
    def auth_enabled(self) -> bool:
        return bool(self.ml_service_api_key)

    def require_api_key(self) -> None:
        if self.environment == "production" and not self.ml_service_api_key:
            raise RuntimeError(
                "ML_SERVICE_API_KEY must be set in production. Refusing to start an "
                "unauthenticated ML service."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
