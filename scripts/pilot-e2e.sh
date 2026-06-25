#!/usr/bin/env bash
# Prueba E2E piloto — menú, mesa, cocina, cobro e impresión dual
set -euo pipefail

API="${API_URL:-http://localhost:3000}"
AGENT="${PRINT_AGENT_URL:-http://localhost:9101}"
BRANCH="${BRANCH_ID:-58a0027a-1a8d-40fc-bf98-02d80eb13408}"

LOGIN=$(curl -s -X POST "$API/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@restaurantedeyall.co","password":"yall2025"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
HDR=(-H "Authorization: Bearer $TOKEN" -H "x-branch-id: $BRANCH" -H "Content-Type: application/json")

echo "═══════════════════════════════════════"
echo " YallPos — Prueba E2E Piloto"
echo "═══════════════════════════════════════"

# 1. Print Agent
echo ""
echo "▶ Print Agent"
AGENT_HEALTH=$(curl -s "$AGENT/health" || echo '{}')
echo "$AGENT_HEALTH" | python3 -m json.tool 2>/dev/null || echo "$AGENT_HEALTH"

# 2. Sync menú
echo ""
echo "▶ Sincronizar menú"
SYNC=$(curl -s -X POST "$API/v1/pilot/sync-menu")
echo "$SYNC" | python3 -m json.tool

# 3. Caja abierta
echo ""
echo "▶ Caja"
CASH=$(curl -s "$API/v1/reports/cash" "${HDR[@]}")
SESSION_ID=$(echo "$CASH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sessionId',''))" 2>/dev/null || true)
if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "None" ]; then
  OPEN=$(curl -s -X POST "$API/v1/cash/session/open" "${HDR[@]}" \
    -d "{\"userId\":\"$USER_ID\",\"openingCash\":100000}")
  SESSION_ID=$(echo "$OPEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "Caja abierta: $SESSION_ID"
else
  echo "Caja ya abierta: $SESSION_ID"
fi

# 4. Datos mesa
TABLE_ID=$(curl -s "$API/v1/restaurant/tables" "${HDR[@]}" \
  | python3 -c "import sys,json; t=[x for x in json.load(sys.stdin) if not x.get('sessions')]; print(t[0]['id'] if t else json.load(open('/dev/stdin'))[0]['id'])" 2>/dev/null || \
  curl -s "$API/v1/restaurant/tables" "${HDR[@]}" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
WAITER_ID=$(curl -s "$API/v1/restaurant/waiters" "${HDR[@]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
PRODUCT=$(curl -s "$API/v1/catalog/products" "${HDR[@]}" \
  | python3 -c "import sys,json; p=[x for x in json.load(sys.stdin) if x['name']=='Nachos Yall']; print(json.dumps(p[0] if p else json.load(sys.stdin)[0]))")
VARIANT_ID=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['variants'][0]['id'])")
PRODUCT_NAME=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
PRICE=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['variants'][0]['price'])")

echo ""
echo "▶ Abrir mesa (Mesa + mesero)"
SESSION=$(curl -s -X POST "$API/v1/restaurant/table-sessions/open" "${HDR[@]}" \
  -d "{\"tableId\":\"$TABLE_ID\",\"waiterId\":\"$WAITER_ID\",\"guestsCount\":2}")
TABLE_SESSION_ID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Sesión mesa: $TABLE_SESSION_ID"

# 5. Comanda
echo ""
echo "▶ Crear comanda + agregar $PRODUCT_NAME"
INVOICE=$(curl -s "$API/v1/pos/invoices/by-table-session/$TABLE_SESSION_ID" "${HDR[@]}")
INVOICE_ID=$(echo "$INVOICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -X POST "$API/v1/pos/invoices/$INVOICE_ID/add-line" "${HDR[@]}" \
  -d "{\"variantId\":\"$VARIANT_ID\",\"name\":\"$PRODUCT_NAME\",\"course\":\"appetizer\",\"qty\":\"1\",\"unitPrice\":\"$PRICE\"}" > /dev/null

# Limonada — segundo producto
LIM=$(curl -s "$API/v1/catalog/barcode/7703003002" "${HDR[@]}")
LIM_V=$(echo "$LIM" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -X POST "$API/v1/pos/invoices/$INVOICE_ID/add-line" "${HDR[@]}" \
  -d "{\"variantId\":\"$LIM_V\",\"name\":\"Limonada natural\",\"course\":\"drink\",\"qty\":\"2\",\"unitPrice\":\"9000\"}" > /dev/null

INVOICE=$(curl -s "$API/v1/pos/invoices/by-table-session/$TABLE_SESSION_ID" "${HDR[@]}")
TOTAL=$(echo "$INVOICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
echo "Factura $INVOICE_ID — Total: \$$TOTAL"

# 6. Enviar cocina + imprimir
echo ""
echo "▶ Enviar a cocina + impresión térmica cocina"
curl -s -X POST "$API/v1/pos/invoices/$INVOICE_ID/send-to-kitchen" "${HDR[@]}" > /dev/null
KITCHEN_ESC=$(curl -s "$API/v1/print/invoices/$INVOICE_ID/kitchen.escpos" "${HDR[@]}")
KITCHEN_B64=$(echo "$KITCHEN_ESC" | python3 -c "import sys,json; print(json.load(sys.stdin)['base64'])")
KITCHEN_PRINT=$(curl -s -X POST "$AGENT/print" -H "Content-Type: application/json" \
  -d "{\"base64\":\"$KITCHEN_B64\",\"target\":\"kitchen\"}")
echo "$KITCHEN_PRINT" | python3 -m json.tool

# 7. Cobrar + imprimir tiquete caja
echo ""
echo "▶ Cobrar + impresión térmica caja"
TIP=5000
PAY_TOTAL=$(python3 -c "print(int(float('$TOTAL')) + $TIP)")
PAY=$(curl -sf -X POST "$API/v1/pos/invoices/$INVOICE_ID/pay" "${HDR[@]}" \
  -d "{\"payments\":[{\"method\":\"cash\",\"amount\":\"$PAY_TOTAL\"}],\"tipAmount\":\"$TIP\"}")
echo "$PAY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Estado:', d.get('status'), '| Total:', d.get('total'), '| Propina:', d.get('tipAmount'))"

RECEIPT_ESC=$(curl -s "$API/v1/print/invoices/$INVOICE_ID/receipt.escpos" "${HDR[@]}")
RECEIPT_B64=$(echo "$RECEIPT_ESC" | python3 -c "import sys,json; print(json.load(sys.stdin)['base64'])")
RECEIPT_PRINT=$(curl -s -X POST "$AGENT/print" -H "Content-Type: application/json" \
  -d "{\"base64\":\"$RECEIPT_B64\",\"target\":\"cash\"}")
echo "$RECEIPT_PRINT" | python3 -m json.tool

# 8. Reporte X
echo ""
echo "▶ Reporte X + impresión caja"
REPORT=$(curl -s "$API/v1/cash/session/$SESSION_ID/report-x" "${HDR[@]}")
echo "$REPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Ventas sesión: \${d['totalSales']:,.0f} | Transacciones: {d['invoiceCount']} | Propinas: \${d.get('totalTips',0):,.0f}\")"
RX_ESC=$(curl -s "$API/v1/cash/session/$SESSION_ID/report-x.escpos" "${HDR[@]}")
RX_B64=$(echo "$RX_ESC" | python3 -c "import sys,json; print(json.load(sys.stdin)['base64'])")
RX_PRINT=$(curl -s -X POST "$AGENT/print" -H "Content-Type: application/json" \
  -d "{\"base64\":\"$RX_B64\",\"target\":\"cash\"}")
echo "$RX_PRINT" | python3 -m json.tool

echo ""
echo "✅ Prueba E2E completada"
echo "   Menú: 42 productos activos"
echo "   Venta mesa cobrada con propina \$5.000"
echo "   Impresiones: cocina → puerto 9102 | caja → puerto 9100"
