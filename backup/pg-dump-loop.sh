#!/bin/sh
# Nightly logical backup of this stack's PostgreSQL database.
#
# pg_dump takes its snapshot inside a single transaction, so the dump is
# consistent while the application keeps serving: nothing has to be stopped and
# nothing needs the Docker socket. Dumps land in the `db_dumps` volume, which
# the volumes-backup service ships offsite. See the README for the restore.
#
# Why a loop rather than cron: it dumps on start, so a window missed while the
# container was down is picked up rather than skipped; it inherits the
# environment instead of cron's scrubbed one; and it logs to stdout where
# `docker compose logs` already looks.
set -eu

DUMP_DIR="${DUMP_DIR:-/dumps}"
KEEP_DAYS="${KEEP_DAYS:-7}"
# 01:30 is deliberately outside 02:00-03:00: that hour does not exist on the
# spring DST change and happens twice in autumn, which skips or doubles a job
# here exactly as it would in cron.
DUMP_AT="${DUMP_AT:-01:30}"
# An unreachable database must not wedge the schedule forever — without this a
# hung connection means no further dumps and only the healthcheck to say so.
DUMP_TIMEOUT="${DUMP_TIMEOUT:-3600}"

export PGHOST="${PGHOST:?PGHOST is required}"
export PGUSER="${PGUSER:?PGUSER is required}"
export PGDATABASE="${PGDATABASE:?PGDATABASE is required}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

DUMP_PREFIX="${DUMP_PREFIX:-$PGDATABASE}"

# Without a trap the shell is PID 1, where the kernel discards signals whose
# disposition is default: `docker stop` would wait the full grace period and
# then SIGKILL. Sleeping in the background and `wait`ing makes the trap run
# promptly, which a foreground `sleep` would defer until it returned.
trap 'exit 0' TERM INT

dump() {
  out="$DUMP_DIR/${DUMP_PREFIX}-$(date +%Y-%m-%dT%H-%M-%S).dump"
  # Written as .part and renamed only on success: a truncated file must never
  # be mistaken for a good backup by the offsite copy or by a human in a hurry.
  if timeout "$DUMP_TIMEOUT" pg_dump --format=custom --compress=9 --file="$out.part"; then
    mv "$out.part" "$out"
    touch "$DUMP_DIR/.last-success"
    echo "$(date -Is) backup ok: $out ($(stat -c %s "$out") bytes)"
    find "$DUMP_DIR" -maxdepth 1 -name "${DUMP_PREFIX}-*.dump" -mtime "+$KEEP_DAYS" -delete
  else
    rc=$?           # captured before anything else can overwrite it
    rm -f "$out.part"
    echo "$(date -Is) backup FAILED (exit $rc)" >&2
  fi
}

# One dump at startup, so a freshly deployed stack is never without one and
# every deploy leaves a snapshot of the state it replaced.
dump

while :; do
  now=$(date +%s)
  next=$(date -d "today $DUMP_AT" +%s)
  if [ "$next" -le "$now" ]; then next=$(date -d "tomorrow $DUMP_AT" +%s); fi
  sleep $((next - now)) & wait $!
  dump
done
