"""
Garmin Connect sync service.
Auth pattern: try saved garth tokens first, fall back to credentials.
"""
from __future__ import annotations
import os
import structlog
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

log = structlog.get_logger()


class GarminSyncService:

    def __init__(self, email: str, password: str, tokens_path: str, is_cn: bool = False):
        self.email = email
        self.password = password
        self.tokens_path = tokens_path
        self.is_cn = is_cn
        self._client = None

    async def get_client(self):
        if self._client:
            return self._client

        try:
            import garminconnect
        except ImportError:
            raise RuntimeError("garminconnect not installed")

        os.makedirs(self.tokens_path, exist_ok=True)

        # Match the known-good flow from the standalone downloader:
        # try token login with a bare Garmin client first, then fall back to credentials.
        try:
            client = garminconnect.Garmin()
            client.login(self.tokens_path)
            self._client = client
            log.info("garmin.login_from_token")
            return self._client
        except Exception as e:
            log.warning("garmin.token_login_failed", error=str(e), tokens_path=self.tokens_path)

        if not self.email or not self.password:
            raise RuntimeError(
                f"Garmin token login failed and no GARMIN_EMAIL/GARMIN_PASSWORD fallback is configured. "
                f"Expected tokens at {self.tokens_path}."
            )

        try:
            client = garminconnect.Garmin(
                email=self.email,
                password=self.password,
                is_cn=self.is_cn,
            )
            client.login()
            try:
                client.garth.dump(self.tokens_path)
            except Exception as dump_error:
                log.warning("garmin.token_dump_failed", error=str(dump_error), tokens_path=self.tokens_path)
            self._client = client
            log.info("garmin.login_from_credentials")
            return self._client
        except Exception as e:
            log.error("garmin.login_failed", error=str(e))
            raise

    # ── Activities ────────────────────────────────────────────────────────────

    async def fetch_activities(self, start_date: date, end_date: date) -> List[Dict]:
        client = await self.get_client()
        activities = []
        try:
            raw = client.get_activities_by_date(
                start_date.isoformat(),
                end_date.isoformat(),
            )
            for act in raw:
                activities.append(self._normalize_activity(act))
            log.info("garmin.activities_fetched", count=len(activities))
        except Exception as e:
            log.error("garmin.activities_failed", error=str(e))
        return activities

    async def fetch_activity_fit(self, activity_id: str) -> Optional[bytes]:
        client = await self.get_client()
        try:
            # Download as zip (ORIGINAL), extract the .fit file
            import zipfile, io
            zip_bytes = client.download_activity(
                activity_id,
                dl_fmt=client.ActivityDownloadFormat.ORIGINAL,
            )
            if not zip_bytes:
                return None
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                fit_files = [n for n in z.namelist() if n.lower().endswith('.fit')]
                if fit_files:
                    return z.read(fit_files[0])
            return None
        except Exception as e:
            log.error("garmin.fit_download_failed", id=activity_id, error=str(e))
            return None

    # ── Health Data ───────────────────────────────────────────────────────────

    async def fetch_daily_health(self, target_date: date) -> Dict:
        client = await self.get_client()
        d = target_date.isoformat()
        health = {"date": d}

        fetchers = [
            ("steps",           lambda: client.get_steps_data(d)),
            ("hr",              lambda: client.get_heart_rates(d)),
            ("hrv",             lambda: client.get_hrv_data(d)),
            ("stress",          lambda: client.get_stress_data(d)),
            ("body_battery",    lambda: client.get_body_battery(d)),
            ("sleep",           lambda: client.get_sleep_data(d)),
            ("calories",        lambda: client.get_daily_calories_burned(d) if hasattr(client, 'get_daily_calories_burned') else client.get_calories_burned(d) if hasattr(client, 'get_calories_burned') else None),
            ("training_ready",  lambda: client.get_training_readiness(d)),
        ]

        for name, fn in fetchers:
            try:
                raw = fn()
                self._parse_health(health, name, raw)
            except Exception as e:
                log.warning(f"garmin.{name}_failed", date=d, error=str(e))

        return health

    def _parse_health(self, health: Dict, name: str, raw: Any):
        if not raw:
            return

        if name == "steps":
            total = sum(s.get("steps", 0) for s in raw)
            health["steps"] = total
            health["steps_intraday"] = [
                {"time": s.get("startGMT"), "steps": s.get("steps", 0)}
                for s in raw
            ]

        elif name == "hr":
            health["resting_hr"] = raw.get("restingHeartRate")
            intraday = raw.get("heartRateValues", [])
            health["hr_intraday"] = [{"time": v[0], "hr": v[1]} for v in intraday if v[1]]
            hrs = [v[1] for v in intraday if v[1]]
            if hrs:
                health["avg_hr"] = round(sum(hrs) / len(hrs), 1)
                health["max_hr"] = max(hrs)
                health["min_hr"] = min(hrs)

        elif name == "hrv":
            summary = raw.get("hrvSummary", {})
            health["hrv_weekly_avg"] = summary.get("weeklyAvg")
            health["hrv_last_night"] = summary.get("lastNight")
            health["hrv_status"] = summary.get("status")
            health["hrv_5min_high"] = summary.get("lastNight5MinHigh")
            health["hrv_5min_low"] = summary.get("lastNight5MinLow")

        elif name == "stress":
            health["avg_stress"] = raw.get("avgStressLevel")
            health["max_stress"] = raw.get("maxStressLevel")
            vals = raw.get("stressValuesArray", [])
            health["stress_intraday"] = [
                {"time": v[0], "stress": v[1]} for v in vals if v[1] and v[1] > 0
            ]

        elif name == "body_battery":
            if isinstance(raw, list) and raw:
                values = raw[0].get("bodyBatteryValuesArray", [])
                if values:
                    levels = [v[1] for v in values if v[1] is not None]
                    health["body_battery_highest"] = max(levels) if levels else None
                    health["body_battery_lowest"] = min(levels) if levels else None
                    health["body_battery_intraday"] = [
                        {"time": v[0], "level": v[1]} for v in values if v[1] is not None
                    ]

        elif name == "sleep":
            daily = raw.get("dailySleepDTO", {})
            health["sleep_duration_seconds"] = daily.get("sleepTimeSeconds")
            health["sleep_score"] = daily.get("sleepScores", {}).get("overall", {}).get("value")
            health["deep_sleep_seconds"] = daily.get("deepSleepSeconds")
            health["light_sleep_seconds"] = daily.get("lightSleepSeconds")
            health["rem_sleep_seconds"] = daily.get("remSleepSeconds")
            health["awake_seconds"] = daily.get("awakeSleepSeconds")
            health["avg_spo2"] = daily.get("averageSpO2Value")
            health["avg_breathing_rate"] = daily.get("averageRespirationValue")

        elif name == "calories":
            health["total_calories"] = raw.get("totalKilocalories")
            health["active_calories"] = raw.get("activeKilocalories")
            health["bmr_calories"] = raw.get("bmrKilocalories")

        elif name == "training_ready":
            if isinstance(raw, list) and raw:
                tr = raw[0]
                health["training_readiness"] = tr.get("score")
                health["training_readiness_desc"] = tr.get("levelDescription")

    # ── Normalizers ───────────────────────────────────────────────────────────

    def _normalize_activity(self, raw: Dict) -> Dict:
        act_type = self._garmin_type_to_internal(
            raw.get("activityType", {}).get("typeKey", "other")
            if isinstance(raw.get("activityType"), dict)
            else str(raw.get("activityType", "other"))
        )

        start = raw.get("startTimeLocal") or raw.get("startTimeGMT")
        if start and isinstance(start, str):
            from dateutil.parser import parse
            start = parse(start)

        timezone = raw.get("timeZoneId")
        if timezone is not None:
            timezone = str(timezone)

        return {
            "garmin_activity_id": str(raw.get("activityId", "")),
            "name": raw.get("activityName", "Activity"),
            "activity_type": act_type,
            "start_time": start.isoformat() if start else None,
            "timezone": timezone,
            "duration_seconds": raw.get("duration"),
            "elapsed_seconds": raw.get("elapsedDuration"),
            "moving_seconds": raw.get("movingDuration"),
            "distance_meters": raw.get("distance"),
            "avg_speed_ms": raw.get("averageSpeed"),
            "max_speed_ms": raw.get("maxSpeed"),
            "elevation_gain_m": raw.get("elevationGain"),
            "elevation_loss_m": raw.get("elevationLoss"),
            "avg_hr": raw.get("averageHR"),
            "max_hr": raw.get("maxHR"),
            "calories": raw.get("calories"),
            "avg_cadence": (
                raw.get("averageRunningCadenceInStepsPerMinute")
                or raw.get("averageBikingCadenceInRevPerMinute")
            ),
            "avg_power_watts": raw.get("avgPower"),
            "max_power_watts": raw.get("maxPower"),
            "normalized_power_watts": raw.get("normPower"),
            "avg_stride_length_m": raw.get("avgStrideLength"),
            "avg_vertical_oscillation_cm": raw.get("avgVerticalOscillation"),
            "avg_ground_contact_ms": raw.get("groundContactTime"),
            "avg_vertical_ratio": raw.get("avgVerticalRatio"),
            "aerobic_training_effect": raw.get("aerobicTrainingEffect"),
            "anaerobic_training_effect": raw.get("anaerobicTrainingEffect"),
            "training_load_acute": raw.get("trainingLoadAcute"),
            "training_load_chronic": raw.get("trainingLoadChronic"),
            "has_gps": raw.get("hasPolyline", False),
            "source": "garmin",
        }

    @staticmethod
    def _garmin_type_to_internal(garmin_type: str) -> str:
        mapping = {
            "running": "running",
            "trail_running": "trail_running",
            "cycling": "cycling",
            "mountain_biking": "mountain_biking",
            "gravel_cycling": "gravel_cycling",
            "indoor_cycling": "indoor_cycling",
            "lap_swimming": "swimming",
            "open_water_swimming": "open_water_swimming",
            "hiking": "hiking",
            "walking": "walking",
            "rowing": "rowing",
            "strength_training": "strength_training",
            "fitness_equipment": "elliptical",
            "hiit": "hiit",
            "yoga": "yoga",
            "pilates": "pilates",
            "crossfit": "crossfit",
            "pickleball": "pickleball",
            "tennis": "tennis",
            "basketball": "basketball",
            "soccer": "soccer",
        }
        return mapping.get(garmin_type.lower().replace(" ", "_"), "other")
