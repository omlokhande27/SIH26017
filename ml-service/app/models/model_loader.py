"""
Model loading — once per process, with the card that describes it.

The card is loaded alongside the pipeline and is not optional: the API reports
`beats_baseline` and the limitation flags straight from it, so a model without
its provenance is refused rather than served anonymously.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "model.joblib"
CARD_PATH = ROOT / "artifacts" / "model_card.json"


@dataclass(frozen=True)
class LoadedModel:
    pipeline: Any
    features: list[str]
    card: dict[str, Any]

    @property
    def version(self) -> str:
        return str(self.card.get("model_version", "unknown"))

    @property
    def model_type(self) -> str:
        return str(self.card.get("model_type", "unknown"))

    @property
    def beats_baseline(self) -> bool:
        return bool(self.card.get("beats_baseline", False))


_cached: LoadedModel | None = None
_load_error: str | None = None


def load(force: bool = False) -> LoadedModel | None:
    """
    Load the model, caching it for the process lifetime.

    Returns None when no model has been trained. That is a supported state, not
    a failure: the rule engine is the primary signal and the service is fully
    useful without any model at all. The API reports the ML estimate as
    UNAVAILABLE rather than refusing the request.
    """
    global _cached, _load_error

    if _cached is not None and not force:
        return _cached

    if not MODEL_PATH.exists() or not CARD_PATH.exists():
        _load_error = "No trained model artifact found. Run: python -m app.models.train"
        return None

    try:
        bundle = joblib.load(MODEL_PATH)
        card = json.loads(CARD_PATH.read_text(encoding="utf-8"))
        _cached = LoadedModel(
            pipeline=bundle["pipeline"],
            features=list(bundle["features"]),
            card=card,
        )
        _load_error = None
        return _cached
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        _load_error = f"Model artifact could not be loaded: {exc}"
        return None


def load_error() -> str | None:
    return _load_error


def reset() -> None:
    """Test hook."""
    global _cached, _load_error
    _cached = None
    _load_error = None
