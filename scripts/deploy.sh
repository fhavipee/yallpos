#!/usr/bin/env bash
# Despliega YallPos en Docker (API + Web + Postgres + Redis)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env.production"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

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
