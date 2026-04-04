"""Activities CRUD and analytics endpoints."""
from typing import Optional
from datetime import datetime, date
import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc

from app.core.database import get_db
from app.models.models import Activity, User
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/recent")
async def recent_activities(
    limit: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Activity)
        .where(Activity.user_id == user.id)
        .order_by(desc(Activity.start_time))
        .limit(limit)
    )
    return [_summary(a) for a in result.scalars().all()]


@router.get("/types")
async def activity_types(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Activity.activity_type, func.count(Activity.id).label("count"))
        .where(Activity.user_id == user.id)
        .group_by(Activity.activity_type)
        .order_by(desc("count"))
    )
    return [{"type": r[0], "count": r[1]} for r in result.all()]


@router.get("/compare/best-efforts")
async def compare_best_efforts(
    activity_type: str = "running",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Activity).where(
            and_(
                Activity.user_id == user.id,
                Activity.activity_type == activity_type,
                Activity.best_efforts.isnot(None),
            )
        ).order_by(desc(Activity.start_time))
    )
    best_by_dist = {}
    for act in result.scalars().all():
        for effort in (act.best_efforts or []):
            d = effort["distance_m"]
            if d not in best_by_dist or effort["time_s"] < best_by_dist[d]["time_s"]:
                best_by_dist[d] = {**effort, "activity_id": act.id, "activity_name": act.name,
                                   "date": act.start_time.isoformat() if act.start_time else None}
    return sorted(best_by_dist.values(), key=lambda x: x["distance_m"])


@router.get("")
async def list_activities(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    activity_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Activity).where(Activity.user_id == user.id)
    if activity_type:
        query = query.where(Activity.activity_type == activity_type)
    if start_date:
        query = query.where(Activity.start_time >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(Activity.start_time <= datetime.combine(end_date, datetime.max.time()))
    if search:
        query = query.where(Activity.name.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    query = query.order_by(desc(Activity.start_time)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    return {"total": total, "page": page, "per_page": per_page,
            "activities": [_summary(a) for a in result.scalars().all()]}


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    activity = await _get_or_404(db, activity_id, user.id)
    return _detail(activity)


@router.get("/{activity_id}/streams")
async def get_streams(
    activity_id: int,
    streams: str = Query("hr,pace,power,elevation,gps"),
    gps_mode: str = Query("full", pattern="^(full|downsampled)$"),
    gps_max_points: int = Query(2000, ge=100, le=10000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    activity = await _get_or_404(db, activity_id, user.id)
    requested = set(streams.split(","))
    result = {}
    if "hr" in requested: result["hr"] = activity.hr_stream or []
    if "pace" in requested: result["pace"] = activity.pace_stream or []
    if "power" in requested: result["power"] = activity.power_stream or []
    if "elevation" in requested: result["elevation"] = activity.elevation_stream or []
    if "gps" in requested:
        gps_track = activity.gps_track or []
        gps_points, gps_meta = _prepare_gps_stream(gps_track, gps_mode, gps_max_points)
        result["gps"] = gps_points
        result["gps_meta"] = gps_meta
    if "cadence" in requested: result["cadence"] = activity.cadence_stream or []
    if "sport" in requested: result["sport"] = activity.sport_streams or {}
    return result


@router.get("/{activity_id}/laps")
async def get_laps(activity_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    activity = await _get_or_404(db, activity_id, user.id)
    return activity.laps or []


@router.get("/{activity_id}/best-efforts")
async def get_best_efforts(activity_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    activity = await _get_or_404(db, activity_id, user.id)
    return activity.best_efforts or []


@router.get("/{activity_id}/power-curve")
async def get_power_curve(activity_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    activity = await _get_or_404(db, activity_id, user.id)
    return activity.power_curve or []


@router.delete("/{activity_id}")
async def delete_activity(activity_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    activity = await _get_or_404(db, activity_id, user.id)
    await db.delete(activity)
    return {"deleted": activity_id}


async def _get_or_404(db, activity_id, user_id):
    result = await db.execute(
        select(Activity).where(and_(Activity.id == activity_id, Activity.user_id == user_id))
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(404, "Activity not found")
    return activity


def _summary(a):
    return {
        "id": a.id, "garmin_activity_id": a.garmin_activity_id,
        "name": a.name, "activity_type": a.activity_type,
        "start_time": a.start_time.isoformat() if a.start_time else None,
        "duration_seconds": a.duration_seconds, "distance_meters": a.distance_meters,
        "elevation_gain_m": a.elevation_gain_m, "avg_hr": a.avg_hr, "max_hr": a.max_hr,
        "calories": a.calories, "avg_pace_per_km": a.avg_pace_per_km,
        "avg_power_watts": a.avg_power_watts, "normalized_power_watts": a.normalized_power_watts,
        "tss": a.tss, "trimp": a.trimp, "has_gps": a.has_gps,
        "start_lat": a.start_lat, "start_lon": a.start_lon,
        "aerobic_training_effect": a.aerobic_training_effect,
        "anaerobic_training_effect": a.anaerobic_training_effect,
        "avg_speed_ms": a.avg_speed_ms,
    }


def _prepare_gps_stream(gps_track, gps_mode: str, gps_max_points: int):
    total_points = len(gps_track)
    if gps_mode != "downsampled" or total_points <= gps_max_points:
        return gps_track, {
            "mode": "full",
            "total_points": total_points,
            "returned_points": total_points,
            "downsampled": False,
        }

    step = max(1, math.ceil(total_points / gps_max_points))
    sampled = gps_track[::step]
    if sampled and sampled[-1] != gps_track[-1]:
        sampled.append(gps_track[-1])

    return sampled, {
        "mode": "downsampled",
        "total_points": total_points,
        "returned_points": len(sampled),
        "downsampled": True,
        "step": step,
    }


def _detail(a):
    return {**_summary(a), "sub_type": a.sub_type, "timezone": a.timezone,
            "elapsed_seconds": a.elapsed_seconds, "moving_seconds": a.moving_seconds,
            "max_speed_ms": a.max_speed_ms, "elevation_loss_m": a.elevation_loss_m,
            "min_elevation_m": a.min_elevation_m, "max_elevation_m": a.max_elevation_m,
            "min_hr": a.min_hr, "avg_cadence": a.avg_cadence, "max_cadence": a.max_cadence,
            "max_power_watts": a.max_power_watts, "intensity_factor": a.intensity_factor,
            "efficiency_factor": a.efficiency_factor, "aerobic_decoupling": a.aerobic_decoupling,
            "avg_stride_length_m": a.avg_stride_length_m,
            "avg_vertical_oscillation_cm": a.avg_vertical_oscillation_cm,
            "avg_ground_contact_ms": a.avg_ground_contact_ms,
            "avg_vertical_ratio": a.avg_vertical_ratio,
            "pool_length_m": a.pool_length_m, "avg_swolf": a.avg_swolf,
            "avg_stroke_rate": a.avg_stroke_rate, "stroke_type": a.stroke_type,
            "hr_zone_1_seconds": a.hr_zone_1_seconds, "hr_zone_2_seconds": a.hr_zone_2_seconds,
            "hr_zone_3_seconds": a.hr_zone_3_seconds, "hr_zone_4_seconds": a.hr_zone_4_seconds,
            "hr_zone_5_seconds": a.hr_zone_5_seconds,
            "training_load_acute": a.training_load_acute, "training_load_chronic": a.training_load_chronic,
            "bounding_box": a.bounding_box, "source": a.source,
            "sport_details": a.sport_details, "sport_streams": a.sport_streams,
            "created_at": a.created_at.isoformat() if a.created_at else None}
