"""BRouter integration for route planning."""
import httpx
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models.models import User, SavedRoute
from app.api.deps import get_current_user

router = APIRouter()


class Waypoint(BaseModel):
    lat: float
    lon: float
    name: Optional[str] = None


class RouteRequest(BaseModel):
    waypoints: List[Waypoint]
    profile: str = "trekking"  # trekking, fastbike, hiking, road
    alternativeidx: int = 0
    format: str = "geojson"


class SaveRouteRequest(BaseModel):
    name: str
    description: Optional[str] = None
    activity_type: str = "cycling"
    profile: str = "trekking"
    gpx_data: Optional[str] = None
    waypoints: Optional[List[Waypoint]] = None
    track_geojson: Optional[dict] = None
    distance_meters: Optional[float] = None
    elevation_gain_m: Optional[float] = None


@router.post("/calculate")
async def calculate_route(req: RouteRequest):
    """Calculate a route via BRouter server."""
    if len(req.waypoints) < 2:
        raise HTTPException(400, "At least 2 waypoints required")

    # Build BRouter lonlats param: lon1,lat1|lon2,lat2|...
    lonlats = "|".join(f"{wp.lon},{wp.lat}" for wp in req.waypoints)
    params = {
        "lonlats": lonlats,
        "profile": req.profile,
        "alternativeidx": req.alternativeidx,
        "format": req.format,
        "trackFormat": "geojson",
    }

    brouter_url = f"{settings.brouter_endpoint}/brouter"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(brouter_url, params=params)
            resp.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(503, f"BRouter server unreachable at {settings.brouter_endpoint}. "
                                  "Start the brouter container or set BROUTER_ENDPOINT.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"BRouter error: {e.response.text[:200]}")

    if req.format == "geojson":
        return resp.json()
    return {"gpx": resp.text}


@router.get("/profiles")
async def list_profiles():
    """List available BRouter routing profiles."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.brouter_endpoint}/brouter/profiles")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    # Default profiles
    return [
        {"id": "trekking", "label": "Trekking / Touring", "sport": "cycling"},
        {"id": "fastbike", "label": "Road Bike / Fast", "sport": "cycling"},
        {"id": "hiking", "label": "Hiking / Trail", "sport": "hiking"},
        {"id": "road", "label": "Road Safety", "sport": "cycling"},
        {"id": "gravel", "label": "Gravel / Mixed", "sport": "cycling"},
    ]


@router.get("/status")
async def brouter_status():
    """Check if BRouter server is running."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.brouter_endpoint}/brouter/version")
            return {"online": True, "endpoint": settings.brouter_endpoint, "version": resp.text.strip()}
    except Exception as e:
        return {"online": False, "endpoint": settings.brouter_endpoint, "error": str(e)}


@router.get("/saved")
async def list_saved_routes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(SavedRoute).where(SavedRoute.user_id == user.id))
    routes = result.scalars().all()
    return [_route_summary(r) for r in routes]


@router.post("/saved")
async def save_route(
    req: SaveRouteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    route = SavedRoute(
        user_id=user.id,
        name=req.name,
        description=req.description,
        activity_type=req.activity_type,
        brouter_profile=req.profile,
        gpx_data=req.gpx_data,
        waypoints=[wp.dict() for wp in req.waypoints] if req.waypoints else None,
        track_geojson=req.track_geojson,
        distance_meters=req.distance_meters,
        elevation_gain_m=req.elevation_gain_m,
    )
    db.add(route)
    await db.flush()
    return {"id": route.id, "name": route.name}


@router.get("/saved/{route_id}")
async def get_saved_route(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedRoute).where(SavedRoute.id == route_id, SavedRoute.user_id == user.id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(404, "Route not found")
    return _route_detail(route)


@router.delete("/saved/{route_id}")
async def delete_route(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedRoute).where(SavedRoute.id == route_id, SavedRoute.user_id == user.id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(404, "Route not found")
    await db.delete(route)
    return {"deleted": route_id}


def _route_summary(r):
    return {
        "id": r.id, "name": r.name, "activity_type": r.activity_type,
        "profile": r.brouter_profile, "distance_meters": r.distance_meters,
        "elevation_gain_m": r.elevation_gain_m, "created_at": r.created_at.isoformat(),
    }

def _route_detail(r):
    return {**_route_summary(r), "description": r.description,
            "waypoints": r.waypoints, "track_geojson": r.track_geojson,
            "gpx_data": r.gpx_data}
