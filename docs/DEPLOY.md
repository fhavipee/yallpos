# Despliegue YallPos — Restaurante de Yall

Despliegue en **Docker** para un servidor en la red del local (Mac mini, PC Linux o NUC).  
Un solo puerto (**8080**) sirve web + API (nginx hace proxy de `/v1/`).

---

## Requisitos

- Docker Desktop o Docker Engine + Compose v2
- Puertos libres: **8080** (POS web)
- Red LAN para tablets y cocina

---

## Despliegue rápido

```bash
cd /Users/macbookpro/project/yallpos
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

La primera vez crea `.env.production` desde el ejemplo. **Edita:**

| Variable | Qué poner |
|----------|-----------|
| `POSTGRES_PASSWORD` | Contraseña segura |
| `JWT_SECRET` | String aleatorio ≥ 32 caracteres |
| `RUN_SEED` | `true` solo la **primera** vez (carga piloto Yall) |
| `PRINTER_IP` / `KITCHEN_PRINTER_IP` | IPs reales de impresoras |
| `WEB_PORT` | Puerto expuesto (default `8080`) |

Vuelve a ejecutar `./scripts/deploy.sh`.

---

## Acceso en el restaurante

| Quién | URL |
|-------|-----|
| Caja / admin | `http://<IP-SERVIDOR>:8080` |
| Tablet mesero | `http://<IP-SERVIDOR>:8080/?view=waiter` |

Credenciales piloto: ver [PILOTO-RESTAURANTE-YALL.md](./PILOTO-RESTAURANTE-YALL.md).

---

## Print Agent (PC de caja)

El agente **no va en Docker** — corre en el PC donde está la impresora USB/red, porque el navegador llama a `localhost:9101`:

```bash
cd apps/print-agent
PRINTER_IP=192.168.1.100 \
KITCHEN_PRINTER_IP=192.168.1.101 \
node index.js
```

Opcional: arrancar al inicio con `launchd` (macOS) o `systemd` (Linux).

---

## Comandos útiles

```bash
# Ver logs
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f

# Reiniciar
docker compose -f docker-compose.prod.yml --env-file .env.production restart

# Detener
docker compose -f docker-compose.prod.yml --env-file .env.production down

# Actualizar tras cambios de código
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## Migrar datos del dev local (opcional)

Si ya tienes datos en Postgres dev (`localhost:5435`):

```bash
pg_dump -h localhost -p 5435 -U yallpos yallpos > yallpos-backup.sql
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres
docker exec -i yallpos-prod-postgres psql -U yallpos -d yallpos < yallpos-backup.sql
```

Luego `RUN_SEED=false` y reinicia el stack.

---

## HTTPS (opcional)

Para producción con dominio, pon **Caddy** o **nginx** delante del puerto 8080, o cambia `WEB_PORT` a 443 con certificados en un reverse proxy externo.

---

## Arquitectura

```
Tablet / PC navegador  →  :8080  web (nginx)
                              ├─ /        → React POS
                              └─ /v1/*    → api:3000 (NestJS)
Print Agent :9101      →  impresoras ESC/POS (solo en PC caja)
postgres + redis       →  solo red interna Docker
```

---

## Checklist post-despliegue

1. Login admin en `http://<IP>:8080`
2. Piloto → simulación o checklist OK
3. Tablet mesero → login mesero
4. Print Agent en caja + test impresión
5. Cuando llegue `.p12` → ver [DIAN-HABILITACION.md](./DIAN-HABILITACION.md)
