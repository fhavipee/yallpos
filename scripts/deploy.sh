#!/usr/bin/env bash
# Despliega YallPos en Docker (API + Web + Postgres + Redis)
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
  cp .env.production.example "$ENV_FILE"
  echo "✅ Creado $ENV_FILE — edita POSTGRES_PASSWORD y JWT_SECRET, luego vuelve a ejecutar."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ "${POSTGRES_PASSWORD:-}" = "cambiar-password-seguro-aqui" ]; then
  echo "⚠️  Cambia POSTGRES_PASSWORD en $ENV_FILE antes de desplegar en producción."
  exit 1
fi

# HTTPS automático: si hay APP_DOMAIN, activa el perfil "https" (Caddy).
if [ -n "${APP_DOMAIN:-}" ]; then
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}https"
  echo "🔒 HTTPS activado para dominio: ${APP_DOMAIN}"
fi

echo "═══════════════════════════════════════"
echo " YallPos — Despliegue producción"
echo "═══════════════════════════════════════"

$COMPOSE build

$COMPOSE up -d

echo ""
echo "Esperando servicios…"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${WEB_PORT:-8080}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"

echo ""
echo "✅ YallPos desplegado"
echo ""
if [ -n "${APP_DOMAIN:-}" ]; then
  echo "  HTTPS:    https://${APP_DOMAIN}   (huella habilitada)"
fi
echo "  Local:    http://127.0.0.1:${WEB_PORT:-8080}"
echo "  Red LAN:  http://${LAN_IP}:${WEB_PORT:-8080}"
echo "  Mesero:   http://${LAN_IP}:${WEB_PORT:-8080}/?view=waiter"
echo ""
echo "  Admin:    admin@restaurantedeyall.co / yall2025"
echo "  Mesero:   mesero@restaurantedeyall.co / mesero2025"
echo ""
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "  (Seed ejecutado — pon RUN_SEED=false en $ENV_FILE para próximos arranques)"
fi
echo ""
echo "Print Agent (PC de caja con impresora):"
echo "  cd apps/print-agent && PRINTER_IP=... node index.js"
echo ""
echo "Logs: $COMPOSE logs -f"
