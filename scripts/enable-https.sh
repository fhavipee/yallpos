#!/usr/bin/env bash
# Configura HTTPS automático (Caddy + Let's Encrypt) usando sslip.io,
# sin necesidad de comprar un dominio.
#
# Uso en el servidor:
#   ./scripts/enable-https.sh
#   ./scripts/enable-https.sh --email tu@correo.com
#   ./scripts/enable-https.sh --domain pos.turestaurante.com --email tu@correo.com
#
# Requisitos previos (una sola vez):
#   - Puertos 80 y 443 abiertos en Oracle Security List (Ingress) y ufw
#   - YallPos ya desplegado (/opt/yallpos con .env.production)
#
# Después de ejecutarlo, entra por https://<APP_DOMAIN>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE=".env.production"
DOMAIN=""
EMAIL=""
SKIP_DEPLOY=0

usage() {
  cat <<'EOF'
Uso: ./scripts/enable-https.sh [opciones]

Opciones:
  --domain DOMINIO   Dominio propio (ej. pos.turestaurante.com).
                     Si se omite, se usa <IP-PUBLICA>.sslip.io automáticamente.
  --email CORREO     Correo para Let's Encrypt (recomendado).
  --skip-deploy      Solo escribe APP_DOMAIN en .env.production, sin reiniciar.
  -h, --help         Muestra esta ayuda.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --skip-deploy) SKIP_DEPLOY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opción desconocida: $1"; usage; exit 1 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Falta $ENV_FILE — ejecuta primero scripts/setup-oracle-server.sh"
  exit 1
fi

echo "═══════════════════════════════════════"
echo " YallPos — Activar HTTPS (huella)"
echo "═══════════════════════════════════════"

if [ -z "$DOMAIN" ]; then
  echo "▶ Detectando IP pública…"
  PUBLIC_IP="$(curl -sf --max-time 8 ifconfig.me 2>/dev/null \
    || curl -sf --max-time 8 icanhazip.com 2>/dev/null \
    || curl -sf --max-time 8 https://api.ipify.org 2>/dev/null \
    || true)"
  PUBLIC_IP="$(echo "$PUBLIC_IP" | tr -d '[:space:]')"

  if [ -z "$PUBLIC_IP" ] || ! echo "$PUBLIC_IP" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "❌ No se pudo detectar la IP pública. Pásala con --domain <IP-con-guiones>.sslip.io"
    exit 1
  fi

  DOMAIN="${PUBLIC_IP//./-}.sslip.io"
  echo "   IP pública: $PUBLIC_IP"
  echo "   Dominio:    $DOMAIN"
else
  echo "▶ Usando dominio: $DOMAIN"
fi

if [ -z "$EMAIL" ]; then
  # Reutiliza el email ya guardado, o deja uno genérico (Caddy acepta vacío pero
  # Let's Encrypt recomienda uno para avisos de renovación).
  EXISTING_EMAIL="$(grep -E '^ACME_EMAIL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [ -n "$EXISTING_EMAIL" ]; then
    EMAIL="$EXISTING_EMAIL"
  else
    EMAIL="admin@${DOMAIN}"
  fi
fi

# Abre 80/443 en ufw si existe (idempotente)
if command -v ufw >/dev/null 2>&1; then
  echo "▶ Abriendo puertos 80 y 443 en ufw…"
  sudo ufw allow 80/tcp >/dev/null 2>&1 || true
  sudo ufw allow 443/tcp >/dev/null 2>&1 || true
fi

# Upsert de APP_DOMAIN y ACME_EMAIL en .env.production
upsert_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

echo "▶ Escribiendo APP_DOMAIN y ACME_EMAIL en $ENV_FILE"
upsert_env "APP_DOMAIN" "$DOMAIN"
upsert_env "ACME_EMAIL" "$EMAIL"

echo ""
echo "✅ Configurado:"
echo "   APP_DOMAIN=$DOMAIN"
echo "   ACME_EMAIL=$EMAIL"
echo ""
echo "⚠️  Recuerda abrir 80 y 443 en Oracle Cloud → Security List (Ingress Rules)."
echo ""

if [ "$SKIP_DEPLOY" -eq 1 ]; then
  echo "ℹ️  --skip-deploy: no se reiniciaron servicios."
  echo "   Cuando quieras activar HTTPS:"
  echo "     ./scripts/update-production.sh"
  echo "   Luego entra por: https://${DOMAIN}"
  exit 0
fi

echo "▶ Levantando Caddy (HTTPS)…"
./scripts/update-production.sh

echo ""
echo "═══════════════════════════════════════"
echo " ✅ HTTPS listo"
echo "═══════════════════════════════════════"
echo ""
echo "  URL:     https://${DOMAIN}"
echo "  Mesero:  https://${DOMAIN}/?view=waiter"
echo ""
echo "  En Asistencia ya puedes:"
echo "    1) Registrar tu huella (botón en Mi sesión)"
echo "    2) Marcar llegada/salida con el botón grande de huella"
echo ""
echo "  Si el certificado tarda ~30–60 s la primera vez, espera y recarga."
echo ""
