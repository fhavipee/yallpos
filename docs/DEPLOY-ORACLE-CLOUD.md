# YallPos en Oracle Cloud (gratis permanente + actualizaciones)

Guía para montar el POS en una **VM gratuita siempre activa** de Oracle Cloud y **actualizar** cuando subas cambios a GitHub.

---

## Por qué Oracle Cloud Free Tier

| Ventaja | Detalle |
|---------|---------|
| **Gratis permanente** | VM Ampere (hasta 4 OCPU / 24 GB RAM) sin caducar |
| **Docker completo** | Postgres + API + Web en un solo servidor (como en el restaurante) |
| **Actualizaciones** | `git pull` + script, o deploy automático con GitHub Actions |
| **WebSockets** | KDS y mesas en tiempo real funcionan con el nginx incluido |

**Limitación:** la impresión física (Print Agent) sigue siendo en el PC local del restaurante; en la nube puedes usar todo lo demás.

---

## Parte 1 — Crear la VM (una sola vez, ~30 min)

### 1. Cuenta Oracle Cloud

1. Entra en [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
2. Regístrate (pide tarjeta para verificar; no cobra si te quedas en recursos Always Free).
3. Elige región cercana (ej. `sa-saopaulo-1` o `us-ashburn-1`).

### 2. Instancia Compute

1. **Compute → Instances → Create instance**
2. Nombre: `yallpos`
3. Imagen: **Ubuntu 22.04** (o 24.04)
4. Shape: **Ampere** → `VM.Standard.A1.Flex` → 2 OCPU, 12 GB RAM (suficiente)
5. Red: asignar IP pública
6. SSH keys: descarga la clave `.pem` o pega tu clave pública
7. Crear

### 3. Abrir puertos (importante)

En **Networking → Virtual cloud networks → tu VCN → Security list → Ingress rules**:

| Puerto | Origen | Descripción |
|--------|--------|-------------|
| 22 | 0.0.0.0/0 | SSH |
| 8080 | 0.0.0.0/0 | YallPos web (o 80 si prefieres) |

También en la VM con `ufw` (lo hace el script de setup).

### 4. Conectar por SSH

```bash
chmod 400 tu-clave.pem
ssh -i tu-clave.pem ubuntu@<IP-PUBLICA>
```

(En Oracle a veces el usuario es `opc` en imágenes Oracle Linux; en Ubuntu es `ubuntu`.)

---

## Parte 2 — Instalar YallPos en el servidor (una sola vez)

### Opción A — Script automático (recomendado)

```bash
git clone https://github.com/fhavipee/yallpos.git /opt/yallpos
cd /opt/yallpos
chmod +x scripts/setup-oracle-server.sh
./scripts/setup-oracle-server.sh
```

Si Docker se instaló por primera vez, **cierra SSH, vuelve a entrar** y ejecuta el script otra vez.

### Opción B — Manual

```bash
cd /opt/yallpos
cp .env.production.example .env.production
# Edita POSTGRES_PASSWORD, JWT_SECRET; deja RUN_SEED=true la primera vez
./scripts/deploy.sh
```

### Verificar

Abre en el navegador:

```
http://<IP-PUBLICA>:8080
```

Login piloto: ver [PILOTO-RESTAURANTE-YALL.md](./PILOTO-RESTAURANTE-YALL.md).

Tras el primer arranque exitoso, edita `.env.production`:

```bash
RUN_SEED=false
```

---

## Parte 3 — Actualizar el proyecto (cada vez que hay cambios)

### Manual (desde tu Mac o desde el servidor)

```bash
ssh -i tu-clave.pem ubuntu@<IP-PUBLICA>
cd /opt/yallpos
./scripts/update-production.sh
```

Eso hace: `git pull` → rebuild Docker → reinicio → health check.

### Automático con GitHub Actions (recomendado para trabajar en línea)

Cada `push` a `main` despliega solo en el servidor.

#### 1. Clave SSH solo para deploy (en tu Mac)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/yallpos-deploy -N ""
```

En el servidor (`ubuntu@<IP>`):

```bash
mkdir -p ~/.ssh
echo "TU_CLAVE_PUBLICA" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### 2. Secrets en GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valor |
|--------|--------|
| `ORACLE_HOST` | IP pública de la VM |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | Contenido de `~/.ssh/yallpos-deploy` (privada) |
| `ORACLE_APP_DIR` | `/opt/yallpos` (opcional) |

#### 3. Flujo de trabajo

```bash
# En tu Mac, tras desarrollar:
git add .
git commit -m "mi cambio"
git push origin main
```

GitHub Actions ejecuta `.github/workflows/deploy-oracle.yml` y corre `update-production.sh` en el servidor.

Ver progreso: pestaña **Actions** en GitHub.

---

## Parte 4 — HTTPS con dominio (opcional)

Si tienes un dominio (ej. `pos.turestaurante.com`):

1. Apunta un registro **A** a la IP de Oracle.
2. Instala Caddy en la VM:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
pos.turestaurante.com {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl reload caddy
```

Abre puerto **443** en Oracle Security List.

---

## Comandos útiles en el servidor

```bash
cd /opt/yallpos

# Logs en vivo
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f

# Solo API
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api

# Reiniciar sin rebuild
docker compose -f docker-compose.prod.yml --env-file .env.production restart

# Estado
curl -s http://127.0.0.1:8080/v1/health
```

---

## Resumen del flujo

```
Desarrollo local (Mac)
       │
       ▼ git push main
  GitHub (fhavipee/yallpos)
       │
       ▼ GitHub Actions SSH
  Oracle VM /opt/yallpos
       │
       ▼ update-production.sh
  Docker: postgres + api + web :8080
       │
       ▼
  Tablets / navegador → http://IP:8080
```

---

## Checklist

- [ ] VM Oracle creada (Ampere, Ubuntu)
- [ ] Puertos 22 y 8080 abiertos en Security List
- [ ] `setup-oracle-server.sh` ejecutado
- [ ] `http://IP:8080` carga y login OK
- [ ] `RUN_SEED=false` tras primer deploy
- [ ] Secrets de GitHub Actions configurados (opcional)
- [ ] Prueba: push a `main` y verificar Actions verde

---

## Alternativa rápida (sin Oracle)

Si solo necesitas verlo **hoy** sin montar VM:

```bash
# Con API y web corriendo en tu Mac
npx cloudflared tunnel --url http://localhost:8080
```

Eso da una URL temporal; no es permanente ni ideal para el restaurante.
