#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export COMPOSE_FILE="docker-compose.prod.yml:docker-compose.prod.micro.yml"
export RUN_SEED=false
exec ./scripts/update-production.sh
