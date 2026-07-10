#!/usr/bin/env bash
# Despliegue en VM con poca RAM (Oracle E2.1.Micro, 1 GB).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE="docker-compose.prod.yml:docker-compose.prod.micro.yml"

if [ ! -f .env.production ]; then
  echo "❌ Falta .env.production — copia desde .env.production.example"
  exit 1
fi

if ! swapon --show | grep -q .; then
  echo "▶ Activando swap 2G (recomendado en VMs de 1 GB)"
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile 2>/dev/null || true
  grep -q '/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

exec ./scripts/deploy.sh
