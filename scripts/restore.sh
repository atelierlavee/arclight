#!/usr/bin/env bash
#
# Restore a backup archive produced by the "Back up now" button.
#
#   scripts/restore.sh backups/media-server-<timestamp>.tar.gz --yes
#
# Restores into the stack `make up` runs. Set DEV=1 to restore into the one
# `make dev` runs instead, or COMPOSE_PROJECT=<name> for a stack started some
# other way (`docker compose ls` lists them).
#
# This REPLACES the current database. Everything presently in it is lost, so
# the --yes argument is required rather than a prompt you can hold enter on.
#
# The offline path. Restoring is a button in Site settings now — the app stops
# its own scan timer, gates incoming requests, drains its connection pool and
# calls the exported runMigrations() afterwards, so it no longer has to be
# stopped to swap its own database. This stays for the case that cannot use
# that button: the app not starting at all.
#
# Unlike the in-app restore, this takes no safety backup of the current state
# and does not check whether the archive came from a newer version of the app.
#
# Restoring an older backup onto newer code is fine and expected. The dump
# carries drizzle's bookkeeping table at whatever position it was taken, so on
# the next boot the migrator replays exactly the migrations recorded since.
set -euo pipefail

ARCHIVE="${1:-}"
CONFIRM="${2:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Must name the same compose project as the Makefile. Without -p, compose
# derives the project from the docker/ folder, so this script stopped, restored
# into and copied images for a stack `make up` never started.
if [[ "${DEV:-}" == "1" ]]; then
  PROJECT="${COMPOSE_PROJECT:-media-server-dev}"
  COMPOSE="docker compose -p $PROJECT -f docker/docker-compose.yml -f docker/docker-compose.dev.yml"
else
  PROJECT="${COMPOSE_PROJECT:-media-server}"
  COMPOSE="docker compose -p $PROJECT -f docker/docker-compose.yml"
fi

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "usage: scripts/restore.sh <backup.tar.gz> --yes" >&2
  echo >&2
  echo "available backups:" >&2
  ls -1t "$REPO_ROOT"/backups/media-server-*.tar.gz 2>/dev/null | sed 's/^/  /' >&2 || echo "  (none)" >&2
  exit 1
fi

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "This will REPLACE the current database with the contents of:" >&2
  echo "  $ARCHIVE" >&2
  echo >&2
  echo "Everything currently in the library — including anything added since that" >&2
  echo "backup — will be lost. Re-run with --yes to proceed." >&2
  exit 1
fi

ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
cd "$REPO_ROOT"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==> unpacking"
tar xzf "$ARCHIVE" -C "$WORK_DIR"
[[ -f "$WORK_DIR/db.sql" ]] || { echo "archive has no db.sql — is this a backup?" >&2; exit 1; }

# Postgres stays up (it's the thing being restored into); only the app stops,
# so it can't run migrations or serve requests against a half-restored state.
echo "==> stopping the app"
$COMPOSE stop app >/dev/null

echo "==> restoring the database"
# --clean only drops what the dump knows about, so a table added since the
# backup was taken (with a foreign key into media_items) would block the
# drops. The in-app restore clears the schema first for that reason; this
# reuses its exact SQL, read out of restore.ts, so the two cannot drift.
# --single-transaction with ON_ERROR_STOP rolls the clear back too if the dump
# fails, rather than leaving a database that looks fine and isn't.
PRELUDE="$(sed -n '/^const RESTORE_PRELUDE = `$/,/^`;$/p' apps/server/src/backup/restore.ts | sed '1d;$d')"
[[ -n "$PRELUDE" ]] || { echo "could not read RESTORE_PRELUDE from apps/server/src/backup/restore.ts" >&2; exit 1; }
{ printf '%s\n' "$PRELUDE"; cat "$WORK_DIR/db.sql"; } \
  | $COMPOSE exec -T postgres psql -X -v ON_ERROR_STOP=1 --single-transaction -U media -d media >/dev/null

echo "==> restoring uploaded images"
# The app container is stopped, so a throwaway container mounts the named
# volume directly. Volume name is <project>_app-data.
VOLUME="${PROJECT}_app-data"
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "no volume $VOLUME — has this stack been started with make?" >&2
  exit 1
fi
docker run --rm \
  -v "$VOLUME":/app-data \
  -v "$WORK_DIR/uploads":/uploads:ro \
  alpine:3 sh -c '
    # Whatever the archive holds, rather than a list of names repeated here.
    # This was hardcoded to two directories while the backup grew a third, so
    # a restore silently skipped it — the kind of failure you only discover
    # during an actual recovery.
    for src in /uploads/*/; do
      [ -d "$src" ] || continue
      name=$(basename "$src")
      mkdir -p "/app-data/$name"
      cp -R "$src." "/app-data/$name/" 2>/dev/null || true
    done
  '

echo "==> starting the app"
$COMPOSE start app >/dev/null

echo
echo "Restored from $(basename "$ARCHIVE")."
echo "Posters and preview clips were not in the backup by design — run a scan"
echo "from the app to regenerate them from your video files."
