# YallPos

POS moderno para **restaurantes, panaderías y cafeterías** en Colombia.

## Stack

| Capa | Tecnología |
|------|------------|
| API | NestJS + Prisma + PostgreSQL |
| Web POS | React + Vite (PWA-ready) |
| KDS | Socket.IO realtime |
| Fiscal | Módulo DIAN propio (habilitación → producción) |
| Infra local | Docker Compose (Postgres + Redis) |

## Inicio rápido

### 1. Base de datos

```bash
cd /Users/macbookpro/project/yallpos
docker compose up -d
```

### 2. API

```bash
cp apps/api/.env.example apps/api/.env
cd apps/api
npm install
npx prisma migrate dev --name yallpos_mvp
npx prisma db seed
npm run start:dev
```

API: http://localhost:3000

### 3. Web

```bash
cd apps/web
npm install
npm run dev
```

### 4. Print Agent (opcional, en PC de caja)

```bash
cd apps/print-agent
PRINTER_IP=192.168.1.100 node index.js
```

## Flujo piloto completo

1. **Login** → `admin@yallpos.co` / `demo1234`
2. **+ Negocio** → wizard 5 pasos (o usar sucursal demo)
3. **Mostrador** → venta + escaneo barcode + cobrar + tiquete
4. **Dashboard** → ventas del día + cierre de caja
5. **Piloto** → certificado DIAN + enviar set habilitación

### Credenciales — Restaurante de Yall (piloto)

- Email: `admin@restaurantedeyall.co`
- Password: `yall2025`
- NIT: `290329032903`
- Certificado DIAN: ⏳ pendiente (modo simulación activo)

Ver [Guía piloto Restaurante de Yall](docs/PILOTO-RESTAURANTE-YALL.md)

## Sucursales demo (ver output del seed)

- **Restaurante** — mesas, comandas, KDS, catálogo
- **Panadería** — venta mostrador, productos por peso, categorías táctiles

## Módulos MVP

- [x] Auth multi-tenant
- [x] Catálogo con categorías y variantes
- [x] POS venta mostrador (panadería)
- [x] POS restaurante (mesas + comanda + KDS)
- [x] Caja (apertura, reporte X)
- [x] Inventario básico (stock + kardex en venta)
- [x] Facturación DE POS (habilitación DIAN propia)
- [x] Contingencia fiscal automática
- [x] Impresión tiquetes ESC/POS + Print Agent
- [x] Login en frontend
- [x] Dashboard ventas del día + cierre de caja
- [x] Escáner código de barras
- [x] Wizard onboarding + panel piloto
- [ ] Offline-first (fase 2)
- [ ] App móvil Flutter (fase 2)

## Documentación

- [PRD Producto](docs/PRD.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Módulo Fiscal DIAN](docs/FISCAL-DIAN.md)
- [Impresión tiquetes](docs/PRINT.md)
- [Guía piloto negocio](docs/PILOTO.md)
- [Roadmap](docs/ROADMAP.md)

## Estructura

```
yallpos/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React POS frontend
├── docs/             # Documentación producto/técnica
└── docker-compose.yml
```
