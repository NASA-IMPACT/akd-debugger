#!/usr/bin/env bash
set -euo pipefail

# Restore PostgreSQL dump using docker compose (no host pg_restore needed).
# Usage: ./scripts/pg_restore_docker.sh <dump_file>

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <dump_file>"
  exit 1
fi

DUMP_FILE="$1"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-benchmark}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

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

echo "Restoring ${DUMP_FILE} into service '${DB_SERVICE}' database '${PGDATABASE}'"
cat "$DUMP_FILE" | "${DC_CMD[@]}" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_restore -U "$PGUSER" -d "$PGDATABASE" --clean --if-exists --no-owner --no-privileges

echo "Restore completed."
