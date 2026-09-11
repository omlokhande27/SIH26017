"""FastAPI application entry point."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()
settings.require_api_key()

app = FastAPI(
    title="LandGuard AI — ML Service",
    version=settings.version,
    description=(
        "Rule-based early-warning engine (primary) and an experimental delay "
        "estimator (secondary). Consumes a project feature snapshot; never "
        "queries the database, and therefore never sees actual outcomes."
    ),
)

app.include_router(router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all.

    The detail goes to the log; the caller gets a generic message. A stack
    trace in a response body describes the service's internals to whoever
    triggered the error.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {"service": settings.service_name, "docs": "/docs", "health": "/health"}
