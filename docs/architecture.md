# VeloTrack Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VeloTrack Stack                         │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐  │
│  │   Frontend   │   │   Backend    │   │     BRouter       │  │
│  │  React/Vite  │◄─►│   FastAPI    │   │  Routing Engine   │  │
│  │  Port 5173   │   │  Port 8000   │◄─►│   Port 17777      │  │
│  └──────────────┘   └──────┬───────┘   └───────────────────┘  │
│                             │                                   │
│                    ┌────────┼────────┐                         │
│                    ▼        ▼        ▼                         │
│               ┌────────┐ ┌─────┐ ┌──────┐                     │
│               │Postgres│ │Redis│ │Celery│                     │
│               │  DB    │ │Cache│ │Worker│                     │
│               └────────┘ └─────┘ └──────┘                     │
│                                                                 │
│  External: Garmin Connect API ─────────────────────────────►   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Activity Sync (Garmin → VeloTrack)
```
Garmin Connect API
      │
      ▼
GarminSyncService.fetch_activities()
      │  └── fetch_activity_fit() → FIT binary
      ▼
file_parser.parse_fit()
      │  ├── GPS track extraction
      │  ├── HR/pace/power streams
      │  ├── Lap data
      │  └── Best efforts computation
      ▼
stats_engine.compute_activity_stats()
      │  ├── TSS (power or HR-based)
      │  ├── TRIMP (Banister + Edwards)
      │  ├── NP, IF, EF, aerobic decoupling
      │  ├── VAM, Grade-Adjusted Pace
      │  └── VO2max estimate
      ▼
PostgreSQL (Activity table)
      │
      ▼
stats_engine.compute_fitness_fatigue()
      │  ├── CTL (42-day EMA of TSS)
      │  ├── ATL (7-day EMA of TSS)
      │  └── TSB = CTL - ATL
      ▼
PostgreSQL (AthleteStats table)
```

### GPX Upload (Local or Server)
```
User drops .gpx file
      │
      ├── [Server mode] POST /api/v1/upload/gpx
      │         └── file_parser.parse_gpx()
      │                   └── save to Activity table
      │
      └── [Local mode / GitHub Pages]
                analyzeGpxLocally() in browser
                        └── display results (no save)
```

### Route Planning (BRouter)
```
User clicks map → waypoints
      │
      ▼
POST /api/v1/routing/calculate
      │
      ▼
BRouter HTTP API: /brouter?lonlats=...&profile=trekking
      │
      ▼
GeoJSON route → rendered on Leaflet map
      │
      └── Optional: save as SavedRoute
```

### Live Tracking
```
Athlete starts session (POST /tracking/sessions)
      │
      ├── Viewers connect: WebSocket /ws/live/{session_id}
      │
      └── Athlete sends points (POST /tracking/sessions/{id}/points)
              │
              ▼
          broadcast_track_point() → all WebSocket listeners
```

## Key Computed Metrics

| Metric | Formula | Purpose |
|--------|---------|---------|
| **TSS** | (duration × NP × IF) / (FTP × 3600) × 100 | Quantify training stress |
| **CTL** | EMA of TSS over 42 days | Chronic fitness |
| **ATL** | EMA of TSS over 7 days | Acute fatigue |
| **TSB** | CTL − ATL | Race readiness |
| **ACWR** | ATL / CTL | Injury risk indicator |
| **NP** | (30s rolling avg)⁴ mean ^0.25 | Normalized power |
| **IF** | NP / FTP | Workout intensity |
| **EF** | NP (or speed) / avg HR | Aerobic efficiency |
| **Decoupling** | (first half EF − second half EF) / first half EF | Cardiac drift |
| **TRIMP** | duration × HRR × 0.64 × e^(k×HRR) | HR training load |
| **GAP** | pace / grade_factor(grade%) | Grade-adjusted running pace |
| **VAM** | elev_gain_m / duration_s × 3600 | Climbing speed (m/h) |

## Database Schema

### Activity (key fields)
- All GPS streams stored as JSON arrays (gps_track, hr_stream, pace_stream, power_stream, elevation_stream)
- Best efforts cached per activity
- Power curve (MMP) cached per activity
- HR zone times pre-computed

### HealthMetric (daily)
- One row per user per day
- Intraday data (HR, stress, body battery, steps) as JSON arrays

### AthleteStats (rolling)
- One row per user
- Current CTL/ATL/TSB
- FTP, threshold pace, VO2max, max HR

## GitHub Pages Mode

When `VITE_API_URL` is empty:
- All analysis runs client-side (Web Workers future plan)
- `analyzeGpxLocally()` in `hooks/useApi.ts` uses `gpxparser` npm package
- No data is sent anywhere — fully private
- Limited to: GPS, elevation, HR from GPX extensions
- Full server features require backend connection

## BRouter Segment Files

BRouter uses `.rd5` binary segment files tiled at 5°×5° resolution.
Download for your region:
```bash
python scripts/download_brouter_segments.py --region pacific-northwest
```

Available regions: `north-america-west`, `north-america-east`, `western-europe`,
`central-europe`, `uk-ireland`, `australia`, `japan`, `pacific-northwest`, `california`

Or use the online BRouter server:
```
BROUTER_ENDPOINT=https://brouter.de/brouter
```
(rate-limited, not recommended for production)
