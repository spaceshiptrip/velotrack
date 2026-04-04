"""
GPX and FIT file parsing service.
Extracts all available data and computes stats.
"""
from __future__ import annotations
import io
import math
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import gpxpy
import gpxpy.gpx

from app.services.stats_engine import (
    haversine, best_efforts_from_track, mean_max_power,
    normalized_power, compute_activity_stats
)


# ─── GPX Parser ───────────────────────────────────────────────────────────────

def parse_gpx(content: bytes, athlete: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Parse a GPX file and return a complete activity dict.
    """
    gpx = gpxpy.parse(io.BytesIO(content))

    # Collect all track points
    track_points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for pt in segment.points:
                track_points.append({
                    "lat": pt.latitude,
                    "lon": pt.longitude,
                    "ele": pt.elevation,
                    "time": pt.time.isoformat() if pt.time else None,
                    "hr": _gpx_extension(pt, "hr"),
                    "cadence": _gpx_extension(pt, "cad"),
                    "power": _gpx_extension(pt, "power"),
                    "speed": _gpx_extension(pt, "speed"),
                    "temperature": _gpx_extension(pt, "atemp"),
                })

    if not track_points:
        # Waypoints only — return minimal
        return {"name": gpx.name or "GPX Import", "track_points": []}

    # Basic metrics
    gpx_data = gpx.tracks[0] if gpx.tracks else None
    total_distance = 0.0
    elevation_gain = 0.0
    elevation_loss = 0.0
    min_ele = None
    max_ele = None
    hr_values = []
    cadence_values = []
    power_values = []

    for i, pt in enumerate(track_points):
        if i > 0:
            prev = track_points[i - 1]
            total_distance += haversine(prev["lat"], prev["lon"], pt["lat"], pt["lon"])

        ele = pt.get("ele")
        if ele is not None:
            if min_ele is None or ele < min_ele:
                min_ele = ele
            if max_ele is None or ele > max_ele:
                max_ele = ele
            if i > 0:
                prev_ele = track_points[i - 1].get("ele")
                if prev_ele is not None:
                    diff = ele - prev_ele
                    if diff > 0:
                        elevation_gain += diff
                    else:
                        elevation_loss += abs(diff)

        if pt.get("hr"):
            hr_values.append(float(pt["hr"]))
        if pt.get("cadence"):
            cadence_values.append(float(pt["cadence"]))
        if pt.get("power"):
            power_values.append(float(pt["power"]))

    # Duration
    start_time = None
    end_time = None
    for pt in track_points:
        if pt["time"]:
            from dateutil.parser import parse
            t = parse(pt["time"])
            if start_time is None:
                start_time = t
            end_time = t

    duration = (end_time - start_time).total_seconds() if start_time and end_time else None

    # Build time-indexed streams for charts
    hr_stream = []
    pace_stream = []
    power_stream_t = []
    ele_stream = []
    cum_dist = 0.0

    for i, pt in enumerate(track_points):
        t_offset = 0.0
        if pt["time"] and start_time:
            from dateutil.parser import parse
            t_offset = (parse(pt["time"]) - start_time).total_seconds()

        if i > 0:
            cum_dist += haversine(
                track_points[i - 1]["lat"], track_points[i - 1]["lon"],
                pt["lat"], pt["lon"]
            )

        if pt.get("hr"):
            hr_stream.append({"t": t_offset, "hr": float(pt["hr"]), "d": cum_dist})
        if pt.get("power"):
            power_stream_t.append({"t": t_offset, "watts": float(pt["power"]), "d": cum_dist})
        if pt.get("ele") is not None:
            ele_stream.append({"t": t_offset, "ele": pt["ele"], "d": cum_dist})

        # Instantaneous pace
        if i > 0 and t_offset > 0:
            d_segment = haversine(
                track_points[i - 1]["lat"], track_points[i - 1]["lon"],
                pt["lat"], pt["lon"]
            )
            prev_t = 0.0
            if track_points[i - 1]["time"] and start_time:
                from dateutil.parser import parse
                prev_t = (parse(track_points[i - 1]["time"]) - start_time).total_seconds()
            dt = t_offset - prev_t
            if dt > 0 and d_segment > 0:
                pace = dt / (d_segment / 1000)  # s/km
                if 60 < pace < 2000:  # sanity filter
                    pace_stream.append({"t": t_offset, "pace": pace, "d": cum_dist})

    # NP from power
    np_watts = None
    if power_values:
        np_watts = normalized_power(power_values)

    # Laps from GPX
    laps = _extract_gpx_laps(gpx)

    # Best efforts for running
    activity_type = _guess_activity_type(gpx, total_distance, duration)
    best_eff = []
    if activity_type in ("running", "trail_running", "hiking") and len(track_points) > 10:
        try:
            best_eff = best_efforts_from_track(track_points)
        except Exception:
            pass

    # Power curve
    power_curve_data = []
    if power_values:
        power_curve_data = mean_max_power(power_values)

    activity = {
        "name": gpx.name or f"{activity_type.replace('_', ' ').title()} Activity",
        "activity_type": activity_type,
        "start_time": start_time.isoformat() if start_time else None,
        "duration_seconds": duration,
        "distance_meters": round(total_distance, 1),
        "elevation_gain_m": round(elevation_gain, 1),
        "elevation_loss_m": round(elevation_loss, 1),
        "min_elevation_m": min_ele,
        "max_elevation_m": max_ele,
        "avg_hr": round(sum(hr_values) / len(hr_values), 1) if hr_values else None,
        "max_hr": max(hr_values) if hr_values else None,
        "avg_cadence": round(sum(cadence_values) / len(cadence_values), 1) if cadence_values else None,
        "avg_power_watts": round(sum(power_values) / len(power_values), 1) if power_values else None,
        "normalized_power_watts": np_watts,
        "has_gps": True,
        "start_lat": track_points[0]["lat"] if track_points else None,
        "start_lon": track_points[0]["lon"] if track_points else None,
        "gps_track": track_points,
        "hr_stream": hr_stream,
        "pace_stream": pace_stream,
        "power_stream": power_stream_t,
        "elevation_stream": ele_stream,
        "laps": laps,
        "best_efforts": best_eff,
        "power_curve": power_curve_data,
        "source": "gpx",
    }

    # Compute derived stats
    derived = compute_activity_stats(activity, athlete)
    activity.update(derived)

    return activity


def _gpx_extension(point, key: str):
    """Extract a Garmin/standard extension value from a GPX trackpoint."""
    # Handle common extension namespaces
    ns_map = {
        "hr": [
            "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
            "http://www.garmin.com/xmlschemas/TrackPointExtension/v2",
        ],
        "cad": [
            "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
            "http://www.garmin.com/xmlschemas/TrackPointExtension/v2",
        ],
    }
    for ext in point.extensions:
        for child in ext:
            local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if local.lower() in (key, f"hr", f"heartrate", f"cadence", f"cad"):
                if key in ("hr",) and local.lower() in ("hr", "heartratebpm", "heartrate"):
                    try:
                        return float(child.text)
                    except (TypeError, ValueError):
                        pass
                if key in ("cad",) and local.lower() in ("cad", "cadence"):
                    try:
                        return float(child.text)
                    except (TypeError, ValueError):
                        pass
            # Direct match
            if local.lower() == key.lower():
                try:
                    return float(child.text)
                except (TypeError, ValueError):
                    pass
    return None


def _extract_gpx_laps(gpx) -> List[Dict]:
    """Extract lap data if present in GPX routes."""
    # GPX doesn't natively have laps but some exporters add them
    return []


def _guess_activity_type(gpx, distance_m: float, duration_s: Optional[float]) -> str:
    """Guess activity type from GPX <type>, metadata/name, and pace.

    Preserve explicit GPX activity types exactly when present.
    Only fall back to guessing when no explicit type exists.
    """

    def _clean_activity(value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        s = value.strip().lower().replace("-", "_").replace(" ", "_")
        return s or None

    # 1) Most authoritative: GPX track <type>
    try:
        if getattr(gpx, "tracks", None):
            for trk in gpx.tracks:
                trk_type = _clean_activity(getattr(trk, "type", None))
                if trk_type:
                    return trk_type
    except Exception:
        pass

    # 2) Next best: GPX name / track name
    # These are still guesses, but preserve detail if explicitly present in the text.
    possible_names = []

    gpx_name = _clean_activity(getattr(gpx, "name", None))
    if gpx_name:
        possible_names.append(gpx_name)

    try:
        if getattr(gpx, "tracks", None):
            for trk in gpx.tracks:
                trk_name = _clean_activity(getattr(trk, "name", None))
                if trk_name:
                    possible_names.append(trk_name)
    except Exception:
        pass

    for name in possible_names:
        # More specific checks first so we don't lose detail
        if "trail" in name and "run" in name:
            return "trail_running"
        if "indoor" in name and "row" in name:
            return "indoor_rowing"
        if "open" in name and "water" in name and "swim" in name:
            return "open_water_swimming"
        if "pool" in name and "swim" in name:
            return "pool_swimming"
        if "pickleball" in name:
            return "pickleball"
        if "hiit" in name:
            return "hiit"
        if "row" in name:
            return "rowing"
        if "run" in name:
            return "running"
        if "bike" in name or "cycl" in name or "ride" in name or "mtb" in name:
            return "cycling"
        if "hike" in name:
            return "hiking"
        if "walk" in name:
            return "walking"
        if "swim" in name:
            return "swimming"

    # 3) Final fallback: infer from pace only when there is no explicit metadata
    if distance_m and duration_s and duration_s > 0:
        speed_ms = distance_m / duration_s

        if speed_ms > 8:
            return "cycling"
        elif speed_ms > 3:
            return "running"
        elif speed_ms > 1.5:
            return "hiking"
        elif speed_ms > 0.5:
            return "walking"

    return "other"


# ─── FIT Parser ───────────────────────────────────────────────────────────────

def parse_fit(content: bytes, athlete: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Parse a .FIT file and return a complete activity dict.
    """
    try:
        from fitparse import FitFile
    except ImportError:
        raise RuntimeError("fitparse not installed")

    fitfile = FitFile(io.BytesIO(content))

    track_points = []
    hr_stream = []
    power_stream_t = []
    pace_stream = []
    ele_stream = []
    laps = []
    session_data = {}

    # Parse messages
    for msg in fitfile.get_messages():
        if msg.name == "session":
            for field in msg:
                session_data[field.name] = field.value

        elif msg.name == "lap":
            lap = {}
            for field in msg:
                lap[field.name] = field.value
            laps.append(lap)

        elif msg.name == "record":
            rec = {}
            for field in msg:
                rec[field.name] = field.value
            track_points.append(rec)

    if not track_points:
        return {"name": "FIT Import", "track_points": []}

    # Build GPS track and streams
    gps_track = []
    start_time = None

    for i, rec in enumerate(track_points):
        ts = rec.get("timestamp")
        if ts and start_time is None:
            start_time = ts
        t_offset = (ts - start_time).total_seconds() if ts and start_time else 0

        lat = _fit_semicircles(rec.get("position_lat"))
        lon = _fit_semicircles(rec.get("position_long"))
        ele = rec.get("altitude") or rec.get("enhanced_altitude")
        hr = rec.get("heart_rate")
        cadence = rec.get("cadence")
        power = rec.get("power")
        speed = rec.get("speed") or rec.get("enhanced_speed")
        distance = rec.get("distance")

        if lat and lon:
            gps_track.append({
                "lat": lat, "lon": lon,
                "ele": ele,
                "time": ts.isoformat() if ts else None,
                "hr": hr,
                "cadence": cadence,
                "power": power,
                "speed": speed,
            })

        if hr:
            hr_stream.append({"t": t_offset, "hr": float(hr)})
        if power:
            power_stream_t.append({"t": t_offset, "watts": float(power)})
        if ele is not None:
            ele_stream.append({"t": t_offset, "ele": float(ele)})
        if speed and speed > 0:
            pace = 1000 / (speed * 3.6)  # s/km from km/h... wait speed is m/s
            pace = 1000 / speed if speed > 0 else 0  # s/km from m/s
            if 60 < pace < 3600:
                pace_stream.append({"t": t_offset, "pace": pace})

    # Compute elevation gain
    elevation_gain = 0.0
    elevation_loss = 0.0
    for i in range(1, len(gps_track)):
        prev_ele = gps_track[i - 1].get("ele")
        curr_ele = gps_track[i].get("ele")
        if prev_ele is not None and curr_ele is not None:
            diff = curr_ele - prev_ele
            if diff > 0:
                elevation_gain += diff
            else:
                elevation_loss += abs(diff)

    # Total distance
    total_distance = session_data.get("total_distance") or 0.0

    # Duration
    total_elapsed = session_data.get("total_elapsed_time") or 0.0
    total_timer = session_data.get("total_timer_time") or total_elapsed

    # Activity type
    sport = session_data.get("sport", "generic")
    sub_sport = session_data.get("sub_sport", "generic")
    activity_type = _fit_sport_to_type(sport, sub_sport)

    # HR data
    avg_hr = session_data.get("avg_heart_rate") or (
        sum(h["hr"] for h in hr_stream) / len(hr_stream) if hr_stream else None
    )
    max_hr = session_data.get("max_heart_rate")

    # Power
    avg_power = session_data.get("avg_power")
    max_power = session_data.get("max_power")
    power_values = [p["watts"] for p in power_stream_t]
    np_watts = normalized_power(power_values) if power_values else None

    # Best efforts
    best_eff = []
    if activity_type in ("running", "trail_running") and len(gps_track) > 10:
        try:
            best_eff = best_efforts_from_track(gps_track)
        except Exception:
            pass

    # Power curve
    power_curve_data = mean_max_power(power_values) if power_values else []

    # Format laps
    formatted_laps = []
    for i, lap in enumerate(laps):
        formatted_laps.append({
            "lap_num": i + 1,
            "distance_m": lap.get("total_distance", 0),
            "time_s": lap.get("total_elapsed_time", 0),
            "avg_hr": lap.get("avg_heart_rate"),
            "max_hr": lap.get("max_heart_rate"),
            "avg_cadence": lap.get("avg_cadence"),
            "avg_power": lap.get("avg_power"),
            "elevation_gain": lap.get("total_ascent"),
        })

    activity = {
        "name": session_data.get("event") or f"{activity_type.replace('_', ' ').title()} Activity",
        "activity_type": activity_type,
        "sub_type": sub_sport,
        "start_time": start_time.isoformat() if start_time else None,
        "duration_seconds": total_timer,
        "elapsed_seconds": total_elapsed,
        "distance_meters": total_distance,
        "elevation_gain_m": round(elevation_gain, 1) or session_data.get("total_ascent"),
        "elevation_loss_m": round(elevation_loss, 1) or session_data.get("total_descent"),
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "avg_cadence": session_data.get("avg_cadence"),
        "max_cadence": session_data.get("max_cadence"),
        "avg_power_watts": avg_power,
        "max_power_watts": max_power,
        "normalized_power_watts": np_watts,
        "calories": session_data.get("total_calories"),
        "avg_speed_ms": session_data.get("avg_speed") or session_data.get("enhanced_avg_speed"),
        "max_speed_ms": session_data.get("max_speed") or session_data.get("enhanced_max_speed"),
        "has_gps": len(gps_track) > 0,
        "start_lat": gps_track[0]["lat"] if gps_track else None,
        "start_lon": gps_track[0]["lon"] if gps_track else None,
        "gps_track": gps_track,
        "hr_stream": hr_stream,
        "pace_stream": pace_stream,
        "power_stream": power_stream_t,
        "elevation_stream": ele_stream,
        "laps": formatted_laps,
        "best_efforts": best_eff,
        "power_curve": power_curve_data,
        # Running dynamics (Garmin-specific FIT fields)
        "avg_stride_length_m": session_data.get("avg_stride_length"),
        "avg_vertical_oscillation_cm": session_data.get("avg_vertical_oscillation"),
        "avg_ground_contact_ms": session_data.get("avg_ground_contact_time"),
        "avg_vertical_ratio": session_data.get("avg_vertical_ratio"),
        # Training effect
        "aerobic_training_effect": session_data.get("total_training_effect"),
        "anaerobic_training_effect": session_data.get("total_anaerobic_training_effect"),
        "source": "fit",
    }

    derived = compute_activity_stats(activity, athlete)
    activity.update(derived)

    return activity


def _fit_semicircles(val) -> Optional[float]:
    """Convert Garmin semicircles to degrees."""
    if val is None:
        return None
    return val * (180.0 / 2**31)


def _fit_sport_to_type(sport: str, sub_sport: str) -> str:
    mapping = {
        "running": "running",
        "cycling": "cycling",
        "swimming": "swimming",
        "hiking": "hiking",
        "walking": "walking",
        "training": "strength_training",
        "fitness_equipment": "elliptical",
        "rowing": "rowing",
        "paddling": "kayaking",
        "skiing": "skiing",
        "snowboarding": "snowboarding",
    }
    sub_mapping = {
        "trail": "trail_running",
        "mountain": "mountain_biking",
        "gravel_cycling": "gravel_cycling",
        "indoor_cycling": "indoor_cycling",
        "open_water": "open_water_swimming",
        "strength_training": "strength_training",
        "hiit": "hiit",
        "yoga": "yoga",
        "pilates": "pilates",
        "stair_climbing": "stair_climbing",
    }
    sub_key = sub_sport.lower().replace(" ", "_") if sub_sport else ""
    if sub_key in sub_mapping:
        return sub_mapping[sub_key]
    return mapping.get(sport.lower().replace(" ", "_") if sport else "", "other")
