#!/usr/bin/env bash
set -euo pipefail

# Dump PostgreSQL data using docker compose (no host pg_dump needed).
# Usage: ./scripts/pg_dump_docker.sh [output_file]

OUT_FILE="${1:-backup_$(date +%Y%m%d_%H%M%S).dump}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-benchmark}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC_CMD=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

echo "Creating dump from service '${DB_SERVICE}' in ${COMPOSE_FILE}: ${OUT_FILE}"
"${DC_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc > "$OUT_FILE"

echo "Dump completed: ${OUT_FILE}"
