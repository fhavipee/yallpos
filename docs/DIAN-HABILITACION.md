# Habilitación DIAN — YallPos (Restaurante de Yall)

Guía paso a paso para pasar de **simulación** a **habilitación** y luego **producción**, sin activar facturación real hasta tener el certificado `.p12`.

## Estado actual del piloto

- `FISCAL_ENV=simulacion` — comprobantes internos al cobrar
- Certificado `.p12` pendiente
- Checklist en vivo: **Panel piloto → Checklist habilitación DIAN** o `GET /v1/fiscal/habilitation/checklist?branchId=...`

## 1. Certificado digital (.p12)

1. Obtenga el certificado en Cámara de Comercio (persona jurídica, NIT empresa).
2. Copie el archivo a `apps/api/certs/certificado.p12`.
3. Configure en `apps/api/.env`:

```env
FISCAL_CERT_PATH="./certs/certificado.p12"
FISCAL_CERT_PASSWORD="su-contraseña"
```

4. Reinicie la API y verifique:

```bash
curl http://localhost:3000/v1/fiscal/config
# o POST /v1/fiscal/certificate/reload
```

## 2. Datos de empresa y resolución

En **Configuración → Empresa** y **Resolución DE POS**:

- NIT y DV correctos
- Prefijo, rango y vigencia de la resolución DE POS
- **Clave técnica** real (no placeholder `pendiente`)

## 3. Software DIAN

En `apps/api/.env`:

```env
FISCAL_SOFTWARE_ID="..."
FISCAL_SOFTWARE_PIN="..."
FISCAL_TEST_SET_ID="..."   # Set de prueba del portal MUISCA
```

Registre el software en el portal DIAN antes de habilitación.

## 4. Entorno habilitación

Cuando el checklist muestre **todos los requisitos bloqueantes en verde**:

```env
FISCAL_ENV="habilitacion"
```

Reinicie la API. Endpoints DIAN apuntan al ambiente de habilitación.

## 5. Enviar set de prueba

Desde **Panel piloto → Enviar set habilitación** o:

```bash
curl -X POST "http://localhost:3000/v1/fiscal/habilitation/test-set?branchId=SU_BRANCH_ID" \
  -H "Authorization: Bearer TOKEN"
```

Revise la respuesta (`trackId`, estado ZIP). Use `GET /v1/fiscal/habilitation/status/:zipKey` si aplica.

## 6. Validación DIAN

- Confirme en portal DIAN que el set fue aceptado
- Corrija errores de XML, NIT, resolución o firma según respuesta
- `POST /v1/fiscal/retry-pending?branchId=...` reintenta documentos fallidos

## 7. Producción

**Solo después de aprobación DIAN:**

```env
FISCAL_ENV="produccion"
```

- Haga una venta de prueba controlada
- Verifique CUFE/CUDE en comprobante
- Mantenga backup del `.p12` y contraseña en lugar seguro

## Variables de entorno (referencia)

| Variable | Descripción |
|----------|-------------|
| `FISCAL_ENV` | `simulacion` \| `habilitacion` \| `produccion` |
| `FISCAL_CERT_PATH` | Ruta al `.p12` |
| `FISCAL_CERT_PASSWORD` | Contraseña del certificado |
| `FISCAL_SOFTWARE_ID` | ID software registrado DIAN |
| `FISCAL_SOFTWARE_PIN` | PIN software |
| `FISCAL_TEST_SET_ID` | Set de prueba MUISCA |

## No hacer en piloto operativo

- No cambiar a `produccion` sin certificado y habilitación aprobada
- No compartir `.p12` ni contraseña por chat/email
- No omitir prueba de impresión de tiquete fiscal tras go-live DIAN
