"""
VeloTrack Stats Engine
Computes: TSS, TRIMP, ATL/CTL/TSB, VO2max, power curves, best efforts,
aerobic decoupling, efficiency factor, VAM, SWOLF, and more.
"""
from __future__ import annotations
import math
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta


# ─── Constants ───────────────────────────────────────────────────────────────

LTHR_PCT = 0.85       # % of max HR assumed to be LTHR if not set
DEFAULT_MAX_HR = 190
EARTH_RADIUS_M = 6371000


# ─── Heart Rate Zones ─────────────────────────────────────────────────────────

def hr_zones_from_max(max_hr: int) -> Dict[str, Tuple[float, float]]:
    """Return HR zone boundaries (bpm) from max HR using Garmin-style zones."""
    return {
        "z1": (0, max_hr * 0.60),
        "z2": (max_hr * 0.60, max_hr * 0.70),
        "z3": (max_hr * 0.70, max_hr * 0.80),
        "z4": (max_hr * 0.80, max_hr * 0.90),
        "z5": (max_hr * 0.90, max_hr * 1.05),
    }


def hr_zones_from_lthr(lthr: float) -> Dict[str, Tuple[float, float]]:
    """Return HR zone boundaries using LTHR (Friel-style)."""
    return {
        "z1": (0, lthr * 0.81),
        "z2": (lthr * 0.81, lthr * 0.89),
        "z3": (lthr * 0.89, lthr * 0.93),
        "z4": (lthr * 0.93, lthr * 1.00),
        "z5": (lthr * 1.00, lthr * 1.06),
    }


def power_zones_from_ftp(ftp: float) -> Dict[str, Tuple[float, float]]:
    """Coggan power zones."""
    return {
        "z1_active_recovery": (0, ftp * 0.55),
        "z2_endurance":       (ftp * 0.55, ftp * 0.75),
        "z3_tempo":           (ftp * 0.75, ftp * 0.90),
        "z4_threshold":       (ftp * 0.90, ftp * 1.05),
        "z5_vo2max":          (ftp * 1.05, ftp * 1.20),
        "z6_anaerobic":       (ftp * 1.20, ftp * 1.50),
        "z7_neuromuscular":   (ftp * 1.50, 9999),
    }


def time_in_hr_zones(
    hr_stream: List[Dict],  # [{t: seconds, hr: bpm}]
    zones: Dict[str, Tuple[float, float]],
) -> Dict[str, float]:
    """Compute seconds spent in each HR zone."""
    zone_seconds = {z: 0.0 for z in zones}
    if len(hr_stream) < 2:
        return zone_seconds
    for i in range(1, len(hr_stream)):
        dt = hr_stream[i]["t"] - hr_stream[i - 1]["t"]
        hr = hr_stream[i]["hr"]
        for zone, (lo, hi) in zones.items():
            if lo <= hr < hi:
                zone_seconds[zone] += dt
                break
    return zone_seconds


# ─── TRIMP (Training Impulse) ─────────────────────────────────────────────────

def trimp_edwards(
    hr_stream: List[Dict],
    max_hr: float,
    resting_hr: float = 50.0,
) -> float:
    """Edwards TRIMP — weighted sum of time in zones."""
    zones = hr_zones_from_max(int(max_hr))
    weights = {"z1": 1, "z2": 2, "z3": 3, "z4": 4, "z5": 5}
    zone_secs = time_in_hr_zones(hr_stream, zones)
    trimp = sum(zone_secs[z] / 60.0 * weights[z] for z in zones)
    return round(trimp, 1)


def trimp_banister(
    duration_min: float,
    avg_hr: float,
    resting_hr: float,
    max_hr: float,
    gender: str = "male",  # male|female
) -> float:
    """Banister TRIMP (classic)."""
    hrr = (avg_hr - resting_hr) / (max_hr - resting_hr)
    k = 1.92 if gender == "male" else 1.67
    return duration_min * hrr * 0.64 * math.exp(k * hrr)


# ─── TSS (Training Stress Score) ─────────────────────────────────────────────

def tss_from_power(
    duration_seconds: float,
    normalized_power: float,
    ftp: float,
) -> float:
    """Coggan TSS from power."""
    if ftp <= 0:
        return 0.0
    intensity_factor = normalized_power / ftp
    return (duration_seconds * normalized_power * intensity_factor) / (ftp * 3600) * 100


def hrss(
    trimp: float,
    trimp_threshold: float = 100.0,
) -> float:
    """HR-based Stress Score — normalized TRIMP."""
    return (trimp / trimp_threshold) * 100


def tss_from_hr(
    duration_seconds: float,
    avg_hr: float,
    lthr: float,
    max_hr: float,
    resting_hr: float = 50.0,
) -> float:
    """Estimate TSS from heart rate when no power data available."""
    if lthr <= 0 or duration_seconds <= 0:
        return 0.0
    hrr = (avg_hr - resting_hr) / (max_hr - resting_hr)
    lthr_hrr = (lthr - resting_hr) / (max_hr - resting_hr)
    intensity_factor = hrr / lthr_hrr
    return (duration_seconds * intensity_factor**2) / 3600 * 100


# ─── ATL / CTL / TSB ─────────────────────────────────────────────────────────

def compute_fitness_fatigue(
    daily_tss: List[Tuple[datetime, float]],  # sorted by date
    ctl_days: int = 42,
    atl_days: int = 7,
) -> List[Dict]:
    """
    Compute ATL (fatigue), CTL (fitness), TSB (form) for each day.
    Returns list of {date, tss, ctl, atl, tsb}.
    """
    if not daily_tss:
        return []

    ctl_k = 2 / (ctl_days + 1)
    atl_k = 2 / (atl_days + 1)

    result = []
    ctl = 0.0
    atl = 0.0

    # Fill in missing days
    dates = sorted(set(d.date() for d, _ in daily_tss))
    tss_by_date = {d.date(): v for d, v in daily_tss}

    if dates:
        start = dates[0]
        end = dates[-1]
        current = start
        while current <= end:
            tss_val = tss_by_date.get(current, 0.0)
            ctl = ctl + ctl_k * (tss_val - ctl)
            atl = atl + atl_k * (tss_val - atl)
            tsb = ctl - atl
            result.append({
                "date": current.isoformat(),
                "tss": tss_val,
                "ctl": round(ctl, 1),
                "atl": round(atl, 1),
                "tsb": round(tsb, 1),
            })
            current += timedelta(days=1)

    return result


# ─── Training Monotony & Strain ───────────────────────────────────────────────

def training_monotony(weekly_tss: List[float]) -> float:
    """Foster training monotony = mean / stdev of daily load."""
    if not weekly_tss or len(weekly_tss) < 2:
        return 0.0
    mean = sum(weekly_tss) / len(weekly_tss)
    variance = sum((x - mean) ** 2 for x in weekly_tss) / len(weekly_tss)
    stdev = math.sqrt(variance) if variance > 0 else 0.001
    return round(mean / stdev, 2)


def training_strain(weekly_tss: List[float]) -> float:
    """Foster training strain = weekly_load * monotony."""
    return round(sum(weekly_tss) * training_monotony(weekly_tss), 1)


# ─── Normalized Power ─────────────────────────────────────────────────────────

def normalized_power(power_stream: List[float], interval_s: int = 1) -> float:
    """
    Coggan Normalized Power.
    power_stream: list of watts at each second.
    """
    if not power_stream or len(power_stream) < 30:
        return 0.0
    window = 30  # 30-second rolling average
    rolling_avg = []
    for i in range(window - 1, len(power_stream)):
        avg = sum(power_stream[i - window + 1 : i + 1]) / window
        rolling_avg.append(avg)
    fourth_powers = [x**4 for x in rolling_avg if x > 0]
    if not fourth_powers:
        return 0.0
    return round((sum(fourth_powers) / len(fourth_powers)) ** 0.25, 1)


# ─── Grade-Adjusted Pace ──────────────────────────────────────────────────────

def grade_adjusted_pace(pace_s_per_km: float, grade_pct: float) -> float:
    """
    Strava-style GAP: adjust pace for elevation gradient.
    grade_pct: positive = uphill.
    Returns adjusted pace in s/km.
    """
    # Empirical adjustment factor based on Minetti et al. metabolic cost
    factor = 1.0
    g = grade_pct / 100.0
    if g > 0:
        # Uphill: harder
        factor = 1 + (g * 15.0 * (1 - math.exp(-g * 10)))
    elif g < 0:
        # Downhill: easier to a point, then harder
        factor = max(0.5, 1 + (g * 5.0))
    return pace_s_per_km / factor


# ─── Power Curve (MMP) ────────────────────────────────────────────────────────

def mean_max_power(
    power_stream: List[float],
    durations: Optional[List[int]] = None,
) -> List[Dict]:
    """
    Compute Mean Maximal Power for given durations.
    Returns [{duration_s, watts}] — the power curve.
    """
    if durations is None:
        durations = [1, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600]

    result = []
    n = len(power_stream)
    for d in durations:
        if d > n:
            break
        best = 0.0
        for i in range(n - d + 1):
            avg = sum(power_stream[i : i + d]) / d
            if avg > best:
                best = avg
        result.append({"duration_s": d, "watts": round(best, 1)})
    return result


# ─── Best Efforts (Running) ───────────────────────────────────────────────────

BEST_EFFORT_DISTANCES = [400, 800, 1000, 1609, 3218, 5000, 10000, 21097, 42195]


def best_efforts_from_track(
    track: List[Dict],  # [{lat, lon, ele, time (ISO)}]
) -> List[Dict]:
    """
    Compute best time for standard distances from GPS track.
    Returns [{distance_m, time_s, pace_s_per_km, start_idx, end_idx}].
    """
    # Convert to cumulative distance and timestamps
    pts = []
    cum_dist = 0.0
    for i, pt in enumerate(track):
        if i > 0:
            cum_dist += haversine(
                track[i - 1]["lat"], track[i - 1]["lon"],
                pt["lat"], pt["lon"]
            )
        t = pt.get("time")
        if isinstance(t, str):
            from dateutil.parser import parse
            t = parse(t).timestamp()
        pts.append({"dist": cum_dist, "time": t})

    results = []
    for target in BEST_EFFORT_DISTANCES:
        if cum_dist < target:
            continue
        best_time = None
        best_start = 0
        j = 0
        for i in range(len(pts)):
            # advance j until window >= target
            while j < len(pts) and pts[j]["dist"] - pts[i]["dist"] < target:
                j += 1
            if j >= len(pts):
                break
            elapsed = pts[j]["time"] - pts[i]["time"]
            if best_time is None or elapsed < best_time:
                best_time = elapsed
                best_start = i
        if best_time:
            pace = best_time / (target / 1000)
            results.append({
                "distance_m": target,
                "time_s": round(best_time),
                "pace_s_per_km": round(pace),
            })
    return results


# ─── Efficiency Factor ────────────────────────────────────────────────────────

def efficiency_factor(
    avg_power_or_pace: float,  # watts or speed m/s
    avg_hr: float,
) -> float:
    """EF = NP (or speed) / avg HR. Higher = more efficient."""
    if avg_hr <= 0:
        return 0.0
    return round(avg_power_or_pace / avg_hr, 3)


# ─── Aerobic Decoupling ────────────────────────────────────────────────────────

def aerobic_decoupling(
    first_half_ef: float,
    second_half_ef: float,
) -> float:
    """
    Aerobic decoupling (Pw:Hr or Pa:Hr drift).
    < 5% = aerobic, > 5% = some cardiac drift.
    """
    if first_half_ef <= 0:
        return 0.0
    return round(((first_half_ef - second_half_ef) / first_half_ef) * 100, 1)


def compute_decoupling_from_streams(
    power_or_pace: List[float],
    hr_stream: List[float],
) -> float:
    """Compute aerobic decoupling from parallel streams."""
    n = len(power_or_pace)
    if n < 10 or len(hr_stream) < 10:
        return 0.0
    mid = n // 2
    first_ef = sum(power_or_pace[:mid]) / (sum(hr_stream[:mid]) / mid) if sum(hr_stream[:mid]) > 0 else 0
    second_ef = sum(power_or_pace[mid:]) / (sum(hr_stream[mid:]) / (n - mid)) if sum(hr_stream[mid:]) > 0 else 0
    return aerobic_decoupling(
        first_ef / mid if mid > 0 else 0,
        second_ef / (n - mid) if (n - mid) > 0 else 0
    )


# ─── VAM (Velocità Ascensionale Media) ───────────────────────────────────────

def vam(elevation_gain_m: float, duration_seconds: float) -> float:
    """VAM = vertical meters per hour. Used for climbing assessment."""
    if duration_seconds <= 0:
        return 0.0
    return round((elevation_gain_m / duration_seconds) * 3600, 1)


# ─── VO2max Estimates ─────────────────────────────────────────────────────────

def vo2max_from_run(
    pace_s_per_km: float,
    hr_fraction: float,  # avg_hr / max_hr
) -> float:
    """Daniels-style VO2max estimate from pace and HR fraction."""
    speed_kmh = 3600 / pace_s_per_km if pace_s_per_km > 0 else 0
    vo2 = -4.60 + 0.182258 * speed_kmh + 0.000104 * speed_kmh**2
    return round(vo2 / hr_fraction, 1) if hr_fraction > 0 else 0


def vo2max_from_power(ftp_watts: float, weight_kg: float) -> float:
    """Cycling VO2max estimate from FTP."""
    if weight_kg <= 0:
        return 0.0
    watts_per_kg = ftp_watts / weight_kg
    return round(watts_per_kg * 10.8 + 7, 1)


# ─── SWOLF / Swim Metrics ─────────────────────────────────────────────────────

def swolf(stroke_count: int, time_seconds: float) -> float:
    """SWOLF = strokes + time for one length."""
    return stroke_count + time_seconds


def dps(pool_length_m: float, strokes_per_length: float) -> float:
    """Distance per stroke."""
    if strokes_per_length <= 0:
        return 0.0
    return round(pool_length_m / strokes_per_length, 2)


# ─── Haversine / GPS ──────────────────────────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compass bearing from point 1 to point 2 in degrees."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


# ─── Activity Full Stats Computation ─────────────────────────────────────────

def compute_activity_stats(
    activity: Dict[str, Any],
    athlete: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Given raw activity data (from GPX parse or Garmin API),
    compute all derived metrics.
    """
    stats = {}
    duration = activity.get("duration_seconds", 0) or 0
    distance = activity.get("distance_meters", 0) or 0
    avg_hr = activity.get("avg_hr") or 0
    max_hr = (athlete or {}).get("max_hr", DEFAULT_MAX_HR)
    resting_hr = (athlete or {}).get("resting_hr", 50)
    ftp = (athlete or {}).get("ftp_watts", 200)
    lthr = (athlete or {}).get("lthr") or max_hr * LTHR_PCT
    hr_stream = activity.get("hr_stream") or []

    # Pace
    if distance > 0 and duration > 0:
        stats["avg_pace_s_per_km"] = duration / (distance / 1000)
        stats["avg_speed_ms"] = distance / duration
        stats["avg_speed_kmh"] = stats["avg_speed_ms"] * 3.6

    # TRIMP
    if avg_hr and duration:
        stats["trimp"] = round(trimp_banister(
            duration / 60, avg_hr, resting_hr, max_hr
        ), 1)
        stats["tss_hr"] = round(tss_from_hr(
            duration, avg_hr, lthr, max_hr, resting_hr
        ), 1)

    # Power-based TSS
    np_watts = activity.get("normalized_power_watts")
    if np_watts and ftp:
        stats["tss"] = round(tss_from_power(duration, np_watts, ftp), 1)
        stats["intensity_factor"] = round(np_watts / ftp, 3)
    else:
        stats["tss"] = stats.get("tss_hr", 0)

    # HR zone time
    if hr_stream:
        zones = hr_zones_from_lthr(lthr) if lthr else hr_zones_from_max(int(max_hr))
        zone_seconds = time_in_hr_zones(hr_stream, zones)
        stats["hr_zone_1_seconds"] = round(zone_seconds.get("z1", 0.0), 1)
        stats["hr_zone_2_seconds"] = round(zone_seconds.get("z2", 0.0), 1)
        stats["hr_zone_3_seconds"] = round(zone_seconds.get("z3", 0.0), 1)
        stats["hr_zone_4_seconds"] = round(zone_seconds.get("z4", 0.0), 1)
        stats["hr_zone_5_seconds"] = round(zone_seconds.get("z5", 0.0), 1)

    # VAM
    ele_gain = activity.get("elevation_gain_m", 0) or 0
    if ele_gain > 0 and duration > 0:
        stats["vam"] = vam(ele_gain, duration)

    # VO2max estimate
    if avg_hr and avg_hr < max_hr and stats.get("avg_pace_s_per_km"):
        stats["vo2max_estimate"] = vo2max_from_run(
            stats["avg_pace_s_per_km"],
            avg_hr / max_hr
        )

    # EF
    avg_power = activity.get("avg_power_watts") or stats.get("avg_speed_ms")
    if avg_power and avg_hr:
        stats["efficiency_factor"] = efficiency_factor(avg_power, avg_hr)

    return stats
