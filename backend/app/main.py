"""VeloTrack Backend — FastAPI application entry point."""
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api.router import api_router
from app.api.websockets import ws_router

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    log.info("VeloTrack starting", version="1.0.0")
    # Create tables if not using alembic migrations
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Database ready")
    yield
    log.info("VeloTrack shutting down")
    await engine.dispose()


app = FastAPI(
    title="VeloTrack API",
    description="Self-hosted Garmin activity dashboard backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server and production frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST API routes
app.include_router(api_router, prefix="/api/v1")

# WebSocket routes
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
