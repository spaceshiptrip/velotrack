"""File upload endpoint — GPX and FIT files."""
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from dateutil.parser import parse as parse_dt

from app.core.database import get_db
from app.models.models import Activity, User
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/gpx")
async def upload_gpx(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50MB)")
    try:
        from app.services.file_parser import parse_gpx
        data = parse_gpx(content)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse GPX: {e}")
    return await _save_activity(db, user, data, "gpx")


@router.post("/fit")
async def upload_fit(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50MB)")
    try:
        from app.services.file_parser import parse_fit
        data = parse_fit(content)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse FIT: {e}")
    return await _save_activity(db, user, data, "fit")


@router.post("/bulk")
async def upload_bulk(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    results = []
    errors = []
    for f in files[:50]:
        content = await f.read()
        try:
            name_lower = (f.filename or "").lower()
            if name_lower.endswith(".gpx"):
                from app.services.file_parser import parse_gpx
                data = parse_gpx(content)
                source = "gpx"
            elif name_lower.endswith(".fit"):
                from app.services.file_parser import parse_fit
                data = parse_fit(content)
                source = "fit"
            else:
                errors.append({"file": f.filename, "error": "Unsupported file type"})
                continue
            act = await _save_activity(db, user, data, source)
            results.append({"file": f.filename, "activity_id": act["id"]})
        except Exception as e:
            errors.append({"file": f.filename, "error": str(e)})
    return {"imported": len(results), "errors": errors, "activities": results}


async def _save_activity(db, user, data, source):
    # Check duplicate
    gid = data.get("garmin_activity_id")
    if gid:
        existing = (await db.execute(
            select(Activity).where(Activity.garmin_activity_id == gid)
        )).scalar_one_or_none()
        if existing:
            return {"id": existing.id, "name": existing.name,
                    "activity_type": existing.activity_type, "duplicate": True}

    start_time = None
    if data.get("start_time"):
        try:
            start_time = parse_dt(data["start_time"])
            if start_time.tzinfo:
                start_time = start_time.replace(tzinfo=None)
        except Exception:
            pass

    # Build activity with only fields that exist on the model
    activity = Activity(
        user_id=user.id,
        name=data.get("name") or "Imported Activity",
        activity_type=data.get("activity_type") or "other",
        sub_type=data.get("sub_type"),
        start_time=start_time,
        duration_seconds=data.get("duration_seconds"),
        elapsed_seconds=data.get("elapsed_seconds"),
        distance_meters=data.get("distance_meters"),
        elevation_gain_m=data.get("elevation_gain_m"),
        elevation_loss_m=data.get("elevation_loss_m"),
        min_elevation_m=data.get("min_elevation_m"),
        max_elevation_m=data.get("max_elevation_m"),
        avg_hr=data.get("avg_hr"),
        max_hr=data.get("max_hr"),
        calories=data.get("calories"),
        avg_cadence=data.get("avg_cadence"),
        avg_power_watts=data.get("avg_power_watts"),
        max_power_watts=data.get("max_power_watts"),
        normalized_power_watts=data.get("normalized_power_watts"),
        avg_pace_per_km=data.get("avg_pace_s_per_km"),
        avg_speed_ms=data.get("avg_speed_ms"),
        tss=data.get("tss"),
        trimp=data.get("trimp"),
        intensity_factor=data.get("intensity_factor"),
        efficiency_factor=data.get("efficiency_factor"),
        has_gps=bool(data.get("has_gps") or data.get("gps_track")),
        start_lat=data.get("start_lat"),
        start_lon=data.get("start_lon"),
        gps_track=data.get("gps_track"),
        hr_stream=data.get("hr_stream"),
        pace_stream=data.get("pace_stream"),
        power_stream=data.get("power_stream"),
        elevation_stream=data.get("elevation_stream"),
        laps=data.get("laps"),
        best_efforts=data.get("best_efforts"),
        power_curve=data.get("power_curve"),
        sport_details=data.get("sport_details"),
        sport_streams=data.get("sport_streams"),
        source=source,
    )
    db.add(activity)
    await db.flush()
    return {"id": activity.id, "name": activity.name, "activity_type": activity.activity_type}
