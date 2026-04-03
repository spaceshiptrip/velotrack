"""Main API router — aggregates all sub-routers."""
from fastapi import APIRouter

from app.api.routes import activities, health, stats, sync, routing, upload, realtime, auth

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(activities.router, prefix="/activities", tags=["activities"])
api_router.include_router(health.router, prefix="/health-metrics", tags=["health"])
api_router.include_router(stats.router, prefix="/stats", tags=["stats"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(routing.router, prefix="/routing", tags=["routing"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(realtime.router, prefix="/tracking", tags=["tracking"])
