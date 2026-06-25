# Piloto — Restaurante de Yall

**Estado:** En preparación · **Certificado DIAN:** ⏳ Esperando

| Dato | Valor |
|------|-------|
| Negocio | Restaurante de Yall |
| NIT | 290329032903 |
| Vertical | Restaurante |
| Prefijo DE POS (provisional) | YALL |
| Modo fiscal actual | `simulacion` |

---

## Acceso al sistema

```
Email:    admin@restaurantedeyall.co
Password: yall2025
URL:      http://localhost:5173
```

**Mesero (solo Mesas + Comanda, modo quiosco):**

```
Email:    mesero@restaurantedeyall.co
Password: mesero2025
```

Tras el seed, la sucursal se selecciona automáticamente al login.

**Permisos API:** todas las rutas (excepto login y `GET /v1/pilot/config`) requieren `Authorization: Bearer <token>`. El rol `waiter` solo puede operar mesas/comanda; reportes, config, piloto y fiscal quedan bloqueados en servidor.

**BranchId:** `58a0027a-1a8d-40fc-bf98-02d80eb13408`

---

## Qué puedes hacer HOY (sin certificado)

| Acción | Pestaña |
|--------|---------|
| Abrir mesas y tomar pedidos | Mesas → Comanda |
| Enviar a cocina | Comanda → KDS |
| Cobrar y emitir DE POS simulado | Comanda → Pagar |
| Imprimir tiquete | Automático al cobrar |
| Ver ventas del día | Dashboard |
| Cerrar caja | Dashboard |
| Ver checklist piloto | Piloto |

Los documentos fiscales se generan en modo **simulación** con prefijo `YALL00000001`, etc. Son válidos para pruebas operativas, **no** para DIAN hasta habilitación.

---

## Go-live operativo (3 pasos finales)

| Paso | Dónde | Qué hacer |
|------|-------|-----------|
| **Impresión** | Piloto → Impresión | Test caja / cocina o tiquete demo — se marca solo en checklist |
| **Prueba en piso** | Piloto → Prueba en piso | Tablet con `mesero@restaurantedeyall.co` / `mesero2025` → abrir mesa, comanda, cobro |
| **Capacitación** | Capacitación | Practica los 10 pasos → **Finalizar capacitación** (actualiza checklist) |

Opcional: **3 días operación paralela** — marcar manual en Piloto cuando compares con el sistema anterior.

---

## Cuando llegue el certificado .p12

### Paso 1 — Instalar certificado

```bash
cp tu-certificado.p12 /Users/macbookpro/project/yallpos/apps/api/certs/certificado.p12
```

### Paso 2 — Actualizar `.env`

```env
FISCAL_ENV=habilitacion
FISCAL_CERT_PATH=./certs/certificado.p12
FISCAL_CERT_PASSWORD=password-del-certificado
FISCAL_TEST_SET_ID=id-del-set-portal-dian
FISCAL_SOFTWARE_ID=YALLPOS-001
FISCAL_SOFTWARE_PIN=pin-registrado-en-dian
```

### Paso 3 — Actualizar resolución real

En `apps/api/src/config/pilot-yall.config.ts`:

```typescript
fiscal: {
  prefix: "XXXX",        // prefijo de la resolución DIAN
  fromNumber: 1,
  toNumber: 5000,
  validFrom: "2025-XX-XX",
  validTo: "2027-XX-XX",
  technicalKey: "clave-tecnica-dian",
},
company: {
  dv: "X",               // dígito de verificación si aplica
}
```

Luego actualizar en base de datos o re-ejecutar migración de resolución.

### Paso 4 — Reiniciar API y verificar

```bash
cd apps/api && npm run start:dev
```

Web → **Piloto** → debe mostrar certificado ✅ cargado.

### Paso 5 — Enviar set de habilitación

Web → **Piloto** → **Enviar set habilitación**

O por API:

```bash
curl -X POST "http://localhost:3000/v1/fiscal/habilitation/test-set?branchId=TU_BRANCH_ID"
```

### Paso 6 — Tras aprobación DIAN

```env
FISCAL_ENV=produccion
```

---

## Menú precargado (editable después)

Sincronizar menú oficial: Web → **Piloto** → **Sincronizar menú piloto**  
O API: `POST /v1/pilot/sync-menu`

| Categoría | Productos |
|-----------|-----------|
| Entradas | Patacones, Empanadas, Nachos Yall, Sopa del día, Arepitas |
| Platos fuertes | Bandeja Paisa Yall, Hamburguesa, Churrasco, Pollo curry, Salmón, Pasta |
| Bebidas | Gaseosa, Limonada, Jugo, Cerveza artesanal, Agua, Café |
| Postres | Tres leches, Brownie, Helado artesanal |

---

## Mesas configuradas

**Salón:** M1 (2p), M2 (4p), M3 (4p), M4 (6p)  
**Terraza:** T1 (4p), T2 (4p)

**KDS:** Cocina (platos/entradas/postres) · Barra (bebidas)

---

## Checklist pre go-live

- [ ] Certificado .p12 instalado
- [ ] Resolución DIAN real cargada (prefijo + rango)
- [ ] Set de habilitación enviado y aprobado
- [ ] Venta de prueba con DE POS aceptado
- [ ] Tiquete impreso correctamente
- [ ] Cierre de caja cuadrado
- [ ] Capacitación meseros (30 min)
- [ ] 3 días operación paralela (opcional)

---

## Contacto soporte piloto

Documentar incidencias en pestaña **Piloto** → estado del negocio.

Cuando tengas el certificado, avísame y activamos habilitación DIAN juntos.
