#!/usr/bin/env bash
set -euo pipefail

# Restore a PostgreSQL dump created by pg_dump_to_file.sh.
# Usage: ./scripts/pg_restore_from_file.sh <dump_file>

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <dump_file>"
  exit 1
fi

DUMP_FILE="$1"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-benchmark}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required but not installed."
  echo "Install PostgreSQL client tools and retry."
  exit 1
fi

export PGPASSWORD

echo "Restoring dump into ${PGDATABASE} on ${PGHOST}:${PGPORT}"
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE"

echo "Restore completed."
