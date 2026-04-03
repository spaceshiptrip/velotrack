"""Celery task definitions."""
import asyncio
from datetime import datetime, timedelta
import structlog

from app.workers.celery_app import celery_app
from app.core.config import settings

log = structlog.get_logger()


def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.workers.tasks.sync_recent", bind=True, max_retries=3)
def sync_recent(self, days: int = 2):
    """Sync the last N days of Garmin data."""
    if not settings.garmin_email or not settings.garmin_password:
        log.warning("tasks.sync_recent: no garmin credentials configured")
        return {"status": "skipped", "reason": "no credentials"}

    end = datetime.utcnow().date()
    start = (datetime.utcnow() - timedelta(days=days)).date()
    log.info("tasks.sync_recent.start", start=str(start), end=str(end))

    try:
        result = _run(_do_sync(start, end))
        log.info("tasks.sync_recent.done", **result)
        return result
    except Exception as exc:
        log.error("tasks.sync_recent.failed", error=str(exc))
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery_app.task(name="app.workers.tasks.sync_range")
def sync_range(start_date: str, end_date: str, user_id: int = 1):
    """Sync a specific date range (for manual backfill)."""
    from datetime import date
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    log.info("tasks.sync_range.start", start=start_date, end=end_date)
    result = _run(_do_sync(start, end, user_id=user_id))
    log.info("tasks.sync_range.done", **result)
    return result


@celery_app.task(name="app.workers.tasks.recompute_fitness_all")
def recompute_fitness_all():
    """Recompute ATL/CTL/TSB for all users."""
    result = _run(_recompute_fitness())
    return result


async def _do_sync(start, end, user_id: int = 1):
    """Core async sync logic — shared between tasks."""
    from app.services.garmin_service import GarminSyncService
    from app.core.database import AsyncSessionLocal
    from app.models.models import Activity, HealthMetric
    from sqlalchemy import select
    from dateutil.parser import parse as parse_dt

    svc = GarminSyncService(
        email=settings.garmin_email,
        password=settings.garmin_password,
        tokens_path=settings.garmin_tokens_path,
        is_cn=settings.garmin_is_cn,
    )

    activities_synced = 0
    health_days_synced = 0
    errors = []

    async with AsyncSessionLocal() as db:
        # ── Health metrics ────────────────────────────────────────────────
        if "health" in settings.fetch_types or "steps" in settings.fetch_types:
            from datetime import timedelta
            current = start
            while current <= end:
                try:
                    data = await svc.fetch_daily_health(current)
                    await _upsert_health_metric(db, user_id, data)
                    health_days_synced += 1
                except Exception as e:
                    errors.append(f"health {current}: {e}")
                current += timedelta(days=1)

        # ── Activities ────────────────────────────────────────────────────
        if "activities" in settings.fetch_types:
            try:
                acts = await svc.fetch_activities(start, end)
                for act_data in acts:
                    gid = act_data.get("garmin_activity_id")
                    if gid:
                        existing = (await db.execute(
                            select(Activity).where(Activity.garmin_activity_id == gid)
                        )).scalar_one_or_none()
                        if existing:
                            continue

                    start_time = None
                    if act_data.get("start_time"):
                        try:
                            st = act_data["start_time"]
                            start_time = parse_dt(st) if isinstance(st, str) else st
                            if hasattr(start_time, 'tzinfo') and start_time.tzinfo:
                                start_time = start_time.replace(tzinfo=None)
                        except Exception:
                            pass

                    activity = Activity(user_id=user_id, start_time=start_time)
                    for field, val in act_data.items():
                        if hasattr(activity, field) and val is not None:
                            setattr(activity, field, val)
                    db.add(activity)
                    await db.flush()

                    # Fetch FIT file for GPS/stream data
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
                                # Update computed stats from detailed data
                                from app.services.stats_engine import compute_activity_stats
                                derived = compute_activity_stats(detailed)
                                for k, v in derived.items():
                                    if hasattr(activity, k) and v is not None:
                                        setattr(activity, k, v)
                        except Exception as e:
                            errors.append(f"FIT {gid}: {e}")

                    activities_synced += 1

            except Exception as e:
                errors.append(f"activities fetch: {e}")

        await db.commit()

    return {
        "status": "done",
        "activities_synced": activities_synced,
        "health_days_synced": health_days_synced,
        "errors": errors[:10],  # cap error list
    }


async def _upsert_health_metric(db, user_id: int, data: dict):
    from app.models.models import HealthMetric
    from sqlalchemy import select
    from dateutil.parser import parse as parse_dt
    import datetime as dt_mod

    d = data.get("date")
    if not d:
        return
    target_date = parse_dt(d).date() if isinstance(d, str) else d

    existing = (await db.execute(
        select(HealthMetric).where(
            HealthMetric.user_id == user_id,
            HealthMetric.date == target_date
        )
    )).scalar_one_or_none()

    if not existing:
        existing = HealthMetric(user_id=user_id, date=target_date)
        db.add(existing)

    FIELDS = [
        "steps", "step_goal", "resting_hr", "avg_hr", "max_hr", "min_hr",
        "hrv_status", "hrv_weekly_avg", "hrv_last_night", "hrv_5min_high", "hrv_5min_low",
        "body_battery_charged", "body_battery_drained", "body_battery_highest", "body_battery_lowest",
        "avg_stress", "max_stress",
        "sleep_duration_seconds", "sleep_score", "deep_sleep_seconds", "light_sleep_seconds",
        "rem_sleep_seconds", "awake_seconds", "avg_spo2", "avg_breathing_rate",
        "total_calories", "active_calories", "bmr_calories",
        "moderate_intensity_minutes", "vigorous_intensity_minutes",
        "training_readiness", "training_readiness_desc", "vo2max_running", "vo2max_cycling",
        "hr_intraday", "stress_intraday", "body_battery_intraday", "steps_intraday",
    ]
    for field in FIELDS:
        val = data.get(field)
        if val is not None:
            setattr(existing, field, val)


async def _recompute_fitness():
    """Recompute ATL/CTL/TSB for all users from stored activities."""
    from app.core.database import AsyncSessionLocal
    from app.models.models import Activity, AthleteStats, User
    from app.services.stats_engine import compute_fitness_fatigue
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User).where(User.is_active == True))).scalars().all()
        for user in users:
            acts = (await db.execute(
                select(Activity.start_time, Activity.tss)
                .where(Activity.user_id == user.id)
                .order_by(Activity.start_time)
            )).all()

            if not acts:
                continue

            daily_tss = [(row[0], row[1] or 0) for row in acts if row[0]]
            curve = compute_fitness_fatigue(daily_tss)

            if not curve:
                continue

            last = curve[-1]
            stats = (await db.execute(
                select(AthleteStats).where(AthleteStats.user_id == user.id)
            )).scalar_one_or_none()

            if not stats:
                stats = AthleteStats(user_id=user.id)
                db.add(stats)

            stats.ctl = last["ctl"]
            stats.atl = last["atl"]
            stats.tsb = last["tsb"]

        await db.commit()
    return {"status": "done", "users": len(users)}
