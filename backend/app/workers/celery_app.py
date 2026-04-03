"""
Celery worker — background Garmin sync and periodic tasks.
Run with: celery -A app.workers.celery_app worker --loglevel=info
Beat:     celery -A app.workers.celery_app beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab
import structlog

from app.core.config import settings

log = structlog.get_logger()

celery_app = Celery(
    "velotrack",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

# ── Periodic schedule ──────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    # Sync last 2 days every N minutes
    "garmin-incremental-sync": {
        "task": "app.workers.tasks.sync_recent",
        "schedule": settings.garmin_sync_interval * 60,  # seconds
        "args": (2,),  # days to look back
    },
    # Recompute fitness curve daily at 03:00
    "recompute-fitness-curve": {
        "task": "app.workers.tasks.recompute_fitness_all",
        "schedule": crontab(hour=3, minute=0),
    },
}
