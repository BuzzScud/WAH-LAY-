#!/usr/bin/env bash
# Nightly off-box database dump (plan §6.2 — "the single most important line").
# Run on the droplet from cron, e.g.:  15 4 * * * /opt/app/scripts/backup.sh
# Ships pg_dump to Backblaze B2 (or DO Spaces) via rclone; keeps 30 days.
# An untested backup is not a backup — restore once onto a scratch droplet
# BEFORE launch, and check monthly that this job still runs.
set -euo pipefail

STAMP=$(date +%F)
DEST_REMOTE="b2:your-bucket/db-backups" # configure with `rclone config`
KEEP_DAYS=30

docker compose -f /opt/app/docker-compose.prod.yml exec -T db \
  pg_dump -U takeout takeout | gzip > "/tmp/takeout-${STAMP}.sql.gz"

rclone copy "/tmp/takeout-${STAMP}.sql.gz" "$DEST_REMOTE"
rm "/tmp/takeout-${STAMP}.sql.gz"

# Prune old dumps
rclone delete --min-age "${KEEP_DAYS}d" "$DEST_REMOTE"

echo "backup ok: takeout-${STAMP}.sql.gz"
