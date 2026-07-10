#!/usr/bin/env bash
# Configuración inicial en Ubuntu (Oracle Cloud Free Tier u otro VPS).
# Ejecutar EN EL SERVIDOR como usuario con sudo:
#   curl -fsSL https://raw.githubusercontent.com/fhavipee/yallpos/main/scripts/setup-oracle-server.sh | bash
# O, tras clonar el repo:
#   chmod +x scripts/setup-oracle-server.sh && ./scripts/setup-oracle-server.sh
set -euo pipefail

INSTALL_DIR="${YALLPOS_DIR:-/opt/yallpos}"
REPO_URL="${YALLPOS_REPO:-https://github.com/fhavipee/yallpos.git}"
BRANCH="${YALLPOS_BRANCH:-main}"
WEB_PORT="${WEB_PORT:-8080}"

if [ "$(id -u)" -eq 0 ]; then
  echo "❌ No ejecutes este script como root. Usa el usuario ubuntu/opc con sudo."
  exit 1
fi

echo "═══════════════════════════════════════"
echo " YallPos — Setup servidor Ubuntu"
echo "═══════════════════════════════════════"

echo "▶ Instalar Docker (si falta)"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y ca-certificates curl git ufw
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "⚠️  Cierra sesión SSH y vuelve a entrar para usar docker sin sudo, luego re-ejecuta este script."
  exit 0
fi

echo "▶ Firewall (SSH + puerto web)"
sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow "${WEB_PORT}/tcp" >/dev/null 2>&1 || true
echo "y" | sudo ufw enable >/dev/null 2>&1 || true

echo "▶ Clonar o actualizar repositorio en $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  sudo chown -R "$USER:$USER" "$INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull origin "$BRANCH"
else
  sudo mkdir -p "$(dirname "$INSTALL_DIR")"
  sudo chown "$USER:$USER" "$(dirname "$INSTALL_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chmod +x scripts/*.sh

if [ ! -f .env.production ]; then
  echo "▶ Crear .env.production"
  cp .env.production.example .env.production

  JWT_SECRET="$(openssl rand -hex 32)"
  PG_PASS="$(openssl rand -hex 16)"

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/cambiar-password-seguro-aqui/${PG_PASS}/" .env.production
    sed -i '' "s/cambiar-por-string-largo-aleatorio-min-32-chars/${JWT_SECRET}/" .env.production
  else
    sed -i "s/cambiar-password-seguro-aqui/${PG_PASS}/" .env.production
    sed -i "s/cambiar-por-string-largo-aleatorio-min-32-chars/${JWT_SECRET}/" .env.production
  fi

  echo ""
  echo "✅ .env.production creado con contraseñas aleatorias."
  echo "   RUN_SEED=true cargará el piloto Restaurante de Yall en el primer deploy."
fi

echo "▶ Primer despliegue"
./scripts/deploy.sh

PUBLIC_IP="$(curl -sf ifconfig.me 2>/dev/null || curl -sf icanhazip.com 2>/dev/null || echo 'TU-IP-PUBLICA')"

echo ""
echo "═══════════════════════════════════════"
echo " ✅ Servidor listo"
echo "═══════════════════════════════════════"
echo ""
echo "  URL:     http://${PUBLIC_IP}:${WEB_PORT}"
echo "  Mesero:  http://${PUBLIC_IP}:${WEB_PORT}/?view=waiter"
echo ""
echo "  Actualizar tras cambios en GitHub:"
echo "    cd $INSTALL_DIR && ./scripts/update-production.sh"
echo ""
echo "  Abre también el puerto ${WEB_PORT} en Oracle Cloud → Security List / Ingress Rules."
echo ""
