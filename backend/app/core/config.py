"""Application settings via pydantic-settings."""
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "VeloTrack"
    debug: bool = False
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    access_token_expire_minutes: int = 10080  # 7 days

    # Database
    database_url: str = "postgresql+asyncpg://velotrack:velotrack_secret@localhost/velotrack"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Garmin
    garmin_email: Optional[str] = None
    garmin_password: Optional[str] = None
    garmin_is_cn: bool = False
    garmin_sync_interval: int = 30  # minutes
    garmin_initial_backfill_days: int = 90
    garmin_fetch_selection: str = "activities,health,sleep,hrv,body_battery,stress,steps"
    garmin_tokens_path: str = "/app/garmin_tokens"

    # BRouter — defaults to bundled container; set to https://brouter.de/brouter for public server
    brouter_endpoint: str = "http://brouter:17777"

    # File storage
    fit_files_path: str = "/app/fit_files"

    # CORS
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    # Units (metric | imperial)
    default_units: str = "metric"

    @property
    def fetch_types(self) -> List[str]:
        return [s.strip() for s in self.garmin_fetch_selection.split(",")]


settings = Settings()
