import { api } from "./api";
import { loadPrinterConfig, printerPayload, type PrinterConfig } from "./printers";
import { getStoredAuth } from "./auth";

const PRINT_AGENT = import.meta.env.VITE_PRINT_AGENT_URL || "http://localhost:9101";

function apiFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const branchId = api.defaults.headers.common["x-branch-id"];
  if (branchId) headers["x-branch-id"] = String(branchId);
  const auth = api.defaults.headers.common["Authorization"] ?? getStoredAuth()?.token;
  if (auth) headers.Authorization = String(auth).startsWith("Bearer ") ? String(auth) : `Bearer ${auth}`;
  return headers;
}

export type PrintAgentStatus = {
  ok: boolean;
  cash?: string;
  kitchen?: string;
  dual?: boolean;
  printer?: string;
};

export async function getPrintAgentStatus(): Promise<PrintAgentStatus | null> {
  try {
    const res = await fetch(`${PRINT_AGENT}/health`);
    if (!res.ok) return null;
    return await res.json() as PrintAgentStatus;
  } catch {
    return null;
  }
}

async function sendToPrintAgent(
  base64: string,
  target: "cash" | "kitchen",
  config?: PrinterConfig,
  override?: { printerIp?: string | null; printerPort?: number | null },
): Promise<boolean> {
  try {
    const payload = {
      base64,
      ...printerPayload(target, config),
      ...(override?.printerIp
        ? {
            printerIp: override.printerIp,
            printerPort: Number(override.printerPort) || 9100,
          }
        : {}),
    };
    const res = await fetch(`${PRINT_AGENT}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function openHtmlReceipt(invoiceId: string) {
  const htmlUrl = `${api.defaults.baseURL}/v1/print/invoices/${invoiceId}/receipt.html`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  const resp = await fetch(htmlUrl, { headers: apiFetchHeaders() });
  w.document.write(await resp.text());
  w.document.close();
  w.focus();
  w.print();
  return true;
}

async function openHtmlKitchen(invoiceId: string) {
  const htmlUrl = `${api.defaults.baseURL}/v1/print/invoices/${invoiceId}/kitchen.html`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  const resp = await fetch(htmlUrl, { headers: apiFetchHeaders() });
  w.document.write(await resp.text());
  w.document.close();
  return true;
}

async function openHtmlKitchenVoid(invoiceId: string) {
  const htmlUrl = `${api.defaults.baseURL}/v1/print/invoices/${invoiceId}/kitchen-void.html`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  const resp = await fetch(htmlUrl, { headers: apiFetchHeaders() });
  w.document.write(await resp.text());
  w.document.close();
  return true;
}

export function openDemoReceipt() {
  const now = new Date().toLocaleString("es-CO");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tiquete prueba</title>
<style>body{font-family:monospace;width:280px;margin:0 auto;font-size:12px}
hr{border:none;border-top:1px dashed #000} .c{text-align:center} .r{display:flex;justify-content:space-between}
</style></head><body>
<div class="c"><strong>Restaurante de Yall</strong><br>NIT 290329032903<br>Tiquete de prueba YallPos</div>
<hr><div class="r"><span>Nachos Yall x1</span><span>$18.000</span></div>
<div class="r"><span>Limonada x1</span><span>$9.000</span></div>
<hr><div class="r"><strong>TOTAL</strong><strong>$27.000</strong></div>
<div class="r"><span>Efectivo</span><span>$27.000</span></div>
<hr><div class="c">Comprobante interno (piloto)<br>${now}</div>
<script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export async function printInvoiceReceipt(invoiceId: string) {
  const config = loadPrinterConfig();
  const methods: string[] = [];

  try {
    const esc = await api.get(`/v1/print/invoices/${invoiceId}/receipt.escpos`);
    if (await sendToPrintAgent(esc.data.base64, "cash", config)) {
      methods.push("escpos-caja");
      return { ok: true, methods };
    }
  } catch {
    // continuar
  }

  try {
    const net = await api.post(`/v1/print/invoices/${invoiceId}/print`);
    if (net.data.ok) {
      methods.push(net.data.method);
      return { ok: true, methods };
    }
  } catch {
    // sin impresora de red
  }

  if (await openHtmlReceipt(invoiceId)) {
    methods.push("browser-html");
  }

  return { ok: methods.length > 0, methods };
}

export async function reprintInvoice(invoiceId: string) {
  return printInvoiceReceipt(invoiceId);
}

export async function printKitchenTicket(invoiceId: string) {
  const config = loadPrinterConfig();
  const methods: string[] = [];

  try {
    const byStation = await api.get(`/v1/print/invoices/${invoiceId}/kitchen-by-station.escpos`);
    const tickets = (byStation.data?.tickets ?? []) as Array<{
      stationId: string;
      stationName: string;
      printerIp: string | null;
      printerPort: number;
      printerName: string | null;
      lineCount: number;
      base64: string;
    }>;

    if (tickets.length > 0) {
      let printed = 0;
      for (const ticket of tickets) {
        const ip = ticket.printerIp || config.kitchenPrinterIp || null;
        const port = ticket.printerIp
          ? ticket.printerPort
          : Number(config.kitchenPrinterPort) || 9100;
        if (!ip && !config.kitchenPrinterIp) continue;
        const ok = await sendToPrintAgent(ticket.base64, "kitchen", config, {
          printerIp: ip || config.kitchenPrinterIp,
          printerPort: port,
        });
        if (ok) {
          printed += 1;
          methods.push(`escpos-${ticket.stationName}`);
        }
      }
      if (printed > 0) {
        return { ok: true, methods };
      }
    }
  } catch {
    // fallback al ticket único
  }

  try {
    const esc = await api.get(`/v1/print/invoices/${invoiceId}/kitchen.escpos`);
    if (await sendToPrintAgent(esc.data.base64, "kitchen", config)) {
      methods.push("escpos-cocina");
      return { ok: true, methods };
    }
  } catch {
    // continuar
  }

  if (await openHtmlKitchen(invoiceId)) {
    methods.push("browser-html");
  }

  return { ok: methods.length > 0, methods };
}

export async function printKitchenVoidTicket(invoiceId: string) {
  const config = loadPrinterConfig();
  const methods: string[] = [];

  try {
    const esc = await api.get(`/v1/print/invoices/${invoiceId}/kitchen-void.escpos`);
    if (await sendToPrintAgent(esc.data.base64, "kitchen", config)) {
      methods.push("escpos-cocina-anulado");
      return { ok: true, methods };
    }
  } catch {
    // continuar
  }

  if (await openHtmlKitchenVoid(invoiceId)) {
    methods.push("browser-html-anulado");
  }

  return { ok: methods.length > 0, methods };
}

export async function printKitchenLineVoidEscpos(payload: { base64: string }) {
  const config = loadPrinterConfig();
  if (await sendToPrintAgent(payload.base64, "kitchen", config)) {
    return { ok: true, methods: ["escpos-cocina-anulado"] };
  }
  return { ok: false, methods: [] as string[] };
}

async function openHtmlSeatingSlip(sessionId: string, reservationId?: string) {
  const params = reservationId ? `?reservationId=${encodeURIComponent(reservationId)}` : "";
  const htmlUrl = `${api.defaults.baseURL}/v1/print/table-sessions/${sessionId}/seating.html${params}`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  const resp = await fetch(htmlUrl, { headers: apiFetchHeaders() });
  w.document.write(await resp.text());
  w.document.close();
  return true;
}

export async function printSeatingSlip(sessionId: string, reservationId?: string) {
  const config = loadPrinterConfig();
  const params = reservationId ? `?reservationId=${encodeURIComponent(reservationId)}` : "";
  const methods: string[] = [];

  try {
    const esc = await api.get(`/v1/print/table-sessions/${sessionId}/seating.escpos${params}`);
    if (await sendToPrintAgent(esc.data.base64, "kitchen", config)) {
      methods.push("escpos-cocina-reserva");
      return { ok: true, methods };
    }
  } catch {
    // continuar
  }

  if (await openHtmlSeatingSlip(sessionId, reservationId)) {
    methods.push("browser-html-reserva");
  }

  return { ok: methods.length > 0, methods };
}

export async function printReportX(sessionId: string) {
  const config = loadPrinterConfig();

  try {
    const esc = await api.get(`/v1/cash/session/${sessionId}/report-x.escpos`);
    if (await sendToPrintAgent(esc.data.base64, "cash", config)) {
      return { ok: true, methods: ["escpos-caja"] };
    }
  } catch {
    // fallback
  }

  return { ok: false, methods: [] };
}

export async function testPrintAgent(target: "cash" | "kitchen" = "cash") {
  try {
    const esc = await api.get("/v1/print/test.escpos");
    const ok = await sendToPrintAgent(esc.data.base64, target, loadPrinterConfig());
    return { ok, bytes: esc.data.bytes, target };
  } catch (e: any) {
    return { ok: false, error: e.message, target };
  }
}

export async function testPrinter() {
  return getPrintAgentStatus();
}
