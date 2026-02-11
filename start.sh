#!/usr/bin/env bash
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$APP_DIR"

is_port_in_use() {
    lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5432}"
if is_port_in_use "$POSTGRES_HOST_PORT"; then
    if [ "$POSTGRES_HOST_PORT" = "5432" ]; then
        echo "Port 5432 is already in use; using 5433 for PostgreSQL."
        POSTGRES_HOST_PORT=5433
    else
        echo "Port ${POSTGRES_HOST_PORT} is already in use. Set POSTGRES_HOST_PORT to a free port and retry."
        exit 1
    fi
fi
export POSTGRES_HOST_PORT
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:${POSTGRES_HOST_PORT}/benchmark"
export DATABASE_URL_SYNC="postgresql://postgres:postgres@localhost:${POSTGRES_HOST_PORT}/benchmark"

# ---------- PostgreSQL (Docker) ----------
echo "Starting PostgreSQL..."
docker compose -f "$APP_DIR/docker-compose.yml" up -d db

# Wait for healthy
echo -n "Waiting for DB"
until docker compose -f "$APP_DIR/docker-compose.yml" exec -T db pg_isready -U postgres -q 2>/dev/null; do
    echo -n "."
    sleep 1
done
echo " ready"

# ---------- Migrations ----------
echo "Running migrations..."
cd "$ROOT_DIR"
uv sync
uv run alembic -c "$APP_DIR/alembic.ini" upgrade head

# ---------- Seed (if empty) ----------
# Uncomment to auto-seed on first run:
# uv run python3 -m seed

# ---------- Next.js Frontend ----------
echo "Starting frontend at http://localhost:3000"
if [ ! -x "$APP_DIR/frontend/node_modules/.bin/next" ] || [ ! -e "$APP_DIR/frontend/node_modules/next/server/require-hook.js" ]; then
    echo "Frontend dependencies missing or broken. Installing..."
    npm --prefix "$APP_DIR/frontend" install
fi
(cd "$APP_DIR/frontend" && npm run dev -- "$APP_DIR/frontend") &
FRONTEND_PID=$!
cd "$ROOT_DIR"

# Cleanup on exit — kill frontend when script is stopped
cleanup() {
    echo ""
    echo "Stopping frontend (PID $FRONTEND_PID)..."
    kill $FRONTEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# ---------- FastAPI ----------
echo "Starting backend at http://localhost:8000"
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
