#!/bin/bash
# Dump the Postgres database to S3.   backup.sh <label>   e.g. "nightly" or "pre-deploy/<sha>"
# Needs OPS_BUCKET (and AWS_REGION) in the environment. Restore with:
#   aws s3 cp s3://$OPS_BUCKET/backups/<file>.dump - | docker exec -i <postgres-container> \
#     pg_restore -U svarna -d svarna --clean --if-exists
set -euo pipefail

LABEL="${1:-manual}"
: "${OPS_BUCKET:?OPS_BUCKET not set}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"

PG="$(docker ps -q -f label=com.docker.compose.project=svarna -f label=com.docker.compose.service=postgres)"
[ -n "$PG" ] || { echo "postgres container not running" >&2; exit 1; }

KEY="backups/$LABEL/$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec "$PG" pg_dump -U svarna -d svarna --format=custom | aws s3 cp - "s3://$OPS_BUCKET/$KEY"
echo "backup written to s3://$OPS_BUCKET/$KEY"
