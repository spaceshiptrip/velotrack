"""Real-time tracking endpoints."""
import uuid
import secrets
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import User, LiveSession
from app.api.deps import get_current_user

router = APIRouter()


class StartSessionRequest(BaseModel):
    name: Optional[str] = None
    activity_type: str = "other"
    garmin_livetrack_url: Optional[str] = None


class TrackPoint(BaseModel):
    lat: float
    lon: float
    ele: Optional[float] = None
    hr: Optional[float] = None
    speed: Optional[float] = None
    time: Optional[str] = None


@router.post("/sessions")
async def start_session(
    req: StartSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = LiveSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=req.name or f"Live {req.activity_type.replace('_',' ').title()}",
        activity_type=req.activity_type,
        share_token=secrets.token_urlsafe(32),
        track_points=[],
        garmin_livetrack_url=req.garmin_livetrack_url,
    )
    db.add(session)
    await db.flush()
    return {
        "session_id": session.id,
        "share_token": session.share_token,
        "share_url": f"/live/{session.share_token}",
    }


@router.post("/sessions/{session_id}/points")
async def add_track_point(
    session_id: str,
    point: TrackPoint,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _get_session(db, session_id, user.id)
    points = list(session.track_points or [])
    points.append({
        "lat": point.lat, "lon": point.lon, "ele": point.ele,
        "hr": point.hr, "speed": point.speed,
        "time": point.time or datetime.utcnow().isoformat(),
    })
    session.track_points = points
    await db.flush()
    # Broadcast via WebSocket
    from app.api.websockets import broadcast_track_point
    await broadcast_track_point(session_id, points[-1])
    return {"points": len(points)}


@router.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _get_session(db, session_id, user.id)
    session.is_active = False
    session.ended_at = datetime.utcnow()
    return {"ended": True, "points": len(session.track_points or [])}


@router.get("/sessions/active")
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LiveSession).where(LiveSession.user_id == user.id, LiveSession.is_active == True)
    )
    return [_session_dict(s) for s in result.scalars().all()]


@router.get("/live/{share_token}")
async def get_live_by_token(share_token: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — no auth needed for viewing."""
    result = await db.execute(
        select(LiveSession).where(LiveSession.share_token == share_token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Live session not found")
    return _session_dict(session)


async def _get_session(db, session_id, user_id):
    result = await db.execute(
        select(LiveSession).where(LiveSession.id == session_id, LiveSession.user_id == user_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Session not found")
    return s


def _session_dict(s):
    return {
        "id": s.id, "name": s.name, "activity_type": s.activity_type,
        "is_active": s.is_active, "started_at": s.started_at.isoformat(),
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "share_token": s.share_token,
        "point_count": len(s.track_points or []),
        "track_points": s.track_points or [],
    }
