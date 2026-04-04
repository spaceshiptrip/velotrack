"""Database models for VeloTrack."""
from datetime import datetime, date
from typing import Optional, List
import uuid

from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, Date, Text,
    ForeignKey, JSON, Enum as SAEnum, BigInteger, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


# ─── Activity Types ──────────────────────────────────────────────────────────

ACTIVITY_TYPES = [
    "running", "trail_running", "cycling", "road_cycling", "mountain_biking",
    "gravel_cycling", "indoor_cycling", "swimming", "open_water_swimming",
    "hiking", "walking", "rowing", "kayaking", "skiing", "snowboarding",
    "crossfit", "hiit", "strength_training", "yoga", "pilates",
    "pickleball", "tennis", "basketball", "soccer", "volleyball",
    "elliptical", "stair_climbing", "other"
]


# ─── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    activities: Mapped[List["Activity"]] = relationship(back_populates="user")
    health_metrics: Mapped[List["HealthMetric"]] = relationship(back_populates="user")
    athlete_stats: Mapped[Optional["AthleteStats"]] = relationship(back_populates="user", uselist=False)


# ─── Activity ─────────────────────────────────────────────────────────────────

class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (
        Index("ix_activities_user_start", "user_id", "start_time"),
        Index("ix_activities_garmin_id", "garmin_activity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    garmin_activity_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True)

    # Core fields
    name: Mapped[str] = mapped_column(String(255), default="Activity")
    activity_type: Mapped[str] = mapped_column(String(50), default="other")
    sub_type: Mapped[Optional[str]] = mapped_column(String(50))  # e.g., "road", "trail"
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timezone: Mapped[Optional[str]] = mapped_column(String(50))
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    elapsed_seconds: Mapped[Optional[float]] = mapped_column(Float)
    moving_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Distance / Speed
    distance_meters: Mapped[Optional[float]] = mapped_column(Float)
    avg_speed_ms: Mapped[Optional[float]] = mapped_column(Float)
    max_speed_ms: Mapped[Optional[float]] = mapped_column(Float)
    avg_pace_per_km: Mapped[Optional[float]] = mapped_column(Float)  # seconds/km
    max_pace_per_km: Mapped[Optional[float]] = mapped_column(Float)

    # Elevation
    elevation_gain_m: Mapped[Optional[float]] = mapped_column(Float)
    elevation_loss_m: Mapped[Optional[float]] = mapped_column(Float)
    min_elevation_m: Mapped[Optional[float]] = mapped_column(Float)
    max_elevation_m: Mapped[Optional[float]] = mapped_column(Float)

    # Heart rate
    avg_hr: Mapped[Optional[float]] = mapped_column(Float)
    max_hr: Mapped[Optional[float]] = mapped_column(Float)
    min_hr: Mapped[Optional[float]] = mapped_column(Float)

    # Calories
    calories: Mapped[Optional[float]] = mapped_column(Float)
    active_calories: Mapped[Optional[float]] = mapped_column(Float)

    # Cadence
    avg_cadence: Mapped[Optional[float]] = mapped_column(Float)
    max_cadence: Mapped[Optional[float]] = mapped_column(Float)

    # Power (cycling/running)
    avg_power_watts: Mapped[Optional[float]] = mapped_column(Float)
    max_power_watts: Mapped[Optional[float]] = mapped_column(Float)
    normalized_power_watts: Mapped[Optional[float]] = mapped_column(Float)

    # Running dynamics
    avg_stride_length_m: Mapped[Optional[float]] = mapped_column(Float)
    avg_vertical_oscillation_cm: Mapped[Optional[float]] = mapped_column(Float)
    avg_ground_contact_ms: Mapped[Optional[float]] = mapped_column(Float)
    avg_vertical_ratio: Mapped[Optional[float]] = mapped_column(Float)
    avg_ground_contact_balance: Mapped[Optional[float]] = mapped_column(Float)

    # Swim metrics
    pool_length_m: Mapped[Optional[float]] = mapped_column(Float)
    avg_swolf: Mapped[Optional[float]] = mapped_column(Float)
    avg_stroke_rate: Mapped[Optional[float]] = mapped_column(Float)
    stroke_type: Mapped[Optional[str]] = mapped_column(String(30))
    total_strokes: Mapped[Optional[int]] = mapped_column(Integer)
    avg_dps: Mapped[Optional[float]] = mapped_column(Float)  # distance per stroke

    # Training metrics (computed)
    tss: Mapped[Optional[float]] = mapped_column(Float)         # Training Stress Score
    trimp: Mapped[Optional[float]] = mapped_column(Float)       # TRIMP (monotony)
    intensity_factor: Mapped[Optional[float]] = mapped_column(Float)
    efficiency_factor: Mapped[Optional[float]] = mapped_column(Float)
    aerobic_decoupling: Mapped[Optional[float]] = mapped_column(Float)
    hrss: Mapped[Optional[float]] = mapped_column(Float)        # HR-based stress score
    training_load: Mapped[Optional[float]] = mapped_column(Float)

    # HR zones time (seconds in each zone 1-5)
    hr_zone_1_seconds: Mapped[Optional[float]] = mapped_column(Float)
    hr_zone_2_seconds: Mapped[Optional[float]] = mapped_column(Float)
    hr_zone_3_seconds: Mapped[Optional[float]] = mapped_column(Float)
    hr_zone_4_seconds: Mapped[Optional[float]] = mapped_column(Float)
    hr_zone_5_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Power zones (cycling)
    power_zone_1_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_2_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_3_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_4_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_5_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_6_seconds: Mapped[Optional[float]] = mapped_column(Float)
    power_zone_7_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Garmin-specific
    aerobic_training_effect: Mapped[Optional[float]] = mapped_column(Float)
    anaerobic_training_effect: Mapped[Optional[float]] = mapped_column(Float)
    training_load_acute: Mapped[Optional[float]] = mapped_column(Float)
    training_load_chronic: Mapped[Optional[float]] = mapped_column(Float)

    # GPS
    has_gps: Mapped[bool] = mapped_column(Boolean, default=False)
    start_lat: Mapped[Optional[float]] = mapped_column(Float)
    start_lon: Mapped[Optional[float]] = mapped_column(Float)
    bounding_box: Mapped[Optional[dict]] = mapped_column(JSON)  # {n,s,e,w}

    # Raw / computed data (stored as JSON arrays for charts)
    gps_track: Mapped[Optional[dict]] = mapped_column(JSON)      # [{lat,lon,ele,time}]
    hr_stream: Mapped[Optional[dict]] = mapped_column(JSON)      # [{t, hr}]
    pace_stream: Mapped[Optional[dict]] = mapped_column(JSON)    # [{t, pace}]
    power_stream: Mapped[Optional[dict]] = mapped_column(JSON)   # [{t, watts}]
    elevation_stream: Mapped[Optional[dict]] = mapped_column(JSON)
    cadence_stream: Mapped[Optional[dict]] = mapped_column(JSON)
    laps: Mapped[Optional[dict]] = mapped_column(JSON)           # [{lap_num, dist, time, pace, hr, ...}]
    best_efforts: Mapped[Optional[dict]] = mapped_column(JSON)   # [{dist, time, pace}]
    power_curve: Mapped[Optional[dict]] = mapped_column(JSON)    # [{duration_s, watts}]
    sport_details: Mapped[Optional[dict]] = mapped_column(JSON)  # sport-specific summary metrics
    sport_streams: Mapped[Optional[dict]] = mapped_column(JSON)  # sport-specific time series

    # Source tracking
    source: Mapped[str] = mapped_column(String(20), default="garmin")  # garmin|gpx|fit|manual
    fit_file_path: Mapped[Optional[str]] = mapped_column(String(500))
    gpx_file_path: Mapped[Optional[str]] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="activities")


# ─── Health Metrics (daily) ───────────────────────────────────────────────────

class HealthMetric(Base):
    __tablename__ = "health_metrics"
    __table_args__ = (
        Index("ix_health_user_date", "user_id", "date", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)

    # Steps
    steps: Mapped[Optional[int]] = mapped_column(Integer)
    step_goal: Mapped[Optional[int]] = mapped_column(Integer)
    distance_m: Mapped[Optional[float]] = mapped_column(Float)

    # Heart rate
    resting_hr: Mapped[Optional[float]] = mapped_column(Float)
    avg_hr: Mapped[Optional[float]] = mapped_column(Float)
    max_hr: Mapped[Optional[float]] = mapped_column(Float)
    min_hr: Mapped[Optional[float]] = mapped_column(Float)

    # HRV
    hrv_status: Mapped[Optional[str]] = mapped_column(String(30))
    hrv_weekly_avg: Mapped[Optional[float]] = mapped_column(Float)
    hrv_last_night: Mapped[Optional[float]] = mapped_column(Float)
    hrv_5min_high: Mapped[Optional[float]] = mapped_column(Float)
    hrv_5min_low: Mapped[Optional[float]] = mapped_column(Float)

    # Body battery
    body_battery_charged: Mapped[Optional[float]] = mapped_column(Float)
    body_battery_drained: Mapped[Optional[float]] = mapped_column(Float)
    body_battery_highest: Mapped[Optional[float]] = mapped_column(Float)
    body_battery_lowest: Mapped[Optional[float]] = mapped_column(Float)

    # Stress
    avg_stress: Mapped[Optional[float]] = mapped_column(Float)
    max_stress: Mapped[Optional[float]] = mapped_column(Float)
    rest_stress_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    low_stress_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    medium_stress_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    high_stress_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)

    # Sleep
    sleep_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    sleep_score: Mapped[Optional[float]] = mapped_column(Float)
    deep_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    light_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    rem_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    awake_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    sleep_start: Mapped[Optional[datetime]] = mapped_column(DateTime)
    sleep_end: Mapped[Optional[datetime]] = mapped_column(DateTime)
    avg_spo2: Mapped[Optional[float]] = mapped_column(Float)
    avg_breathing_rate: Mapped[Optional[float]] = mapped_column(Float)

    # Calories
    total_calories: Mapped[Optional[int]] = mapped_column(Integer)
    active_calories: Mapped[Optional[int]] = mapped_column(Integer)
    bmr_calories: Mapped[Optional[int]] = mapped_column(Integer)

    # Intensity minutes
    moderate_intensity_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    vigorous_intensity_minutes: Mapped[Optional[int]] = mapped_column(Integer)

    # Body metrics
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    body_fat_pct: Mapped[Optional[float]] = mapped_column(Float)
    muscle_mass_kg: Mapped[Optional[float]] = mapped_column(Float)
    bone_mass_kg: Mapped[Optional[float]] = mapped_column(Float)
    bmi: Mapped[Optional[float]] = mapped_column(Float)

    # Advanced (Garmin)
    training_readiness: Mapped[Optional[float]] = mapped_column(Float)
    training_readiness_desc: Mapped[Optional[str]] = mapped_column(String(50))
    vo2max_running: Mapped[Optional[float]] = mapped_column(Float)
    vo2max_cycling: Mapped[Optional[float]] = mapped_column(Float)
    endurance_score: Mapped[Optional[float]] = mapped_column(Float)

    # Intraday data (JSON arrays for charts)
    hr_intraday: Mapped[Optional[dict]] = mapped_column(JSON)    # [{time, hr}]
    stress_intraday: Mapped[Optional[dict]] = mapped_column(JSON)
    body_battery_intraday: Mapped[Optional[dict]] = mapped_column(JSON)
    steps_intraday: Mapped[Optional[dict]] = mapped_column(JSON)
    spo2_intraday: Mapped[Optional[dict]] = mapped_column(JSON)

    user: Mapped["User"] = relationship(back_populates="health_metrics")


# ─── Athlete Stats (computed rolling window) ──────────────────────────────────

class AthleteStats(Base):
    """Computed fitness metrics: ATL, CTL, TSB, VO2max, FTP, etc."""
    __tablename__ = "athlete_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    # Performance benchmarks
    ftp_watts: Mapped[Optional[float]] = mapped_column(Float)         # Functional Threshold Power
    threshold_pace_secs: Mapped[Optional[float]] = mapped_column(Float)  # sec/km at LT2
    vo2max: Mapped[Optional[float]] = mapped_column(Float)
    max_hr: Mapped[Optional[int]] = mapped_column(Integer)
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer)
    lthr: Mapped[Optional[float]] = mapped_column(Float)              # Lactate Threshold HR

    # Training load (current values)
    ctl: Mapped[Optional[float]] = mapped_column(Float)               # Chronic Training Load (fitness)
    atl: Mapped[Optional[float]] = mapped_column(Float)               # Acute Training Load (fatigue)
    tsb: Mapped[Optional[float]] = mapped_column(Float)               # Training Stress Balance (form)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user: Mapped["User"] = relationship(back_populates="athlete_stats")


# ─── Live Tracking Session ────────────────────────────────────────────────────

class LiveSession(Base):
    __tablename__ = "live_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    activity_type: Mapped[str] = mapped_column(String(50), default="other")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    share_token: Mapped[str] = mapped_column(String(64), unique=True)  # public sharing link
    track_points: Mapped[Optional[dict]] = mapped_column(JSON)          # [{lat,lon,ele,hr,speed,time}]
    garmin_livetrack_url: Mapped[Optional[str]] = mapped_column(String(500))


# ─── Saved Routes ─────────────────────────────────────────────────────────────

class SavedRoute(Base):
    __tablename__ = "saved_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    activity_type: Mapped[str] = mapped_column(String(50), default="cycling")
    brouter_profile: Mapped[str] = mapped_column(String(50), default="trekking")
    distance_meters: Mapped[Optional[float]] = mapped_column(Float)
    elevation_gain_m: Mapped[Optional[float]] = mapped_column(Float)
    gpx_data: Mapped[Optional[str]] = mapped_column(Text)           # full GPX XML
    waypoints: Mapped[Optional[dict]] = mapped_column(JSON)          # [{lat, lon, name}]
    track_geojson: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
