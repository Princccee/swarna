#!/bin/bash
# First-boot setup for the Svarna server (Amazon Linux 2023).
# Runs once. Everything app-specific is done by deploy/deploy.sh on each deploy.
set -euxo pipefail

# 2 GB swap: headroom for Postgres + API + builds of Prisma on a 2 GB instance
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

dnf install -y docker tar gzip
systemctl enable --now docker

# Docker Compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Keep container logs from filling the disk
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker

mkdir -p /opt/svarna
