#!/usr/bin/env python3
"""
VeloTrack — Garmin Historical Import
Backfill activities and health data from Garmin Connect.

Usage:
    python scripts/import_garmin.py --days 365
    python scripts/import_garmin.py --start 2023-01-01 --end 2024-01-01
    python scripts/import_garmin.py --start 2023-01-01  # end = today

Requires GARMIN_EMAIL and GARMIN_PASSWORD in .env or environment.
"""
import asyncio
import sys
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
os.chdir(Path(__file__).parent.parent / "backend")

from dotenv import load_dotenv
load_dotenv("../.env")
load_dotenv(".env")

from app.core.config import settings


async def main():
    parser = argparse.ArgumentParser(description="Import historical Garmin data")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--days", type=int, default=90, help="Days to backfill (default: 90)")
    group.add_argument("--start", type=str, help="Start date YYYY-MM-DD")
    parser.add_argument("--end", type=str, help="End date YYYY-MM-DD (default: today)")
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--no-health", action="store_true", help="Skip health metrics")
    parser.add_argument("--no-activities", action="store_true", help="Skip activities")
    parser.add_argument("--rate-limit", type=float, default=3.0, help="Seconds between daily API calls")
    args = parser.parse_args()

    if not settings.garmin_email or not settings.garmin_password:
        print("✗ GARMIN_EMAIL and GARMIN_PASSWORD must be set in .env")
        sys.exit(1)

    from datetime import date
    end_date = date.fromisoformat(args.end) if args.end else date.today()
    if args.start:
        start_date = date.fromisoformat(args.start)
    else:
        start_date = end_date - timedelta(days=args.days)

    print(f"VeloTrack Historical Import")
    print(f"  Range:      {start_date} → {end_date} ({(end_date - start_date).days} days)")
    print(f"  Activities: {'no' if args.no_activities else 'yes'}")
    print(f"  Health:     {'no' if args.no_health else 'yes'}")
    print(f"  Rate limit: {args.rate_limit}s between calls")
    print()

    from app.workers.tasks import _do_sync, _upsert_health_metric
    from app.services.garmin_service import GarminSyncService
    from app.core.database import AsyncSessionLocal

    svc = GarminSyncService(
        email=settings.garmin_email,
        password=settings.garmin_password,
        tokens_path=settings.garmin_tokens_path,
        is_cn=settings.garmin_is_cn,
    )

    print("Authenticating with Garmin Connect...")
    await svc.get_client()
    print("✓ Authenticated\n")

    total_acts = 0
    total_health = 0
    errors = []

    # Process day by day for health, batch for activities
    if not args.no_health:
        current = start_date
        total_days = (end_date - start_date).days + 1
        day_num = 0
        async with AsyncSessionLocal() as db:
            while current <= end_date:
                day_num += 1
                pct = int((day_num / total_days) * 100)
                print(f"\r  Health [{pct:3d}%] {current}...", end="", flush=True)
                try:
                    data = await svc.fetch_daily_health(current)
                    await _upsert_health_metric(db, args.user_id, data)
                    total_health += 1
                    if day_num % 10 == 0:
                        await db.commit()
                except Exception as e:
                    errors.append(f"health {current}: {e}")
                await asyncio.sleep(args.rate_limit)
                current += timedelta(days=1)
            await db.commit()
        print(f"\r  Health ✓ {total_health} days synced           ")

    if not args.no_activities:
        print(f"  Activities: fetching {start_date} → {end_date}...")
        try:
            acts = await svc.fetch_activities(start_date, end_date)
            print(f"  Found {len(acts)} activities")
            from app.workers.tasks import _do_sync
            async with AsyncSessionLocal() as db:
                from app.models.models import Activity
                from sqlalchemy import select
                from dateutil.parser import parse as parse_dt
                for i, act_data in enumerate(acts, 1):
                    print(f"\r  Activities [{i}/{len(acts)}] {act_data.get('name', '?')[:40]}...", end="", flush=True)
                    gid = act_data.get("garmin_activity_id")
                    if gid:
                        existing = (await db.execute(
                            select(Activity).where(Activity.garmin_activity_id == gid)
                        )).scalar_one_or_none()
                        if existing:
                            continue

                    start_time = None
                    if act_data.get("start_time"):
                        try:
                            start_time = parse_dt(act_data["start_time"])
                        except Exception:
                            pass

                    activity = Activity(user_id=args.user_id, start_time=start_time)
                    for field, val in act_data.items():
                        if hasattr(activity, field) and val is not None:
                            setattr(activity, field, val)
                    db.add(activity)
                    await db.flush()

                    # Fetch FIT for GPS data
                    if gid and act_data.get("has_gps"):
                        try:
                            fit_bytes = await svc.fetch_activity_fit(gid)
                            if fit_bytes:
                                from app.services.file_parser import parse_fit
                                detailed = parse_fit(fit_bytes)
                                activity.gps_track = detailed.get("gps_track")
                                activity.hr_stream = detailed.get("hr_stream")
                                activity.pace_stream = detailed.get("pace_stream")
                                activity.power_stream = detailed.get("power_stream")
                                activity.elevation_stream = detailed.get("elevation_stream")
                                activity.laps = detailed.get("laps")
                                activity.best_efforts = detailed.get("best_efforts")
                                activity.power_curve = detailed.get("power_curve")
                        except Exception as e:
                            errors.append(f"FIT {gid}: {e}")
                        await asyncio.sleep(args.rate_limit)

                    total_acts += 1
                    if i % 5 == 0:
                        await db.commit()

                await db.commit()
        except Exception as e:
            errors.append(f"activities: {e}")
        print(f"\r  Activities ✓ {total_acts} synced                    ")

    print()
    print(f"✓ Import complete!")
    print(f"  Health days:  {total_health}")
    print(f"  Activities:   {total_acts}")
    if errors:
        print(f"  Errors ({len(errors)}):")
        for e in errors[:10]:
            print(f"    - {e}")


if __name__ == "__main__":
    asyncio.run(main())
