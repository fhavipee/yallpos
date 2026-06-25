# YallPos — Guía de piloto con negocio real

## Objetivo del piloto

Validar en 2 semanas que YallPos funciona en operación real con:
- Ventas diarias sin fricción
- Tiquetes impresos correctamente
- DE POS aceptados por DIAN (habilitación)
- Cierre de caja cuadrado

## Perfil ideal del piloto

| Tipo | Ideal | Por qué |
|------|-------|---------|
| **Panadería** | 1-2 cajas, 50-200 ventas/día | Flujo simple, alto volumen |
| **Restaurante** | 5-15 mesas, 1 cocina | Valida KDS + comandas |
| **Cafetería** | Mostrador + pocas mesas | Mix de ambos flujos |

## Semana 0 — Preparación (1-2 días)

### Checklist técnico

- [ ] Docker + API + Web funcionando
- [ ] Certificado .p12 del negocio en `apps/api/certs/`
- [ ] `FISCAL_ENV=habilitacion` en `.env`
- [ ] `FISCAL_TEST_SET_ID` del portal DIAN
- [ ] Impresora térmica conectada + Print Agent corriendo
- [ ] Tablet o PC en mostrador con navegador

### Checklist negocio

- [ ] NIT y razón social verificados
- [ ] Resolución DE POS vigente
- [ ] Catálogo inicial con precios reales
- [ ] Capacitación cajero: 30 minutos

## Semana 1 — Onboarding

### Día 1: Configuración

1. Abrir web → pestaña **Nuevo negocio**
2. Completar wizard de 5 pasos:
   - Negocio (NIT, vertical)
   - Sucursal
   - Resolución DIAN
   - Catálogo plantilla
   - Apertura de caja
3. Anotar `branchId` generado
4. Seleccionar sucursal en el selector

### Día 2: Pruebas internas

| Prueba | Criterio éxito |
|--------|----------------|
| Venta mostrador | < 30 seg por cliente |
| Impresión tiquete | Legible, datos correctos |
| DE POS | Número consecutivo correcto |
| Venta por peso (panadería) | Total = precio × kg |
| Comanda + KDS (restaurante) | Ticket aparece en cocina < 2s |
| Cierre de caja | Diferencia < $1.000 |

### Día 3-5: Operación paralela

- Correr YallPos **en paralelo** con sistema actual
- Comparar totales al cierre del día
- Registrar incidencias

## Semana 2 — Go-live

### Día 8-10: Solo YallPos

- Sistema anterior como respaldo (no en uso)
- Soporte WhatsApp directo con el equipo YallPos
- Revisión diaria de documentos DIAN

### Día 11-14: Evaluación

| Métrica | Meta |
|---------|------|
| Ventas procesadas | 100% en YallPos |
| Documentos DIAN rechazados | 0 |
| Tiempo promedio de venta | < 45 seg |
| Satisfacción cajero (1-5) | ≥ 4 |
| Diferencias de caja | < 2% de días |

## API de onboarding

```bash
# Paso 1 — Negocio
POST /v1/onboarding/step/business

# Paso 2 — Sucursal
POST /v1/onboarding/step/branch

# Paso 3 — Resolución DIAN
POST /v1/onboarding/step/fiscal

# Paso 4 — Catálogo plantilla
POST /v1/onboarding/step/catalog

# Paso 5 — Abrir caja
POST /v1/onboarding/step/golive

# Estado del piloto
GET /v1/onboarding/pilot-status/:companyId
```

## Habilitación DIAN durante piloto

```bash
# Verificar certificado
GET /v1/fiscal/config

# Enviar set de pruebas
POST /v1/fiscal/habilitation/test-set?branchId=UUID

# Consultar estado
GET /v1/fiscal/habilitation/status/:zipKey
```

## Plan de soporte piloto

| Canal | SLA |
|-------|-----|
| WhatsApp grupo piloto | Respuesta < 2h (horario comercial) |
| Bug crítico (no puede vender) | < 1h |
| Bug menor | < 24h |
| Capacitación adicional | 1 sesión incluida |

## Criterios para pasar de piloto a cliente

- [ ] 14 días operando sin bloqueos críticos
- [ ] ≥ 95% documentos DIAN aceptados
- [ ] Cajero opera sin asistencia después de día 3
- [ ] Dueño ve reporte de ventas diarias
- [ ] Dispuesto a dar testimonio / referencia

## Rollback

Si el piloto falla:
1. Volver al sistema anterior (datos en YallPos exportables vía API)
2. Documentar causa raíz
3. Corregir y re-piloto en 2 semanas
