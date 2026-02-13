#!/usr/bin/env bash
set -euo pipefail

# Create a portable PostgreSQL dump file.
# Defaults match this project's docker-compose config.

OUT_FILE="${1:-backup_$(date +%Y%m%d_%H%M%S).dump}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-benchmark}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but not installed."
  echo "Install PostgreSQL client tools and retry."
  exit 1
fi

export PGPASSWORD

echo "Creating dump: ${OUT_FILE}"
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --blobs \
  --no-owner \
  --no-privileges \
  --file="$OUT_FILE"

echo "Dump completed: ${OUT_FILE}"
