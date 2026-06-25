# YallPos — Arquitectura Técnica

## Diagrama MVP

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  React PWA  │     │  KDS Screen │     │  Admin Web  │
│  (POS Web)  │     │  (Socket.IO)│     │  (fase 2)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │ REST + WS
                    ┌──────▼──────┐
                    │  NestJS API │
                    │  (modular)  │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │ PostgreSQL  │ │    Redis    │ │  BullMQ     │
    │ (transacc.) │ │   (cache)   │ │  (fiscal)   │
    └─────────────┘ └─────────────┘ └─────────────┘
```

## Módulos NestJS

| Módulo | Responsabilidad |
|--------|-----------------|
| `auth` | Login, registro tenant, usuarios |
| `catalog` | Productos, categorías, barcode |
| `pos` | Ventas, líneas, pagos |
| `restaurant` | Mesas, sesiones, meseros |
| `kds` | Tickets cocina, Socket.IO |
| `cash` | Caja, apertura, cierre, reporte X |
| `fiscal` | DE POS, XML, DIAN, contingencia |
| `prisma` | ORM, multi-tenant via tenant_id |

## Multi-tenant

```
Tenant → Company → Branch → Warehouse/CashRegister
```

- Aislamiento lógico por `tenant_id` / `company_id`
- Fase enterprise: RLS PostgreSQL + DB dedicada

## Modelo de datos core

Ver `apps/api/prisma/schema.prisma`

Entidades críticas:
- `SalesInvoice` + `SalesInvoiceLine` + `Payment`
- `ElectronicDocument` + `FiscalResolution`
- `Product` + `ProductVariant` + `StockLevel`
- `TableSession` + `KdsTicket`

## Fiscal (desarrollo propio)

```
Pago confirmado
  → FiscalService.issuePosEquivalent()
  → DianXmlBuilder.buildPosEquivalent()  // UBL 2.1 simplificado
  → DianClient.sendDocument()            // habilitación: simulado
  → ElectronicDocument (accepted|contingency)
  → Retry queue si contingency
```

### Fases fiscal

| Fase | Entorno | Acción |
|------|---------|--------|
| 1 | Habilitación | XML + CUFE simulado ✅ |
| 2 | Habilitación DIAN | Certificado .p12 + WS real |
| 3 | Producción | Firma, envío, validación CUFE oficial |

## Escalabilidad

| Etapa | Estrategia |
|-------|------------|
| MVP | Monolito modular, 1 RDS |
| 1K tenants | Read replica, Redis cache catálogo |
| 10K+ | Separar worker fiscal, ClickHouse analytics |
| Enterprise | Sharding por tenant, infra dedicada |

## Seguridad

- Passwords: SHA-256 + salt (MVP) → bcrypt/argon2 (producción)
- JWT + 2FA (fase 2)
- Audit log en operaciones críticas
- Certificados fiscales en KMS/HSM

## CI/CD (fase 2)

```
GitHub Actions → tests → build Docker → deploy ECS/Railway
```
