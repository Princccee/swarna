#!/bin/bash
# Runs ON THE SERVER (as root), started by GitHub Actions through AWS SSM.
#
#   deploy.sh <image-tag> <aws-region> <ecr-registry> <ops-bucket>
#
# 1. installs the compose files from this release bundle into /opt/svarna/app
# 2. writes .env from SSM Parameter Store (/svarna/prod/*)
# 3. backs up the database, pulls the new images, restarts api + web
# 4. waits for the API health check; rolls back to the previous images if it fails
set -euo pipefail

TAG="${1:?image tag}"
REGION="${2:?aws region}"
ECR_REGISTRY="${3:?ecr registry}"
OPS_BUCKET="${4:?ops bucket}"

APP_DIR=/opt/svarna/app
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSM_PATH=/svarna/prod/
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# ── 1. Install release files ────────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR/deploy"
cp "$SRC_DIR"/docker-compose.yml "$SRC_DIR"/docker-compose.prod.yml "$SRC_DIR"/docker-compose.aws.yml \
   "$SRC_DIR"/Caddyfile "$APP_DIR"/
cp "$SRC_DIR"/deploy/*.sh "$APP_DIR"/deploy/
chmod +x "$APP_DIR"/deploy/*.sh
cd "$APP_DIR"

PREV_TAG="$(cat .deployed_tag 2>/dev/null || true)"

# ── 2. .env from Parameter Store ────────────────────────────────────────────────────────────
write_env() {
  local tag="$1" tmp
  tmp="$(mktemp)"
  aws ssm get-parameters-by-path --path "$SSM_PATH" --recursive --with-decryption \
    --query 'Parameters[*].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    key="${name##*/}"
    if [[ "$value" == *"'"* ]]; then
      echo "Parameter $key contains a single quote, which .env cannot hold — fix it in SSM" >&2
      exit 1
    fi
    printf "%s='%s'\n" "$key" "$value"
  done > "$tmp"
  {
    echo "ECR_REGISTRY=$ECR_REGISTRY"
    echo "IMAGE_TAG=$tag"
  } >> "$tmp"
  install -m 600 "$tmp" .env
  rm -f "$tmp"
}
write_env "$TAG"
grep -q '^SITE_ADDRESS=' .env || { echo "SITE_ADDRESS missing in SSM $SSM_PATH" >&2; exit 1; }

cat > deploy.env <<EOF
AWS_REGION=$REGION
OPS_BUCKET=$OPS_BUCKET
EOF

COMPOSE=(docker compose -p svarna --env-file .env
         -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.aws.yml)

# ── 3. Back up, pull, restart ───────────────────────────────────────────────────────────────
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

if [ -n "$(docker ps -q -f label=com.docker.compose.project=svarna -f label=com.docker.compose.service=postgres)" ]; then
  log "backing up database before deploy"
  OPS_BUCKET="$OPS_BUCKET" "$APP_DIR/deploy/backup.sh" "pre-deploy/$TAG"
else
  log "no running database yet (first deploy) — skipping backup"
fi

log "pulling images $TAG"
"${COMPOSE[@]}" pull api web
log "starting stack"
"${COMPOSE[@]}" up -d --no-build --remove-orphans

# ── 4. Health check, roll back on failure ───────────────────────────────────────────────────
healthy() {
  for _ in $(seq 1 36); do # up to 3 minutes (first boot runs all migrations)
    if curl -fsS -m 5 http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

if healthy; then
  echo "$TAG" > .deployed_tag
  log "healthy — deployed $TAG"
else
  log "API did not become healthy. Last API logs:"
  "${COMPOSE[@]}" logs --tail 80 api || true
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
    log "rolling back to $PREV_TAG"
    write_env "$PREV_TAG"
    "${COMPOSE[@]}" up -d --no-build api web
    if healthy; then log "rollback to $PREV_TAG healthy"; else log "ROLLBACK ALSO UNHEALTHY — check the server"; fi
  fi
  exit 1
fi

# ── Housekeeping ────────────────────────────────────────────────────────────────────────────
docker image prune -af --filter "until=168h" >/dev/null || true

# Nightly database backup at 02:30 IST (idempotent)
cat > /etc/systemd/system/svarna-backup.service <<EOF
[Unit]
Description=Svarna nightly database backup to S3
[Service]
Type=oneshot
EnvironmentFile=$APP_DIR/deploy.env
ExecStart=$APP_DIR/deploy/backup.sh nightly
EOF
cat > /etc/systemd/system/svarna-backup.timer <<'EOF'
[Unit]
Description=Run Svarna backup nightly
[Timer]
OnCalendar=*-*-* 21:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now svarna-backup.timer >/dev/null
