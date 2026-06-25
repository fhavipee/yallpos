# YallPos — Impresión de tiquetes

## Modos de impresión (en orden de prioridad)

| # | Modo | Cuándo usar |
|---|------|-------------|
| 1 | **Print Agent** | Impresora USB/red en PC de caja |
| 2 | **Red directa** | Impresora con IP fija en la red local |
| 3 | **HTML navegador** | Fallback sin impresora térmica |

## 1. Print Agent (recomendado)

```bash
# Terminal en la PC de la caja
cd apps/print-agent
PRINTER_IP=192.168.1.100 node index.js
```

Variables:
- `PRINTER_IP` — IP de la impresora (puerto 9100)
- `PRINT_AGENT_PORT` — puerto del agente (default 9101)

En el frontend (`apps/web/.env`):
```
VITE_PRINT_AGENT_URL=http://localhost:9101
```

## 2. Impresora de red desde API

En `apps/api/.env`:
```
PRINTER_IP=192.168.1.100
```

La API envía bytes ESC/POS directo al puerto 9100.

## 3. Fallback HTML

Si no hay agente ni IP, se abre ventana de impresión del navegador con tiquete formateado para 80mm.

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/v1/print/invoices/:id/receipt` | JSON del tiquete |
| GET | `/v1/print/invoices/:id/receipt.html` | HTML imprimible |
| GET | `/v1/print/invoices/:id/receipt.escpos` | Base64 ESC/POS |
| POST | `/v1/print/invoices/:id/print` | Imprimir en red |
| POST | `/v1/print/test?printerIp=` | Tiquete de prueba |

## Impresoras compatibles

Epson TM-T20, TM-T88, Star TSP100, Bixolon SRP-350 y clones ESC/POS de 58mm/80mm.

## Flujo automático

Al cobrar una venta, el POS intenta imprimir automáticamente:
1. Print Agent → ESC/POS
2. API red → ESC/POS
3. Navegador → HTML

## Contenido del tiquete

- Razón social y NIT
- Número DE POS y CUDE
- Leyenda **CONTINGENCIA** si aplica
- Líneas de venta, IVA, total
- Medios de pago
