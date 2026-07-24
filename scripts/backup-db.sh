#!/usr/bin/env bash
# Local Postgres dump for chef-bot. Prefer the compose `db` service; fall back to
# host `pg_dump` + DATABASE_URL. Output goes to backups/ (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  # Load only DATABASE_URL from .env (ignore other keys / comments).
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  export DATABASE_URL
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/chefbot-${STAMP}.sql"

dump_via_compose() {
  docker compose exec -T db pg_dump -U chefbot -d chefbot --no-owner --no-acl
}

dump_via_pg_dump() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is not set and .env has no DATABASE_URL — cannot dump." >&2
    exit 1
  fi
  pg_dump "$DATABASE_URL" --no-owner --no-acl
}

if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  dump_via_compose >"$OUT"
elif command -v pg_dump >/dev/null 2>&1; then
  dump_via_pg_dump >"$OUT"
else
  echo "No running compose service 'db' and no pg_dump on PATH." >&2
  echo "Start Postgres with: docker compose up -d db" >&2
  exit 1
fi

BYTES="$(wc -c <"$OUT" | tr -d ' ')"
if [[ "$BYTES" -lt 100 ]]; then
  echo "Backup looks empty (${BYTES} bytes) — refusing to keep $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

echo "Backup written to ${OUT} (${BYTES} bytes)"
