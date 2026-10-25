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

echo "==> checking the archive"
# Links and special files are refused before anything is extracted: a symlink
# member would let a later member be written to anywhere this user can write.
if tar tvzf "$ARCHIVE" | grep -qvE '^[-d]' || tar tvzf "$ARCHIVE" | grep -qE ' link to | -> '; then
  echo "archive contains a link or special file, which a backup never does" >&2
  exit 1
fi
if tar tzf "$ARCHIVE" | grep -qE '(^/|(^|/)\.\.(/|$))'; then
  echo "archive contains an unsafe path" >&2
  exit 1
fi
echo "==> unpacking"
tar xzf "$ARCHIVE" --no-same-owner -C "$WORK_DIR"
[[ -f "$WORK_DIR/db.sql" ]] || { echo "archive has no db.sql — is this a backup?" >&2; exit 1; }
# pg_dump ends with this line; its absence is a dump cut short by a full disk,
# which would otherwise restore into a half-empty database without erroring.
tail -c 65536 "$WORK_DIR/db.sql" | grep -q -- '-- PostgreSQL database dump complete' \
  || { echo "the database dump in this archive is truncated — nothing was changed" >&2; exit 1; }
# psql runs backslash commands, and \! is a shell. Outside COPY data none
# belong at the start of a line in a pg_dump file except these.
if awk 'BEGIN{c=0} c&&/^\\\.$/{c=0;next} c{next} /^COPY .* FROM stdin;$/{c=1;next} /^[[:space:]]*\\/ && !/^\\(connect|c|restrict|unrestrict)([[:space:]]|$)/ {print; found=1} END{exit !found}' "$WORK_DIR/db.sql" >/dev/null; then
  echo "the dump contains psql commands a backup never has — refusing" >&2
  exit 1
fi

VOLUME="${PROJECT}_app-data"
# Checked now, not after the database is replaced: failing here leaves the
# current install untouched.
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "no volume $VOLUME — has this stack been started with make?" >&2
  exit 1
fi

# Postgres stays up (it's the thing being restored into); only the app stops,
# so it can't run migrations or serve requests against a half-restored state.
echo "==> stopping the app"
$COMPOSE stop app >/dev/null
# From here on an early exit must not leave the app stopped.
trap '$COMPOSE start app >/dev/null 2>&1 || true; rm -rf "$WORK_DIR"' EXIT

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
docker run --rm \
  -v "$VOLUME":/app-data \
  -v "$WORK_DIR/uploads":/uploads:ro \
  alpine:3 sh -ec '
    # Whatever the archive holds, rather than a list of names repeated here.
    # This was hardcoded to two directories while the backup grew a third, so
    # a restore silently skipped it — the kind of failure you only discover
    # during an actual recovery.
    for src in /uploads/*/; do
      [ -d "$src" ] || continue
      name=$(basename "$src")
      # Replaced, not merged: files left from the install being overwritten
      # would sit among the restored ones, referenced by nothing. A failed
      # copy stops the script rather than reporting "Restored".
      rm -rf "/app-data/$name"
      mkdir -p "/app-data/$name"
      cp -R "$src." "/app-data/$name/"
    done
  '

echo "==> starting the app"
$COMPOSE start app >/dev/null

echo
echo "Restored from $(basename "$ARCHIVE")."
echo "Posters and preview clips were not in the backup by design — run a scan"
echo "from the app to regenerate them from your video files."
