# YallPos — PRD (Product Requirements Document)

**Versión:** 0.1 MVP  
**Vertical inicial:** Restaurantes, panaderías, cafeterías  
**Mercado:** Colombia (DIAN) → Latinoamérica  

---

## 1. Visión del producto

YallPos es un POS en la nube diseñado para ser:
- **Más rápido** que Siigo en el punto de venta
- **Más completo** que Alegra en inventario y omnicanal
- **Más robusto** que Vendty en fiscal y escalabilidad
- **Adaptado** a la realidad colombiana: DE POS, contingencia, internet inestable

## 2. Usuarios objetivo

| Persona | Necesidad |
|---------|-----------|
| Dueño de panadería | Vender rápido, controlar mermas, facturar sin complicaciones |
| Administrador restaurante | Mesas, cocina, propinas, cierre de caja |
| Cajero | Interfaz simple, 3 pasos máximo |
| Contador | Documentos DIAN válidos, exportación |

## 3. MVP — Alcance funcional

### 3.1 Restaurante

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Mapa de mesas por área | P0 | ✅ |
| Apertura mesa + mesero | P0 | ✅ |
| Comanda con modificadores | P0 | ✅ |
| Envío a cocina (KDS) | P0 | ✅ |
| KDS realtime por estación | P0 | ✅ |
| Pago mixto | P1 | ✅ parcial |
| Propinas | P1 | 🔲 |
| División de cuenta | P2 | 🔲 |

### 3.2 Panadería

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Venta mostrador táctil | P0 | ✅ |
| Categorías con color | P0 | ✅ |
| Venta por peso (kg) | P0 | ✅ |
| Escáner código barras | P1 | 🔲 |
| Producción diaria | P2 | 🔲 |

### 3.3 Transversal MVP

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Login multi-tenant | P0 | ✅ |
| Catálogo productos | P0 | ✅ |
| Caja apertura/cierre | P0 | ✅ |
| DE POS DIAN | P0 | ✅ habilitación |
| Inventario básico | P0 | ✅ |
| Reporte X | P0 | ✅ |
| Dashboard | P1 | 🔲 |

## 4. Flujos principales

### Restaurante (≤3 pasos en caja)

```
Mesas → Abrir mesa → Comanda → Agregar platos → Enviar cocina
     → KDS prepara → Servir → Pagar → DE POS automático
```

### Panadería (≤2 pasos)

```
Mostrador → Tocar producto → Cobrar → Tiquete + DE POS
```

## 5. Reglas de negocio

| ID | Regla |
|----|-------|
| RN-01 | No vender sin caja abierta (venta mostrador) |
| RN-02 | IVA 19% calculado por producto |
| RN-03 | Al pagar → descontar inventario automático |
| RN-04 | Al pagar → emitir DE POS automático |
| RN-05 | Si DIAN falla → contingencia + cola reintento |
| RN-06 | Resolución vencida → bloquear emisión |
| RN-07 | Mesa abierta → solo una sesión activa |

## 6. Métricas de éxito MVP

| Métrica | Objetivo |
|---------|----------|
| Tiempo agregar producto | < 1 segundo |
| Tiempo cobrar | < 3 segundos |
| Emisión DE POS | < 5 segundos (habilitación) |
| Uptime API | 99.5% |
| Onboarding | < 15 minutos |

## 7. Fuera de alcance MVP

- App móvil nativa
- Offline-first completo
- E-commerce sync
- WhatsApp
- IA predictiva
- Multi-sucursal consolidado
- Factura electrónica B2B (solo DE POS en MVP)

## 8. Planes SaaS (referencia)

Ver README principal. MVP opera en plan Profesional demo.
