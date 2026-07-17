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

## Parte 4 — HTTPS (obligatorio para la huella / asistencia biométrica)

La marcación de asistencia con **huella (WebAuthn)** solo funciona sobre **HTTPS**.
YallPos ya trae **Caddy** integrado en Docker: obtiene y renueva el certificado
Let's Encrypt automáticamente. Solo tienes que indicar un dominio.

### 1. Abrir puertos 80 y 443

En **Oracle → Networking → VCN → Security List → Ingress rules** agrega:

| Puerto | Origen | Descripción |
|--------|--------|-------------|
| 80  | 0.0.0.0/0 | HTTP (validación del certificado) |
| 443 | 0.0.0.0/0 | HTTPS |

(En la VM, `setup-oracle-server.sh` ya abre 80/443 en `ufw`.)

### 2. Elegir dominio

**Opción A — con dominio propio** (ej. `pos.turestaurante.com`):
apunta un registro **A** a la IP pública de Oracle.

**Opción B — sin comprar dominio** (usa [sslip.io](https://sslip.io)):
toma tu IP pública y reemplaza los puntos por guiones + `.sslip.io`.
Ej. IP `140.238.1.2` → `140-238-1-2.sslip.io`. No requiere configurar DNS.

### 3. Activar (script automático)

Con los puertos 80/443 abiertos:

```bash
cd /opt/yallpos
./scripts/enable-https.sh --email tu-correo@dominio.com
```

El script detecta la IP pública, arma `APP_DOMAIN` con sslip.io, escribe
`.env.production` y levanta Caddy. Entra por la URL `https://…` que imprime.

Opciones útiles:

```bash
# Solo escribir el dominio, sin reiniciar (activar después)
./scripts/enable-https.sh --skip-deploy --email tu@correo.com

# Con dominio propio (registro A apuntando a la IP de Oracle)
./scripts/enable-https.sh --domain pos.turestaurante.com --email tu@correo.com
```

> Si dejas `APP_DOMAIN` vacío, todo sigue igual en `http://IP:8080` (sin huella).

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
