#!/usr/bin/env bash
# Setup inicial en Oracle VM.Standard.E2.1.Micro (AMD, 1 GB, Bogotá u otra región).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSTALL_DIR="${YALLPOS_DIR:-/opt/yallpos}"
REPO_URL="${YALLPOS_REPO:-https://github.com/fhavipee/yallpos.git}"
BRANCH="${YALLPOS_BRANCH:-main}"

if [ "$(id -u)" -eq 0 ]; then
  echo "❌ No ejecutes como root. Usa ubuntu con sudo."
  exit 1
fi

echo "═══════════════════════════════════════"
echo " YallPos — Setup VM micro (1 GB RAM)"
echo "═══════════════════════════════════════"

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl git ufw
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "⚠️  Cierra SSH, vuelve a entrar y ejecuta este script otra vez."
  exit 0
fi

sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow 8080/tcp >/dev/null 2>&1 || true
echo "y" | sudo ufw enable >/dev/null 2>&1 || true

if [ ! -d "$INSTALL_DIR/.git" ]; then
  sudo mkdir -p "$(dirname "$INSTALL_DIR")"
  sudo chown "$USER:$USER" "$(dirname "$INSTALL_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
git fetch origin "$BRANCH" 2>/dev/null || true
git checkout "$BRANCH" 2>/dev/null || true
git pull origin "$BRANCH" 2>/dev/null || true
chmod +x scripts/*.sh

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  JWT_SECRET="$(openssl rand -hex 32)"
  PG_PASS="$(openssl rand -hex 16)"
  sed -i "s/cambiar-password-seguro-aqui/${PG_PASS}/" .env.production
  sed -i "s/cambiar-por-string-largo-aleatorio-min-32-chars/${JWT_SECRET}/" .env.production
fi

./scripts/deploy-micro.sh

PUBLIC_IP="$(curl -sf ifconfig.me 2>/dev/null || echo 'TU-IP')"
echo ""
echo "✅ Listo: http://${PUBLIC_IP}:8080"
echo "   Mesero: http://${PUBLIC_IP}:8080/?view=waiter"
echo "   Tras primer arranque: RUN_SEED=false en .env.production"
