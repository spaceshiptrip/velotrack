#!/usr/bin/env bash
# ============================================================
#  VeloTrack — Quick Setup Script
#  Usage: bash setup.sh [--docker | --dev | --ghpages | --with-brouter]
# ============================================================
set -e

MODE="${1:---docker}"
RESET='\033[0m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'

info()  { echo -e "${CYAN}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
error() { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

banner() {
cat << 'BANNER'

  ╦  ╦╔═╗╦  ╔═╗╔╦╗╦═╗╔═╗╔═╗╦╔═
  ╚╗╔╝║╣ ║  ║ ║ ║ ╠╦╝╠═╣║  ╠╩╗
   ╚╝ ╚═╝╩═╝╚═╝ ╩ ╩╚═╩ ╩╚═╝╩ ╩
  Self-Hosted Garmin Activity Dashboard

BANNER
}

banner

# ── Docker mode (default) ──────────────────────────────────────────────────────
if [[ "$MODE" == "--docker" || "$MODE" == "--with-brouter" ]]; then
  info "Setting up VeloTrack with Docker Compose"

  command -v docker &>/dev/null || error "Docker not found. Install from https://docs.docker.com/get-docker/"
  docker compose version &>/dev/null || error "Docker Compose plugin not found."

  if [[ ! -f .env ]]; then
    cp .env.example .env
    ok "Created .env from .env.example"
    warn "Edit .env and set GARMIN_EMAIL, GARMIN_PASSWORD, and a SECRET_KEY"
    warn "Generate a key: openssl rand -hex 32"
    echo ""
    read -p "Press Enter after editing .env, or Ctrl+C to exit now..."
  fi

  # Auto-generate SECRET_KEY if still placeholder
  if grep -q "CHANGE_ME" .env 2>/dev/null; then
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32)
    sed -i.bak "s/CHANGE_ME_generate_with_openssl_rand_hex_32/$SECRET/" .env && rm -f .env.bak
    ok "Generated SECRET_KEY"
  fi

  info "Building containers (backend, frontend, worker, scheduler)..."
  docker compose build --parallel

  info "Starting core services..."
  docker compose up -d

  if [[ "$MODE" == "--with-brouter" ]]; then
    info "Starting BRouter routing engine..."
    warn "BRouter uses platform: linux/amd64 — on Apple Silicon this runs via Rosetta."
    warn "First start downloads routing profiles (~5MB). Segments need manual download."
    docker compose --profile routing up -d brouter
    echo ""
    info "Download routing segments for your region:"
    echo "  python scripts/download_brouter_segments.py --region pacific-northwest"
    echo "  Then: docker compose restart brouter"
  else
    echo ""
    warn "BRouter (route planner) not started. To enable it:"
    warn "  bash setup.sh --with-brouter"
    warn "  OR: docker compose --profile routing up -d brouter"
    warn "  OR: set BROUTER_ENDPOINT=https://brouter.de/brouter in .env (uses public server)"
  fi

  echo ""
  ok "VeloTrack is running!"
  echo ""
  echo -e "  ${GREEN}Frontend:${RESET}  http://localhost:5173"
  echo -e "  ${GREEN}API docs:${RESET}  http://localhost:8000/docs"
  echo ""
  info "Watch logs: docker compose logs -f"
  info "First Garmin sync starts automatically (last ${GARMIN_INITIAL_BACKFILL_DAYS:-90} days)"
fi

# ── Dev mode ──────────────────────────────────────────────────────────────────
if [[ "$MODE" == "--dev" ]]; then
  info "Setting up VeloTrack for local development"

  command -v python3 &>/dev/null || error "Python 3.12+ required"
  command -v node &>/dev/null    || error "Node.js 20+ required"
  command -v pnpm &>/dev/null    || npm install -g pnpm 2>/dev/null || true

  info "Starting PostgreSQL and Redis via Docker..."
  docker run -d --name velotrack-db \
    -e POSTGRES_USER=velotrack -e POSTGRES_PASSWORD=velotrack_secret -e POSTGRES_DB=velotrack \
    -p 5432:5432 postgres:16-alpine 2>/dev/null || ok "DB already running"
  docker run -d --name velotrack-redis \
    -p 6379:6379 redis:7-alpine 2>/dev/null || ok "Redis already running"

  info "Setting up Python virtual environment..."
  cd backend
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -q --upgrade pip
  pip install -q -r requirements.txt
  cd ..
  ok "Python dependencies installed"

  [[ ! -f .env ]] && cp .env.example .env && warn "Edit .env with your Garmin credentials"

  info "Installing frontend dependencies..."
  cd frontend && pnpm install --silent && cd ..
  ok "Frontend ready"

  echo ""
  ok "Dev environment ready! Run these in separate terminals:"
  echo ""
  echo "  Backend:   cd backend && source .venv/bin/activate && uvicorn app.main:app --reload"
  echo "  Frontend:  cd frontend && pnpm dev"
  echo "  Worker:    cd backend && source .venv/bin/activate && celery -A app.workers.celery_app worker -l info"
  echo ""
fi

# ── GitHub Pages ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "--ghpages" ]]; then
  info "Building for GitHub Pages (frontend-only, local GPX analysis mode)"
  command -v node &>/dev/null || error "Node.js 20+ required"
  command -v pnpm &>/dev/null || npm install -g pnpm

  cd frontend
  pnpm install --silent
  VITE_API_URL="" pnpm build
  cd ..

  ok "Built → frontend/dist/"
  echo ""
  echo "  Push to gh-pages branch:"
  echo "  git subtree push --prefix frontend/dist origin gh-pages"
  echo ""
  echo "  Or set VITE_API_URL=https://your-server.com to connect a backend."
fi
