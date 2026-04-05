"""Pickleball heuristic helpers."""
from __future__ import annotations

import json
import math
from pathlib import Path
from statistics import median
from typing import Any, Dict, Iterable, List

from app.core.config import settings


STROKE_KEYS = ("forehand", "backhand")


def pickleball_profile_path(user_id: int) -> Path:
    return Path(settings.fit_files_path) / "heuristics" / f"pickleball_user_{user_id}.json"


def load_pickleball_profile(user_id: int) -> Dict[str, Any] | None:
    path = pickleball_profile_path(user_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_pickleball_profile(user_id: int, profile: Dict[str, Any]) -> Path:
    path = pickleball_profile_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    return path


def build_pickleball_profile(activities: Iterable[Any]) -> Dict[str, Any]:
    power_by_stroke: Dict[str, List[float]] = {key: [] for key in STROKE_KEYS}
    activity_count = 0

    for activity in activities:
        streams = getattr(activity, "sport_streams", None) or {}
        pickleball_power = streams.get("pickleball_power") or {}
        if not pickleball_power:
            continue
        activity_count += 1
        for stroke in STROKE_KEYS:
            samples = pickleball_power.get(stroke) or []
            power_by_stroke[stroke].extend(
                float(sample["power"])
                for sample in samples
                if sample.get("power") is not None
            )

    thresholds: Dict[str, Any] = {}
    for stroke, values in power_by_stroke.items():
        if not values:
            thresholds[stroke] = {
                "sample_count": 0,
                "threshold_power": None,
                "median_power": None,
                "p25_power": None,
                "p35_power": None,
                "p50_power": None,
            }
            continue

        sorted_values = sorted(values)
        thresholds[stroke] = {
            "sample_count": len(sorted_values),
            "threshold_power": round(percentile(sorted_values, 0.35), 1),
            "median_power": round(median(sorted_values), 1),
            "p25_power": round(percentile(sorted_values, 0.25), 1),
            "p35_power": round(percentile(sorted_values, 0.35), 1),
            "p50_power": round(percentile(sorted_values, 0.50), 1),
        }

    return {
        "activity_count": activity_count,
        "strokes": thresholds,
        "notes": "Thresholds are learned from the lower-power distribution of forehand/backhand pickleball samples.",
    }


def percentile(sorted_values: List[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    index = max(0.0, min(1.0, p)) * (len(sorted_values) - 1)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return float(sorted_values[lower])
    fraction = index - lower
    return float(sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction)
