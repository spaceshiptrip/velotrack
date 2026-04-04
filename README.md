# 🏃 VeloTrack

**Self-hosted Garmin activity dashboard** — a modern replacement for Garmin Connect, combining the best of Runalyze, Intervals.icu, and more.

![VeloTrack Dashboard](docs/preview.png)

## ✨ Features

### 🗄️ Data Sources
- **Garmin Connect API** — automatic sync via `python-garminconnect`
- **GPX / FIT file upload** — drag & drop or bulk import
- **Real-time tracking** — live GPS via Garmin LiveTrack or self-hosted websocket endpoint
- **GitHub Pages mode** — no server needed, analyze GPX files locally in-browser

### 📊 Analytics (Runalyze + Intervals.icu + more)
- **All activity types**: Running, Cycling, Swimming, Hiking, Pickleball, Weights, HIIT, Rowing, and any custom type
- **Advanced metrics**: VO2max, TRIMP, TSS, ATL/CTL/TSB (fitness/fatigue/form), Training Load, Monotony, Strain
- **Pace/Power analysis**: Power curve, critical power, W', Normalized Power, Efficiency Factor
- **Heart Rate zones**: Custom zone builder, time-in-zone, HRV trends, aerobic decoupling
- **Running dynamics**: Cadence, ground contact time, stride length, vertical oscillation
- **Elevation**: Gain/loss, grade-adjusted pace, VAM
- **Swim metrics**: SWOLF, stroke rate, DPS
- **GPS analysis**: Route replay, segment matching, heat maps, best efforts

### 🗺️ Route Planning (BRouter Integration)
- **BRouter server** — bundled in Docker, or point to any endpoint
- Profile-based routing (road, MTB, hiking, etc.)
- Waypoint editor, turn-by-turn, export to GPX/FIT
- Segment library & strava-style segment detection

### 📡 Real-time Tracking
- **Server mode**: WebSocket endpoint, map clients connect live
- **Garmin LiveTrack**: Ingest official Garmin sharing links
- **Mobile**: PWA-ready, share your location from phone

### 🐳 Deployment Modes
| Mode | Description |
|------|-------------|
| **Docker Compose** | Full stack: backend + PostgreSQL + BRouter + frontend |
| **Local dev** | `pnpm dev` + `uvicorn` |
| **GitHub Pages** | Static frontend only, GPX analysis, no auth needed |
| **Remote server** | Set `VITE_API_URL` to your server URL |

---

## 🚀 Quick Start (Docker)

```bash
git clone https://github.com/yourname/velotrack
cd velotrack
cp .env.example .env
# Edit .env with your Garmin credentials
docker compose up -d
```

Open **http://localhost:5173** (frontend) or **http://localhost:8000/docs** (API).

---

## 🔧 Configuration

See [docs/configuration.md](docs/configuration.md) for full env var reference.

Key variables:
```env
GARMIN_EMAIL=you@example.com
GARMIN_PASSWORD=your_password
DATABASE_URL=postgresql+asyncpg://velotrack:secret@db/velotrack
BROUTER_ENDPOINT=http://brouter:17777
SECRET_KEY=generate-a-random-string
```

---

## 📁 Project Structure

```
velotrack/
├── backend/           # FastAPI Python backend
│   ├── app/
│   │   ├── api/       # REST + WebSocket routes
│   │   ├── core/      # Config, auth, DB session
│   │   ├── models/    # SQLAlchemy models
│   │   ├── services/  # Garmin sync, GPX parsing, stats
│   │   └── workers/   # Background tasks (APScheduler)
│   └── alembic/       # DB migrations
├── frontend/          # React + Vite + TypeScript
│   └── src/
│       ├── components/
│       │   ├── dashboard/   # Overview, fitness charts
│       │   ├── activities/  # List, detail, lap analysis
│       │   ├── map/         # Leaflet map components
│       │   ├── charts/      # Recharts wrappers
│       │   ├── realtime/    # Live tracking UI
│       │   └── routing/     # BRouter route planner
│       ├── pages/
│       ├── store/       # Zustand state
│       └── hooks/
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── brouter/
├── docker-compose.yml
├── docker-compose.dev.yml
└── scripts/
    ├── import_garmin.py   # Bulk historical import
    └── seed_demo.py       # Demo data generator
```

---

## 🌐 GitHub Pages Mode

The frontend can run **without any backend**. Just:
1. Open the hosted GitHub Pages URL
2. Drop a `.gpx` file → full analysis runs in-browser (using gpxparser + pure JS)
3. Optionally set a **Server URL** in settings to connect to your backend

---

## 📖 Docs

- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [BRouter Setup](docs/brouter.md)
- [Real-time Tracking](docs/realtime.md)
- [GitHub Pages Deploy](docs/gh-pages.md)

---

## 🚀 Personal Server Deployment Notes

You can deploy this project to your own server with plain `docker compose`.

Keep a persistent `garmin_tokens/` directory in the repo root, next to `docker-compose.yml`:

```text
velotrack/
├── docker-compose.yml
├── docker-compose.dev.yml
├── garmin_tokens/
└── ...
```

That directory is bind-mounted into the backend containers and is where Garmin authentication tokens are stored and refreshed.

### Recommended Server Setup

```bash
git clone <your-repo-url>
cd velotrack
cp .env.example .env
mkdir -p garmin_tokens
docker compose up -d --build
```

### Garmin Authentication on a Server

The app supports Garmin's 2-step login flow:

1. Enter Garmin username and password in the app UI
2. Garmin sends an MFA code
3. Paste the MFA code into the app
4. The app saves reusable Garmin tokens into `./garmin_tokens`

After that, normal syncs should reuse the saved tokens without requiring you to log in each time.

### When Tokens Expire

If Garmin invalidates the saved tokens later:

1. Open the app
2. Re-authenticate Garmin in the UI
3. Complete the MFA step again if prompted
4. New tokens will be saved to `./garmin_tokens`

You should not need to keep using an external downloader script and manually copying tokens during normal operation.

### Existing Tokens From Another Machine

You can optionally copy an existing Garmin token set from another machine:

```bash
mkdir -p garmin_tokens
cp ~/.garminconnect/oauth1_token.json ./garmin_tokens/
cp ~/.garminconnect/oauth2_token.json ./garmin_tokens/
```

This is optional. The server can also generate its own fresh tokens through the app UI.

### Important Notes

- Do not bake Garmin tokens into Docker images.
- Do not commit `garmin_tokens/` to git.
- Keep `garmin_tokens/` on persistent storage so tokens survive restarts and rebuilds.
- Store Garmin credentials in `.env` if you want the server to use them as the default login fallback.
