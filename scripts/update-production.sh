#!/usr/bin/env bash
# Actualiza YallPos en el servidor (git pull + rebuild Docker).
# Uso en el servidor: ./scripts/update-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env.production"
COMPOSE_BASE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_ARGS=""
IFS=':' read -ra FILES <<< "$COMPOSE_BASE"
for f in "${FILES[@]}"; do
  COMPOSE_ARGS="$COMPOSE_ARGS -f $f"
done
COMPOSE="docker compose $COMPOSE_ARGS --env-file $ENV_FILE"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Falta $ENV_FILE — ejecuta primero scripts/setup-oracle-server.sh o scripts/deploy.sh"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

# HTTPS automático: si hay APP_DOMAIN, activa el perfil "https" (Caddy).
if [ -n "${APP_DOMAIN:-}" ]; then
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}https"
  echo "🔒 HTTPS activado para dominio: ${APP_DOMAIN}"
fi

BRANCH="${DEPLOY_BRANCH:-main}"

echo "═══════════════════════════════════════"
echo " YallPos — Actualización producción"
echo "═══════════════════════════════════════"

echo "▶ git fetch origin $BRANCH"
git fetch origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "ℹ️  Ya estás en el último commit ($LOCAL). Reconstruyendo igual por si hubo cambios locales en .env…"
else
  echo "▶ git pull origin $BRANCH"
  git pull origin "$BRANCH"
fi

echo "▶ Rebuild imágenes"
$COMPOSE build

echo "▶ Reiniciar servicios (RUN_SEED debe ser false en actualizaciones)"
export RUN_SEED=false
$COMPOSE up -d

echo ""
echo "Esperando health check…"
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${WEB_PORT:-8080}/v1/health" >/dev/null 2>&1; then
    echo ""
    echo "✅ Actualización completada"
    echo "   http://127.0.0.1:${WEB_PORT:-8080}/v1/health"
    exit 0
  fi
  sleep 2
done

echo "❌ Health check falló — revisa logs:"
echo "   $COMPOSE logs --tail=80"
exit 1
