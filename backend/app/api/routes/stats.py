"""Dashboard and analytics stats endpoints."""
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc, extract

from app.core.database import get_db
from app.models.models import Activity, HealthMetric, AthleteStats, User
from app.api.deps import get_current_user
from app.services.stats_engine import compute_fitness_fatigue, training_monotony, training_strain

router = APIRouter()


class AthleteProfileRequest(BaseModel):
    ftp_watts: Optional[float] = None
    max_hr: Optional[int] = None
    resting_hr: Optional[int] = None
    lthr: Optional[float] = None


@router.get("/athlete-profile")
async def athlete_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stats_row = (await db.execute(
        select(AthleteStats).where(AthleteStats.user_id == user.id)
    )).scalar_one_or_none()
    if not stats_row:
        return {"ftp_watts": None, "max_hr": None, "resting_hr": None, "lthr": None}
    return {
        "ftp_watts": stats_row.ftp_watts,
        "max_hr": stats_row.max_hr,
        "resting_hr": stats_row.resting_hr,
        "lthr": stats_row.lthr,
    }


@router.put("/athlete-profile")
async def update_athlete_profile(
    req: AthleteProfileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stats_row = (await db.execute(
        select(AthleteStats).where(AthleteStats.user_id == user.id)
    )).scalar_one_or_none()
    if not stats_row:
        stats_row = AthleteStats(user_id=user.id)
        db.add(stats_row)

    for field in ("ftp_watts", "max_hr", "resting_hr", "lthr"):
        value = getattr(req, field)
        if value is not None:
            setattr(stats_row, field, value)

    # Recompute HR-derived fields for existing activities so the UI updates immediately.
    acts = (await db.execute(
        select(Activity).where(Activity.user_id == user.id)
    )).scalars().all()

    athlete = {
        "ftp_watts": stats_row.ftp_watts,
        "max_hr": stats_row.max_hr,
        "resting_hr": stats_row.resting_hr,
        "lthr": stats_row.lthr,
    }

    from app.services.stats_engine import compute_activity_stats
    for a in acts:
        derived = compute_activity_stats({
            "duration_seconds": a.duration_seconds,
            "distance_meters": a.distance_meters,
            "avg_hr": a.avg_hr,
            "avg_power_watts": a.avg_power_watts,
            "normalized_power_watts": a.normalized_power_watts,
            "elevation_gain_m": a.elevation_gain_m,
            "hr_stream": a.hr_stream or [],
        }, athlete)
        for field, value in derived.items():
            if hasattr(a, field) and value is not None:
                setattr(a, field, value)

    await db.commit()
    return {
        "ftp_watts": stats_row.ftp_watts,
        "max_hr": stats_row.max_hr,
        "resting_hr": stats_row.resting_hr,
        "lthr": stats_row.lthr,
        "updated_activities": len(acts),
    }


@router.get("/dashboard")
async def dashboard_summary(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Main dashboard: totals, recent trends, fitness curve."""
    end = datetime.utcnow()
    start = end - timedelta(days=days)

    acts = (await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user.id, Activity.start_time >= start))
        .order_by(Activity.start_time)
    )).scalars().all()

    # Totals
    totals = {
        "activities": len(acts),
        "distance_km": round(sum((a.distance_meters or 0) for a in acts) / 1000, 1),
        "duration_hours": round(sum(a.duration_seconds or 0 for a in acts) / 3600, 1),
        "elevation_gain_m": round(sum(a.elevation_gain_m or 0 for a in acts)),
        "calories": int(sum(a.calories or 0 for a in acts)),
        "tss": round(sum(a.tss or 0 for a in acts), 1),
    }

    # By type breakdown
    type_breakdown = {}
    for a in acts:
        t = a.activity_type or "other"
        if t not in type_breakdown:
            type_breakdown[t] = {"count": 0, "distance_km": 0, "duration_h": 0}
        type_breakdown[t]["count"] += 1
        type_breakdown[t]["distance_km"] += round((a.distance_meters or 0) / 1000, 1)
        type_breakdown[t]["duration_h"] += round((a.duration_seconds or 0) / 3600, 2)

    # Weekly volume chart
    weekly = _weekly_volumes(acts)

    # Fitness/fatigue curve
    fitness_curve = await _fitness_curve(db, user.id)

    # Athlete stats
    stats_row = (await db.execute(
        select(AthleteStats).where(AthleteStats.user_id == user.id)
    )).scalar_one_or_none()

    athlete = None
    if stats_row:
        athlete = {
            "ctl": stats_row.ctl,
            "atl": stats_row.atl,
            "tsb": stats_row.tsb,
            "vo2max": stats_row.vo2max,
            "ftp_watts": stats_row.ftp_watts,
            "threshold_pace_secs": stats_row.threshold_pace_secs,
        }

    return {
        "period_days": days,
        "totals": totals,
        "by_type": type_breakdown,
        "weekly_volumes": weekly,
        "fitness_curve": fitness_curve[-90:],  # last 90 days
        "athlete": athlete,
    }


@router.get("/fitness-curve")
async def fitness_curve(
    days: int = Query(180, ge=30, le=730),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """ATL/CTL/TSB fitness-fatigue curve."""
    return await _fitness_curve(db, user.id, days)


@router.get("/weekly-load")
async def weekly_load(
    weeks: int = Query(12, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    start = datetime.utcnow() - timedelta(weeks=weeks)
    acts = (await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user.id, Activity.start_time >= start))
        .order_by(Activity.start_time)
    )).scalars().all()
    return _weekly_volumes(acts)


@router.get("/hr-zones-breakdown")
async def hr_zones_breakdown(
    activity_type: Optional[str] = None,
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Total time in each HR zone across all activities."""
    start = datetime.utcnow() - timedelta(days=days)
    query = select(Activity).where(
        and_(Activity.user_id == user.id, Activity.start_time >= start)
    )
    if activity_type:
        query = query.where(Activity.activity_type == activity_type)
    acts = (await db.execute(query)).scalars().all()

    zones = {"z1": 0, "z2": 0, "z3": 0, "z4": 0, "z5": 0}
    for a in acts:
        zones["z1"] += a.hr_zone_1_seconds or 0
        zones["z2"] += a.hr_zone_2_seconds or 0
        zones["z3"] += a.hr_zone_3_seconds or 0
        zones["z4"] += a.hr_zone_4_seconds or 0
        zones["z5"] += a.hr_zone_5_seconds or 0

    return {z: round(v / 60) for z, v in zones.items()}  # minutes


@router.get("/personal-records")
async def personal_records(
    activity_type: str = "running",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All-time PRs: longest, fastest, highest, etc."""
    acts = (await db.execute(
        select(Activity).where(
            and_(Activity.user_id == user.id, Activity.activity_type == activity_type)
        )
    )).scalars().all()
    if not acts:
        return {}

    def best(attr, func=max, filter_none=True):
        vals = [(getattr(a, attr), a) for a in acts if getattr(a, attr) is not None]
        if not vals:
            return None
        best_val, best_act = func(vals, key=lambda x: x[0])
        return {
            "value": best_val,
            "activity_id": best_act.id,
            "activity_name": best_act.name,
            "date": best_act.start_time.isoformat() if best_act.start_time else None,
        }

    return {
        "longest_distance": best("distance_meters"),
        "longest_duration": best("duration_seconds"),
        "most_elevation": best("elevation_gain_m"),
        "fastest_pace": best("avg_pace_per_km", min),
        "highest_hr": best("max_hr"),
        "most_calories": best("calories"),
        "best_tss": best("tss"),
        "best_np": best("normalized_power_watts"),
    }


@router.get("/monthly-summary")
async def monthly_summary(
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Month-by-month summary for the year."""
    if year is None:
        year = datetime.utcnow().year
    start = datetime(year, 1, 1)
    end = datetime(year, 12, 31, 23, 59, 59)

    acts = (await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user.id, Activity.start_time >= start, Activity.start_time <= end))
    )).scalars().all()

    months = {i: {"month": i, "activities": 0, "distance_km": 0, "duration_h": 0, "tss": 0, "elevation_m": 0}
              for i in range(1, 13)}
    for a in acts:
        m = a.start_time.month
        months[m]["activities"] += 1
        months[m]["distance_km"] += round((a.distance_meters or 0) / 1000, 1)
        months[m]["duration_h"] += round((a.duration_seconds or 0) / 3600, 2)
        months[m]["tss"] += a.tss or 0
        months[m]["elevation_m"] += a.elevation_gain_m or 0

    return list(months.values())


@router.get("/training-load")
async def training_load_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Training monotony, strain, and acute:chronic ratio."""
    end = datetime.utcnow()
    start = end - timedelta(days=28)
    acts = (await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user.id, Activity.start_time >= start))
    )).scalars().all()

    # Daily TSS
    daily = {}
    for a in acts:
        d = a.start_time.date().isoformat()
        daily[d] = daily.get(d, 0) + (a.tss or 0)

    weekly_tss = list(daily.values())
    acwr = None
    stats_row = (await db.execute(
        select(AthleteStats).where(AthleteStats.user_id == user.id)
    )).scalar_one_or_none()
    if stats_row and stats_row.atl and stats_row.ctl and stats_row.ctl > 0:
        acwr = round(stats_row.atl / stats_row.ctl, 2)

    return {
        "monotony": training_monotony(weekly_tss),
        "strain": training_strain(weekly_tss),
        "acwr": acwr,
        "weekly_tss": weekly_tss,
        "daily_tss": [{"date": k, "tss": v} for k, v in sorted(daily.items())],
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _weekly_volumes(acts):
    weeks = {}
    for a in acts:
        monday = (a.start_time - timedelta(days=a.start_time.weekday())).date()
        key = monday.isoformat()
        if key not in weeks:
            weeks[key] = {"week": key, "activities": 0, "distance_km": 0,
                          "duration_h": 0, "tss": 0, "elevation_m": 0}
        weeks[key]["activities"] += 1
        weeks[key]["distance_km"] += round((a.distance_meters or 0) / 1000, 1)
        weeks[key]["duration_h"] += round((a.duration_seconds or 0) / 3600, 2)
        weeks[key]["tss"] += round(a.tss or 0, 1)
        weeks[key]["elevation_m"] += round(a.elevation_gain_m or 0)
    return sorted(weeks.values(), key=lambda x: x["week"])


async def _fitness_curve(db, user_id, days=180):
    start = datetime.utcnow() - timedelta(days=days + 42)
    acts = (await db.execute(
        select(Activity)
        .where(and_(Activity.user_id == user_id, Activity.start_time >= start))
        .order_by(Activity.start_time)
    )).scalars().all()

    daily_tss = [(a.start_time, a.tss or 0) for a in acts]
    curve = compute_fitness_fatigue(daily_tss)
    cutoff = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    return [pt for pt in curve if pt["date"] >= cutoff]
