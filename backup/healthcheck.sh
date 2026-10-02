#!/bin/sh
# Unhealthy once the last successful dump is older than MAX_AGE seconds
# (default 26h: one missed nightly run, with slack for a slow dump).
#
# This is the point of the sidecar. A backup job that has been failing silently
# for three weeks is the normal way backups fail.
set -eu
MARKER="${DUMP_DIR:-/dumps}/.last-success"
MAX_AGE="${MAX_AGE:-93600}"
[ -f "$MARKER" ] || exit 1
[ $(( $(date +%s) - $(stat -c %Y "$MARKER") )) -lt "$MAX_AGE" ]
