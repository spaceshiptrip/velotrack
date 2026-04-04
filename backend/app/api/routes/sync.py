"""Garmin sync control endpoints."""
from datetime import date, datetime, timedelta
from typing import Optional
import os
import uuid
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User, Activity, HealthMetric
from app.api.deps import get_current_user

router = APIRouter()


class SyncRequest(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    include_health: bool = True
    include_activities: bool = True


class SyncStatus(BaseModel):
    status: str
    last_sync: Optional[str] = None
    message: Optional[str] = None


class GarminAuthStartRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class GarminAuthVerifyRequest(BaseModel):
    session_id: str
    mfa_code: str


_sync_status = {"status": "idle", "last_sync": None, "message": None}
_garmin_auth_sessions = {}
_garmin_auth_status_cache = {
    "checked_at": None,
    "authenticated": False,
    "message": None,
}


@router.get("/status", response_model=SyncStatus)
async def sync_status():
    return _sync_status


@router.get("/auth-status")
async def garmin_auth_status():
    token_files = [
        name for name in ("oauth1_token.json", "oauth2_token.json")
        if os.path.exists(os.path.join(settings.garmin_tokens_path, name))
    ]
    if not token_files:
        return {
            "authenticated": False,
            "message": f"No Garmin tokens found in {settings.garmin_tokens_path}",
        }

    # Avoid repeatedly logging into Garmin just to paint the UI.
    if (
        _garmin_auth_status_cache["checked_at"] is not None
        and datetime.utcnow() - _garmin_auth_status_cache["checked_at"] < timedelta(minutes=10)
    ):
        return {
            "authenticated": _garmin_auth_status_cache["authenticated"],
            "message": _garmin_auth_status_cache["message"],
        }

    try:
        import garminconnect
        client = garminconnect.Garmin()
        client.login(settings.garmin_tokens_path)
        _garmin_auth_status_cache.update({
            "checked_at": datetime.utcnow(),
            "authenticated": True,
            "message": "Saved Garmin tokens are valid.",
        })
        return {
            "authenticated": True,
            "message": "Saved Garmin tokens are valid.",
        }
    except Exception as e:
        _garmin_auth_status_cache.update({
            "checked_at": datetime.utcnow(),
            "authenticated": False,
            "message": f"Saved Garmin tokens exist but login failed: {e}",
        })
        return {
            "authenticated": False,
            "message": f"Saved Garmin tokens exist but login failed: {e}",
        }


@router.post("/auth/start")
async def start_garmin_auth(
    req: GarminAuthStartRequest,
    user: User = Depends(get_current_user),
):
    try:
        import garminconnect
    except ImportError:
        raise HTTPException(500, "garminconnect not installed")

    os.makedirs(settings.garmin_tokens_path, exist_ok=True)

    try:
        client = garminconnect.Garmin()
        client.login(settings.garmin_tokens_path)
        return {"status": "authenticated", "message": "Saved Garmin tokens are already valid."}
    except Exception:
        pass

    email = req.email or settings.garmin_email
    password = req.password or settings.garmin_password
    if not email or not password:
        raise HTTPException(400, "Garmin credentials are not configured. Set GARMIN_EMAIL and GARMIN_PASSWORD or provide them here.")

    try:
        client = garminconnect.Garmin(
            email=email,
            password=password,
            is_cn=settings.garmin_is_cn,
            return_on_mfa=True,
        )
        result = client.login()
        if isinstance(result, tuple) and result[0] == "needs_mfa":
            session_id = str(uuid.uuid4())
            _garmin_auth_sessions[session_id] = {
                "client": client,
                "challenge": result[1],
                "created_at": datetime.utcnow(),
                "user_id": user.id,
            }
            return {
                "status": "needs_mfa",
                "session_id": session_id,
                "message": "Garmin requested an MFA code. Check your email, then paste the code here.",
            }

        client.garth.dump(settings.garmin_tokens_path)
        _garmin_auth_status_cache.update({
            "checked_at": datetime.utcnow(),
            "authenticated": True,
            "message": f"Garmin authenticated. Tokens saved to {settings.garmin_tokens_path}.",
        })
        return {"status": "authenticated", "message": f"Garmin authenticated. Tokens saved to {settings.garmin_tokens_path}."}
    except Exception as e:
        raise HTTPException(400, f"Garmin authentication failed: {e}")


@router.post("/auth/verify")
async def verify_garmin_auth(
    req: GarminAuthVerifyRequest,
    user: User = Depends(get_current_user),
):
    session = _garmin_auth_sessions.get(req.session_id)
    if not session or session.get("user_id") != user.id:
        raise HTTPException(404, "Garmin authentication session not found or expired.")

    if datetime.utcnow() - session["created_at"] > timedelta(minutes=10):
        _garmin_auth_sessions.pop(req.session_id, None)
        raise HTTPException(410, "Garmin authentication session expired. Start again.")

    try:
        session["client"].resume_login(session["challenge"], req.mfa_code.strip())
        session["client"].garth.dump(settings.garmin_tokens_path)
        _garmin_auth_status_cache.update({
            "checked_at": datetime.utcnow(),
            "authenticated": True,
            "message": f"Garmin authenticated. Tokens saved to {settings.garmin_tokens_path}.",
        })
        _garmin_auth_sessions.pop(req.session_id, None)
        return {"status": "authenticated", "message": f"Garmin authenticated. Tokens saved to {settings.garmin_tokens_path}."}
    except Exception as e:
        raise HTTPException(400, f"Garmin MFA verification failed: {e}")


@router.post("/trigger")
async def trigger_sync(
    req: SyncRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually trigger a Garmin sync."""
    if _sync_status["status"] == "running":
        raise HTTPException(409, "Sync already in progress")

    start = req.start_date or (datetime.utcnow() - timedelta(days=7)).date()
    end = req.end_date or datetime.utcnow().date()

    background_tasks.add_task(_run_sync, user.id, start, end, req.include_activities, req.include_health)
    return {"message": f"Sync started for {start} to {end}"}


@router.post("/backfill")
async def backfill(
    days: int = 90,
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Backfill historical data."""
    end = datetime.utcnow().date()
    start = (datetime.utcnow() - timedelta(days=days)).date()
    background_tasks.add_task(_run_sync, user.id, start, end, True, True)
    return {"message": f"Backfill started: {days} days ({start} to {end})"}


async def _run_sync(user_id: int, start: date, end: date, activities: bool, health: bool):
    """Background sync task."""
    from app.services.garmin_service import GarminSyncService
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import select
    import structlog

    log = structlog.get_logger()
    _sync_status["status"] = "running"
    _sync_status["message"] = f"Syncing {start} to {end}..."

    svc = GarminSyncService(
        email=settings.garmin_email,
        password=settings.garmin_password,
        tokens_path=settings.garmin_tokens_path,
        is_cn=settings.garmin_is_cn,
    )

    try:
        async with AsyncSessionLocal() as db:
            current = start
            while current <= end:
                if health:
                    try:
                        data = await svc.fetch_daily_health(current)
                        await _upsert_health(db, user_id, data)
                    except Exception as e:
                        log.warning("sync.health_failed", date=current, error=str(e))

                current += timedelta(days=1)
            await db.commit()

            if activities:
                acts = await svc.fetch_activities(start, end)
                for act_data in acts:
                    await _upsert_activity(db, user_id, act_data, svc)
                await db.commit()

        _sync_status["status"] = "idle"
        _sync_status["last_sync"] = datetime.utcnow().isoformat()
        _sync_status["message"] = f"Synced {start} to {end}"
        log.info("sync.complete", start=str(start), end=str(end))
    except Exception as e:
        _sync_status["status"] = "error"
        _sync_status["message"] = str(e)
        log.error("sync.failed", error=str(e))


async def _upsert_health(db, user_id, data):
    from sqlalchemy import select
    from app.models.models import HealthMetric
    from dateutil.parser import parse as parse_dt
    import datetime as dt_mod

    d = data.get("date")
    if not d:
        return
    target_date = parse_dt(d).date() if isinstance(d, str) else d
    existing = (await db.execute(
        select(HealthMetric).where(HealthMetric.user_id == user_id, HealthMetric.date == target_date)
    )).scalar_one_or_none()

    if not existing:
        existing = HealthMetric(user_id=user_id, date=target_date)
        db.add(existing)

    for field in ["steps", "resting_hr", "avg_hr", "max_hr", "min_hr",
                  "hrv_weekly_avg", "hrv_last_night", "hrv_status", "hrv_5min_high", "hrv_5min_low",
                  "body_battery_highest", "body_battery_lowest",
                  "avg_stress", "max_stress",
                  "sleep_duration_seconds", "sleep_score", "deep_sleep_seconds",
                  "light_sleep_seconds", "rem_sleep_seconds", "awake_seconds",
                  "avg_spo2", "avg_breathing_rate",
                  "total_calories", "active_calories", "bmr_calories",
                  "training_readiness", "training_readiness_desc",
                  "hr_intraday", "stress_intraday", "body_battery_intraday", "steps_intraday"]:
        if field in data and data[field] is not None:
            setattr(existing, field, data[field])


async def _upsert_activity(db, user_id, act_data, svc):
    from sqlalchemy import select
    from app.models.models import Activity
    gid = act_data.get("garmin_activity_id")
    if gid:
        existing = (await db.execute(
            select(Activity).where(Activity.garmin_activity_id == gid)
        )).scalar_one_or_none()
        if existing:
            return

    from dateutil.parser import parse as parse_dt
    start_time = None
    if act_data.get("start_time"):
        try:
            start_time = parse_dt(act_data["start_time"])
        except Exception:
            pass

    activity = Activity(user_id=user_id, start_time=start_time)
    for field, value in act_data.items():
        if value is None or not hasattr(activity, field):
            continue
        if field == "start_time":
            continue
        setattr(activity, field, value)
    db.add(activity)
    await db.flush()

    # Fetch FIT file for detailed streams
    if gid and act_data.get("has_gps"):
        try:
            fit_bytes = await svc.fetch_activity_fit(gid)
            if fit_bytes:
                from app.services.file_parser import parse_fit
                detailed = parse_fit(fit_bytes)
                activity.gps_track = detailed.get("gps_track")
                activity.hr_stream = detailed.get("hr_stream")
                activity.pace_stream = detailed.get("pace_stream")
                activity.power_stream = detailed.get("power_stream")
                activity.elevation_stream = detailed.get("elevation_stream")
                activity.laps = detailed.get("laps")
                activity.best_efforts = detailed.get("best_efforts")
                activity.power_curve = detailed.get("power_curve")
                activity.sport_details = detailed.get("sport_details")
                activity.sport_streams = detailed.get("sport_streams")
                # Recompute derived stats from the richer FIT detail payload,
                # including HR zone durations.
                from app.services.stats_engine import compute_activity_stats
                derived = compute_activity_stats(detailed)
                for field, value in derived.items():
                    if hasattr(activity, field) and value is not None:
                        setattr(activity, field, value)
        except Exception:
            pass
