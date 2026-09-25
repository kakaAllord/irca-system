#!/usr/bin/env bash
# The nightly backup (docs/plan/10, step 10.2): the whole database, dumped as
# the read-only irca_backup role, encrypted to the keys in recipients.txt, and
# put in a bucket that is not on the platform the database runs on.
#
# It runs as a cron service beside the database (docs/deploy-railway.md §9),
# so the database never has to be reachable from the internet. Nothing it
# writes is readable without one of the private keys, which are held offline
# by people, never by a server. docs/runbooks/restore.md is the way back.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?the database URL of the irca_backup role}"
: "${BUCKET_URL:?the bucket, such as https://<account>.r2.cloudflarestorage.com/irca-backups}"
: "${BUCKET_ACCESS_KEY_ID:?the access key id for the bucket}"
: "${BUCKET_SECRET_ACCESS_KEY:?the secret access key for the bucket}"
region="${BUCKET_REGION:-auto}"
recipients="${RECIPIENTS_FILE:-$(dirname "$0")/recipients.txt}"

# Refusing is better than a backup nobody can open, or one anybody can.
if ! grep -q '^age1' "$recipients"; then
  echo "No public key in $recipients: the dump would have nobody to be encrypted to." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
name="irca-$(date -u +%Y-%m-%dT%H%M%SZ).dump.age"

pg_dump --format=custom --file="$work/irca.dump" "$BACKUP_DATABASE_URL"

# A dump pg_restore cannot read would restore nothing; find out tonight.
tables="$(pg_restore --list "$work/irca.dump" | grep -c ' TABLE DATA ' || true)"
if [ "$tables" -eq 0 ]; then
  echo "The dump holds no table data; not keeping it." >&2
  exit 1
fi

age --encrypt --recipients-file "$recipients" --output "$work/$name" "$work/irca.dump"
rm -f "$work/irca.dump"

curl --fail --silent --show-error --max-time 900 \
  --aws-sigv4 "aws:amz:${region}:s3" \
  --user "${BUCKET_ACCESS_KEY_ID}:${BUCKET_SECRET_ACCESS_KEY}" \
  --upload-file "$work/$name" "${BUCKET_URL%/}/$name"

echo "Backed up ${tables} tables to ${name} ($(wc -c < "$work/$name") bytes, encrypted)."

# Optional: a heartbeat monitor that alerts when a night passes without one.
if [ -n "${HEARTBEAT_URL:-}" ]; then
  curl --fail --silent --show-error --max-time 10 "$HEARTBEAT_URL" > /dev/null
fi
