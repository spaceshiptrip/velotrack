"""WebSocket endpoints for real-time tracking."""
import json
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

ws_router = APIRouter()

_connections: Dict[str, Set[WebSocket]] = {}


@ws_router.websocket("/ws/live/{session_id}")
async def live_tracking_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if session_id not in _connections:
        _connections[session_id] = set()
    _connections[session_id].add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        _connections[session_id].discard(websocket)
        if not _connections[session_id]:
            del _connections[session_id]


async def broadcast_track_point(session_id: str, point: dict):
    if session_id not in _connections:
        return
    dead = set()
    msg = json.dumps({"type": "point", "data": point})
    for ws in _connections[session_id]:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _connections[session_id] -= dead
