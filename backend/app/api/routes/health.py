"""Health metrics endpoints."""
from datetime import date, timedelta, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc

from app.core.database import get_db
from app.models.models import HealthMetric, User
from app.api.deps import get_current_user

router = APIRouter()


@router.get("")
async def get_health_metrics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not end_date:
        end_date = datetime.utcnow().date()
    if not start_date:
        start_date = end_date - timedelta(days=days)

    result = await db.execute(
        select(HealthMetric)
        .where(and_(
            HealthMetric.user_id == user.id,
            HealthMetric.date >= start_date,
            HealthMetric.date <= end_date,
        ))
        .order_by(HealthMetric.date)
    )
    metrics = result.scalars().all()
    return [_metric_dict(m) for m in metrics]


@router.get("/today")
async def today_health(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    today = datetime.utcnow().date()
    result = await db.execute(
        select(HealthMetric).where(HealthMetric.user_id == user.id, HealthMetric.date == today)
    )
    m = result.scalar_one_or_none()
    return _metric_dict(m) if m else {}


@router.get("/sleep")
async def sleep_data(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    end = datetime.utcnow().date()
    start = end - timedelta(days=days)
    result = await db.execute(
        select(HealthMetric)
        .where(and_(HealthMetric.user_id == user.id, HealthMetric.date >= start))
        .order_by(HealthMetric.date)
    )
    metrics = result.scalars().all()
    return [{
        "date": m.date.isoformat(),
        "duration_hours": round((m.sleep_duration_seconds or 0) / 3600, 2),
        "score": m.sleep_score,
        "deep_h": round((m.deep_sleep_seconds or 0) / 3600, 2),
        "light_h": round((m.light_sleep_seconds or 0) / 3600, 2),
        "rem_h": round((m.rem_sleep_seconds or 0) / 3600, 2),
        "awake_h": round((m.awake_seconds or 0) / 3600, 2),
        "spo2": m.avg_spo2,
        "breathing_rate": m.avg_breathing_rate,
    } for m in metrics]


@router.get("/hrv")
async def hrv_data(
    days: int = Query(60, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    end = datetime.utcnow().date()
    start = end - timedelta(days=days)
    result = await db.execute(
        select(HealthMetric)
        .where(and_(HealthMetric.user_id == user.id, HealthMetric.date >= start,
                    HealthMetric.hrv_last_night.isnot(None)))
        .order_by(HealthMetric.date)
    )
    return [{
        "date": m.date.isoformat(),
        "last_night": m.hrv_last_night,
        "weekly_avg": m.hrv_weekly_avg,
        "status": m.hrv_status,
        "high": m.hrv_5min_high,
        "low": m.hrv_5min_low,
        "resting_hr": m.resting_hr,
    } for m in result.scalars().all()]


@router.get("/body-battery")
async def body_battery(
    days: int = Query(14, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    end = datetime.utcnow().date()
    start = end - timedelta(days=days)
    result = await db.execute(
        select(HealthMetric)
        .where(and_(HealthMetric.user_id == user.id, HealthMetric.date >= start))
        .order_by(HealthMetric.date)
    )
    return [{
        "date": m.date.isoformat(),
        "highest": m.body_battery_highest,
        "lowest": m.body_battery_lowest,
        "charged": m.body_battery_charged,
        "drained": m.body_battery_drained,
        "intraday": m.body_battery_intraday,
    } for m in result.scalars().all()]


@router.get("/{metric_date}/intraday")
async def intraday(
    metric_date: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(HealthMetric).where(
            HealthMetric.user_id == user.id, HealthMetric.date == metric_date
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        return {}
    return {
        "hr": m.hr_intraday or [],
        "stress": m.stress_intraday or [],
        "body_battery": m.body_battery_intraday or [],
        "steps": m.steps_intraday or [],
    }


def _metric_dict(m: HealthMetric) -> dict:
    return {
        "date": m.date.isoformat(),
        "steps": m.steps,
        "resting_hr": m.resting_hr,
        "hrv_last_night": m.hrv_last_night,
        "hrv_weekly_avg": m.hrv_weekly_avg,
        "hrv_status": m.hrv_status,
        "body_battery_highest": m.body_battery_highest,
        "body_battery_lowest": m.body_battery_lowest,
        "avg_stress": m.avg_stress,
        "sleep_duration_h": round((m.sleep_duration_seconds or 0) / 3600, 2),
        "sleep_score": m.sleep_score,
        "deep_sleep_h": round((m.deep_sleep_seconds or 0) / 3600, 2),
        "light_sleep_h": round((m.light_sleep_seconds or 0) / 3600, 2),
        "rem_sleep_h": round((m.rem_sleep_seconds or 0) / 3600, 2),
        "total_calories": m.total_calories,
        "active_calories": m.active_calories,
        "avg_spo2": m.avg_spo2,
        "training_readiness": m.training_readiness,
        "training_readiness_desc": m.training_readiness_desc,
        "vo2max_running": m.vo2max_running,
        "weight_kg": m.weight_kg,
    }
