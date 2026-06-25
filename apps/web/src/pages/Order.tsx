import { useEffect, useMemo, useState, useCallback } from "react";
import { api, formatApiError, setBranchId, formatCOP } from "../lib/api";
import { canVoidInvoice, getStoredAuth } from "../lib/auth";
import { printInvoiceReceipt, printKitchenTicket, printKitchenVoidTicket } from "../lib/print";
import { dispatchTableUpdated, TABLE_READY_EVENT, TABLE_SERVED_EVENT, type TableReadyDetail, type TableServedDetail } from "../lib/kdsSocket";
import PaymentModal from "../components/PaymentModal";
import { useBarcodeScanner } from "../lib/barcode";
import { useTheme } from "../lib/theme";
import type { WaiterIdentity } from "../lib/pin";
import { assignTableWaiter } from "../lib/waiterAttribution";

type Product = {
  id: string;
  name: string;
  categoryId?: string;
  course?: string;
  category?: { id: string; name: string; color?: string };
  variants: { id: string; name: string; price: string }[];
};

type Category = { id: string; name: string; color?: string };

export default function Order({
  branchId,
  tableSessionId,
  onPaid,
  activeWaiter,
}: {
  branchId: string;
  tableSessionId: string;
  onPaid?: () => void;
  activeWaiter?: WaiterIdentity | null;
}) {
  const { productCardBg } = useTheme();
  const [invoice, setInvoice] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [newWaiterId, setNewWaiterId] = useState("");
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string>("");
  const [showSplit, setShowSplit] = useState(false);
  const [splitLineIds, setSplitLineIds] = useState<string[]>([]);
  const [voiding, setVoiding] = useState(false);
  const [updatingQtyId, setUpdatingQtyId] = useState<string | null>(null);
  const [updatingNoteId, setUpdatingNoteId] = useState<string | null>(null);
  const [dailyMenu, setDailyMenu] = useState<{ note?: string; items: { productId: string; name: string; price: number }[] }>({ items: [] });
  const [kitchenReadyAlert, setKitchenReadyAlert] = useState<TableReadyDetail | null>(null);
  const [reprintingKitchen, setReprintingKitchen] = useState(false);
  const [markingServed, setMarkingServed] = useState(false);
  const canVoid = canVoidInvoice(getStoredAuth()?.user);

  useEffect(() => { setBranchId(branchId); }, [branchId]);

  useEffect(() => {
    api.get("/v1/restaurant/waiters").then((res) => setWaiters(res.data));
  }, [branchId]);

  useEffect(() => {
    Promise.all([
      api.get("/v1/catalog/products"),
      api.get("/v1/catalog/categories"),
    ]).then(([p, c]) => {
      setProducts(p.data);
      setCategories(c.data);
    });
  }, [branchId]);

  function syncKitchenReadyAlert(inv: any) {
    if (inv?.tableReadyNotifiedAt && !inv?.tableReadyServedAt) {
      const table = inv.tableSession?.table;
      const label = table
        ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
        : "Mesa";
      const base: TableReadyDetail = {
        invoiceId: inv.id,
        tableSessionId: inv.tableSessionId,
        tableId: inv.tableId,
        tableLabel: label,
        itemsSummary: inv.lines?.slice(0, 3).map((l: any) => l.nameSnapshot).join(", "),
      };
      setKitchenReadyAlert(base);
      api.get("/v1/pos/table-ready-queue").then((res) => {
        const row = res.data.find((r: any) => r.invoiceId === inv.id);
        if (row?.waiterWhatsAppLink) {
          setKitchenReadyAlert((cur) => (cur?.invoiceId === inv.id
            ? { ...cur, waiterWhatsAppLink: row.waiterWhatsAppLink }
            : cur));
        }
      }).catch(() => {});
    } else if (!inv?.tableReadyNotifiedAt || inv?.tableReadyServedAt) {
      setKitchenReadyAlert(null);
    }
  }

  async function loadSession(preferredInvoiceId?: string) {
    if (!tableSessionId) return;
    try {
      if (activeWaiter) {
        try {
          await assignTableWaiter(tableSessionId, activeWaiter);
        } catch {
          // la sesión puede seguir con otro mesero hasta confirmar PIN
        }
      }

      const listRes = await api.get(`/v1/pos/table-sessions/${tableSessionId}/invoices`);
      const list = listRes.data as any[];
      setOpenInvoices(list);

      if (list.length === 0) {
        const created = await api.get(`/v1/pos/invoices/by-table-session/${tableSessionId}`);
        setOpenInvoices([created.data]);
        setActiveInvoiceId(created.data.id);
        setInvoice(created.data);
        syncKitchenReadyAlert(created.data);
        return;
      }

      const nextId = preferredInvoiceId && list.some((i) => i.id === preferredInvoiceId)
        ? preferredInvoiceId
        : list[0].id;
      setActiveInvoiceId(nextId);

      const res = await api.get(`/v1/pos/invoices/by-table-session/${tableSessionId}`, {
        params: { invoiceId: nextId },
      });
      setInvoice(res.data);
      syncKitchenReadyAlert(res.data);
    } catch (err: any) {
      if (err.response?.status === 400) {
        localStorage.removeItem("tableSessionId");
        setInvoice(null);
        onPaid?.();
      }
    }
  }

  async function loadOrCreate() {
    await loadSession(activeInvoiceId || undefined);
  }

  useEffect(() => { loadSession(); }, [tableSessionId, activeWaiter?.id, activeWaiter?.kind]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableReadyDetail>).detail;
      if (!detail) return;
      const matchesSession = detail.tableSessionId === tableSessionId;
      const matchesInvoice = detail.invoiceId && openInvoices.some((i) => i.id === detail.invoiceId);
      if (matchesSession || matchesInvoice) {
        setKitchenReadyAlert(detail);
        if (detail.invoiceId && !detail.waiterWhatsAppLink) {
          api.get("/v1/pos/table-ready-queue").then((res) => {
            const row = res.data.find((r: any) => r.invoiceId === detail.invoiceId);
            if (row?.waiterWhatsAppLink) {
              setKitchenReadyAlert((cur) => (cur?.invoiceId === detail.invoiceId
                ? { ...cur, waiterWhatsAppLink: row.waiterWhatsAppLink }
                : cur));
            }
          }).catch(() => {});
        }
      }
    };
    window.addEventListener(TABLE_READY_EVENT, handler);
    return () => window.removeEventListener(TABLE_READY_EVENT, handler);
  }, [tableSessionId, openInvoices]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableServedDetail>).detail;
      if (!detail) return;
      const matchesSession = detail.tableSessionId === tableSessionId;
      const matchesInvoice = detail.invoiceId && (detail.invoiceId === invoice?.id || openInvoices.some((i) => i.id === detail.invoiceId));
      if (matchesSession || matchesInvoice) {
        setKitchenReadyAlert(null);
        void loadOrCreate();
      }
    };
    window.addEventListener(TABLE_SERVED_EVENT, handler);
    return () => window.removeEventListener(TABLE_SERVED_EVENT, handler);
  }, [tableSessionId, openInvoices, invoice?.id]);

  async function selectInvoice(invoiceId: string) {
    setActiveInvoiceId(invoiceId);
    const res = await api.get(`/v1/pos/invoices/by-table-session/${tableSessionId}`, {
      params: { invoiceId },
    });
    setInvoice(res.data);
    syncKitchenReadyAlert(res.data);
  }

  const tableLabel = useMemo(() => {
    const ts = invoice?.tableSession;
    if (!ts?.table) return null;
    return `${ts.table.area?.name ?? ""} · Mesa ${ts.table.name}`.trim();
  }, [invoice]);

  const currentWaiterId = invoice?.tableSession?.waiterId ?? invoice?.waiterId;
  const currentWaiterName = activeWaiter?.name
    ?? waiters.find((w) => w.id === currentWaiterId)?.name
    ?? "Mesero";

  useEffect(() => {
    api.get("/v1/restaurant/daily-menu").then((r) => setDailyMenu(r.data)).catch(() => {});
  }, [branchId]);

  const dailyProductIds = useMemo(() => new Set(dailyMenu.items.map((i) => i.productId)), [dailyMenu]);
  const dailyProducts = useMemo(
    () => products.filter((p) => dailyProductIds.has(p.id)),
    [products, dailyProductIds],
  );

  const filtered = useMemo(() => {
    let list = products;
    if (selectedCat) list = list.filter((p) => p.categoryId === selectedCat);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, selectedCat, search]);

  const isPaid = invoice?.status === "paid";

  async function addProduct(product: Product) {
    if (!invoice || invoice.status === "paid") return;
    const variant = product.variants[0];
    if (!variant) return;
    const notes = window.prompt(`Notas para ${product.name} (opcional):`, "") ?? "";
    try {
      await api.post(`/v1/pos/invoices/${invoice.id}/add-line`, {
        variantId: variant.id,
        name: product.name,
        course: product.course,
        qty: "1",
        unitPrice: String(variant.price),
        lineNotes: notes.trim() || undefined,
      });
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo agregar el producto");
    }
  }

  const handleBarcode = useCallback(async (code: string) => {
    if (!invoice || invoice.status === "paid") return;
    try {
      const res = await api.get(`/v1/catalog/barcode/${encodeURIComponent(code)}`);
      const variant = res.data;
      const product = variant.product as Product;
      await addProduct({ ...product, variants: [variant] });
      setScanFlash(`${product.name} ✓`);
      setTimeout(() => setScanFlash(null), 1500);
    } catch {
      setScanFlash(`No encontrado: ${code}`);
      setTimeout(() => setScanFlash(null), 2000);
    }
  }, [invoice]);

  useBarcodeScanner(handleBarcode, !!invoice && !isPaid);

  async function sendToKitchen() {
    if (!invoice) return;
    try {
      await api.post(`/v1/pos/invoices/${invoice.id}/send-to-kitchen`);
      await printKitchenTicket(invoice.id);
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo enviar a cocina");
    }
  }

  async function reprintKitchen() {
    if (!invoice || invoice.status !== "sent_to_kitchen") return;
    setReprintingKitchen(true);
    try {
      await printKitchenTicket(invoice.id);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo reimprimir la comanda");
    } finally {
      setReprintingKitchen(false);
    }
  }

  async function markTableServed() {
    if (!invoice?.id) return;
    setMarkingServed(true);
    try {
      await api.post(`/v1/pos/invoices/${invoice.id}/mark-table-served`);
      setKitchenReadyAlert(null);
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo marcar como servida");
    } finally {
      setMarkingServed(false);
    }
  }

  async function voidInvoice() {
    if (!invoice || isPaid) return;
    const label = tableLabel ?? "esta comanda";
    const wasInKitchen = invoice.status === "sent_to_kitchen";
    const msg = wasInKitchen
      ? `Anular ${label}? Se cancelará en cocina y desaparecerá de las cuentas abiertas.`
      : `Anular ${label}? Desaparecerá de las cuentas abiertas de la mesa.`;
    if (!window.confirm(msg)) return;

    setVoiding(true);
    try {
      const res = await api.post(`/v1/pos/invoices/${invoice.id}/void`, {
        reason: "Anulado desde comanda de mesa",
      });
      if (res.data.wasInKitchen) {
        await printKitchenVoidTicket(invoice.id);
      }
      dispatchTableUpdated({
        tableId: invoice.tableSession?.table?.id ?? invoice.tableId,
        tableSessionId: tableSessionId,
        status: res.data.remainingTableInvoices === 0 ? "closed" : "updated",
      });
      await loadSession();
    } catch (err: any) {
      alert(formatApiError(err, "No se pudo anular la comanda"));
    } finally {
      setVoiding(false);
    }
  }

  async function transferWaiter() {
    if (!tableSessionId || !newWaiterId) return;
    try {
      await api.post(`/v1/restaurant/table-sessions/${tableSessionId}/transfer-waiter`, {
        newWaiterId,
      });
      setShowTransfer(false);
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo transferir la mesa");
    }
  }

  async function removeLine(lineId: string) {
    if (!invoice) return;
    try {
      await api.post(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/remove`);
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo quitar el ítem");
    }
  }

  async function changeLineQty(lineId: string, currentQty: string | number, delta: number) {
    if (!invoice || invoice.status === "sent_to_kitchen") return;
    const nextQty = Number(currentQty) + delta;
    if (nextQty <= 0) {
      await removeLine(lineId);
      return;
    }

    setUpdatingQtyId(lineId);
    try {
      await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/qty`, {
        qty: String(nextQty),
      });
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo actualizar la cantidad");
    } finally {
      setUpdatingQtyId(null);
    }
  }

  async function editLineNote(lineId: string, currentNote?: string | null) {
    if (!invoice || invoice.status === "sent_to_kitchen") return;
    const nextNote = window.prompt("Nota para cocina / preparación", currentNote ?? "");
    if (nextNote === null) return;

    setUpdatingNoteId(lineId);
    try {
      await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/note`, {
        lineNotes: nextNote,
      });
      await loadOrCreate();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo guardar la nota");
    } finally {
      setUpdatingNoteId(null);
    }
  }

  async function splitBill() {
    if (!invoice || splitLineIds.length === 0) return;
    try {
      const res = await api.post(`/v1/pos/invoices/${invoice.id}/split`, { lineIds: splitLineIds });
      setShowSplit(false);
      setSplitLineIds([]);
      await loadSession(res.data.split.id);
      alert("Cuenta dividida — ahora puedes cobrar cada subcuenta por separado");
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo dividir la cuenta");
    }
  }

  async function handlePay(data: { payments: any[]; tipAmount: string }) {
    if (!invoice) return;
    const paidId = invoice.id;
    const res = await api.post(`/v1/pos/invoices/${paidId}/pay`, data);
    setShowPay(false);
    await printInvoiceReceipt(paidId);
    alert(`✅ Cobrado\nComprobante: ${res.data.fiscalDocument?.fullNumber ?? "interno (piloto)"}`);

    try {
      const remaining = await api.get(`/v1/pos/table-sessions/${tableSessionId}/invoices`);
      if (remaining.data.length === 0) {
        localStorage.removeItem("tableSessionId");
        onPaid?.();
      } else {
        await loadSession(remaining.data[0].id);
      }
    } catch {
      onPaid?.();
    }
  }

  if (!tableSessionId) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--t-muted)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
        <p>Selecciona una mesa en la pestaña <strong>Mesas</strong> para abrir la comanda.</p>
      </div>
    );
  }

  const total = Number(invoice?.total ?? 0);
  const inKitchen = invoice?.status === "sent_to_kitchen";

  return (
    <div>
      {showPay && !isPaid && (
        <PaymentModal total={total} onConfirm={handlePay} onClose={() => setShowPay(false)} />
      )}

      {showSplit && !isPaid && invoice?.lines?.length > 1 && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 360, maxHeight: "80vh", overflow: "auto" }}>
            <h3 style={{ margin: "0 0 8px" }}>Dividir cuenta</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)" }}>
              Selecciona los ítems que van a una subcuenta separada.
            </p>
            {invoice.lines.map((l: any) => (
              <label key={l.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={splitLineIds.includes(l.id)}
                  onChange={(e) => {
                    setSplitLineIds((prev) =>
                      e.target.checked ? [...prev, l.id] : prev.filter((id) => id !== l.id),
                    );
                  }}
                />
                <span>{l.nameSnapshot} ×{l.qty} — {formatCOP(Number(l.lineTotal))}</span>
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => { setShowSplit(false); setSplitLineIds([]); }} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={splitBill} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}>Dividir</button>
            </div>
          </div>
        </div>
      )}

      {showTransfer && !isPaid && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 320 }}>
            <h3 style={{ margin: "0 0 8px" }}>Transferir mesero</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)" }}>
              Mesa pasa de <strong>{currentWaiterName}</strong> a otro mesero del turno.
            </p>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              Nuevo mesero
              <select
                value={newWaiterId}
                onChange={(e) => setNewWaiterId(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
              >
                {waiters.filter((w) => w.id !== currentWaiterId).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowTransfer(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={transferWaiter} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}>Transferir</button>
            </div>
          </div>
        </div>
      )}

      {kitchenReadyAlert && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--t-success-soft)",
          border: "2px solid var(--t-success-border)",
          color: "var(--t-success-fg)",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span>
            🟢 Cocina lista — {kitchenReadyAlert.tableLabel ?? tableLabel ?? "Mesa"}
            {kitchenReadyAlert.itemsSummary ? ` · ${kitchenReadyAlert.itemsSummary}` : ""}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {kitchenReadyAlert.waiterWhatsAppLink && (
              <a
                href={kitchenReadyAlert.waiterWhatsAppLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#128C7E",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                WhatsApp mesero
              </a>
            )}
            <button
              onClick={markTableServed}
              disabled={markingServed}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                background: "var(--t-green-fg)",
                color: "var(--t-primary-fg)",
                cursor: markingServed ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                opacity: markingServed ? 0.7 : 1,
              }}
            >
              {markingServed ? "Marcando…" : "Marcar servida"}
            </button>
            <button
              onClick={() => setKitchenReadyAlert(null)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--t-success-fg)" }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Comanda</h2>
          {tableLabel && <div style={{ fontSize: 14, color: "var(--t-muted)" }}>{tableLabel}</div>}
          <div style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 4 }}>
            Mesero: <strong>{currentWaiterName}</strong>
            {!isPaid && waiters.length > 1 && (
              <button
                onClick={() => {
                  const next = waiters.find((w) => w.id !== currentWaiterId);
                  setNewWaiterId(next?.id ?? "");
                  setShowTransfer(true);
                }}
                style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 12 }}
              >
                Transferir
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 4 }}>Escanea barcode o busca producto</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {scanFlash && (
            <span style={{
              padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: scanFlash.includes("✓") ? "#dcfce7" : "#fef2f2",
              color: scanFlash.includes("✓") ? "var(--t-success-fg)" : "var(--t-danger-fg)",
            }}>
              {scanFlash}
            </span>
          )}
          <span style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600,
          background: isPaid ? "#dcfce7" : invoice?.status === "sent_to_kitchen" ? "#fef3c7" : "#e0e7ff",
          color: isPaid ? "var(--t-success-fg)" : "var(--t-fg)",
        }}>
          {isPaid ? "Pagada" : inKitchen ? "En cocina" : "Borrador"}
        </span>
        </div>
      </div>

      <input
        placeholder="Buscar o escanear código..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && search.length >= 3) {
            await handleBarcode(search);
            setSearch("");
          }
        }}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", marginBottom: 12, minHeight: 44, boxSizing: "border-box" }}
      />

      <div className="yall-pos-layout">
        <div>
          {dailyMenu.items.length > 0 && !isPaid && (
            <div style={{
              background: "var(--t-warn-soft)", border: "1px solid var(--t-warn-border)", borderRadius: 12,
              padding: 12, marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⭐ Menú del día</div>
              {dailyMenu.note && <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>{dailyMenu.note}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {dailyProducts.map((p) => {
                  const daily = dailyMenu.items.find((i) => i.productId === p.id);
                  const v = p.variants[0];
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      style={{
                        padding: "8px 12px", borderRadius: 10, border: "1px solid #f59e0b",
                        background: "var(--t-warn-soft)", cursor: "pointer", fontSize: 13,
                      }}
                    >
                      {p.name} · {formatCOP(daily?.price ?? Number(v?.price))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="yall-chip-row">
            <CatBtn active={!selectedCat} onClick={() => setSelectedCat("")} color="#2563eb">Todos</CatBtn>
            {categories.map((c) => (
              <CatBtn key={c.id} active={selectedCat === c.id} onClick={() => setSelectedCat(c.id)} color={c.color ?? "#64748b"}>
                {c.name}
              </CatBtn>
            ))}
          </div>

          <div className="yall-pos-products">
            {filtered.map((p) => {
              const v = p.variants[0];
              const isDaily = dailyProductIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  disabled={isPaid}
                  className="yall-product-btn"
                  style={{
                    background: p.category?.color ? productCardBg(p.category.color) : "var(--t-card)",
                    color: "var(--t-fg)",
                    cursor: isPaid ? "not-allowed" : "pointer",
                    opacity: isPaid ? 0.5 : 1,
                    boxShadow: isDaily ? "inset 0 0 0 2px var(--t-warn-border)" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {isDaily && "⭐ "}{p.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 4 }}>{formatCOP(Number(v?.price))}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="yall-pos-ticket">
        <div className="yall-pos-ticket-inner">
          {openInvoices.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {openInvoices.map((inv, idx) => (
                <button
                  key={inv.id}
                  onClick={() => selectInvoice(inv.id)}
                  style={{
                    padding: "4px 10px", borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer", fontSize: 12,
                    background: inv.id === activeInvoiceId ? "var(--t-primary)" : "var(--t-card)",
                    color: inv.id === activeInvoiceId ? "var(--t-primary-fg)" : "var(--t-muted)",
                  }}
                >
                  Cuenta {idx + 1} · {formatCOP(Number(inv.total))}
                </button>
              ))}
            </div>
          )}
          <h4 style={{ margin: "0 0 12px" }}>Pedido{openInvoices.length > 1 ? ` (${openInvoices.findIndex((i) => i.id === activeInvoiceId) + 1}/${openInvoices.length})` : ""}</h4>
          {invoice?.lines?.map((l: any) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 14, marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{l.nameSnapshot}</span>
                  {!isPaid && !inKitchen && (
                    <>
                      <button
                        onClick={() => changeLineQty(l.id, l.qty, -1)}
                        disabled={updatingQtyId === l.id}
                        style={qtyBtnStyle(updatingQtyId === l.id)}
                      >
                        −
                      </button>
                      <strong>×{l.qty}</strong>
                      <button
                        onClick={() => changeLineQty(l.id, l.qty, 1)}
                        disabled={updatingQtyId === l.id}
                        style={qtyBtnStyle(updatingQtyId === l.id)}
                      >
                        +
                      </button>
                    </>
                  )}
                  {(isPaid || inKitchen) && <span>×{l.qty}</span>}
                  {!isPaid && (
                    <button
                      onClick={() => editLineNote(l.id, l.lineNotes)}
                      disabled={inKitchen || updatingNoteId === l.id}
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 6,
                        border: "1px solid var(--t-border-strong)",
                        background: l.lineNotes ? "var(--t-accent-soft)" : "var(--t-card)",
                        color: "var(--t-fg)",
                        cursor: inKitchen ? "not-allowed" : "pointer",
                        opacity: inKitchen ? 0.6 : 1,
                      }}
                    >
                      {l.lineNotes ? "Nota ✓" : "Nota"}
                    </button>
                  )}
                </div>
                {l.lineNotes && <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 2 }}>{l.lineNotes}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span>{formatCOP(Number(l.lineTotal))}</span>
                {!isPaid && !inKitchen && (
                  <button
                    onClick={() => removeLine(l.id)}
                    title="Quitar"
                    style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 16 }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          {!invoice?.lines?.length && <p style={{ color: "var(--t-muted)", fontSize: 13 }}>Sin productos</p>}
          <hr style={{ border: "none", borderTop: "1px solid var(--t-border)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}>
            <span>Total</span>
            <span>{formatCOP(total)}</span>
          </div>

          {!isPaid && (
            <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
              {invoice?.lines?.length > 1 && openInvoices.length === 1 && (
                <button
                  onClick={() => setShowSplit(true)}
                  style={btnSecondary}
                >
                  Dividir cuenta
                </button>
              )}
              <button
                onClick={sendToKitchen}
                disabled={!invoice?.lines?.length}
                style={btnSecondary}
              >
                {inKitchen ? "Reenviar comanda cocina" : "Enviar a cocina"}
              </button>
              {inKitchen && (
                <>
                  <button
                    onClick={reprintKitchen}
                    disabled={reprintingKitchen}
                    style={{
                      ...btnSecondary,
                      opacity: reprintingKitchen ? 0.7 : 1,
                    }}
                  >
                    {reprintingKitchen ? "Imprimiendo…" : "Reimprimir comanda"}
                  </button>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--t-muted)", textAlign: "center" }}>
                    Nuevos ítems van automático al KDS
                  </p>
                </>
              )}
              <button
                onClick={() => setShowPay(true)}
                disabled={!invoice?.lines?.length}
                style={btnPrimary}
              >
                Cobrar
              </button>
              {canVoid && (
                <button
                  onClick={voidInvoice}
                  disabled={voiding}
                  style={{
                    ...btnSecondary,
                    borderColor: "#fecaca",
                    color: "#b91c1c",
                    opacity: voiding ? 0.7 : 1,
                  }}
                >
                  {voiding ? "Anulando…" : "Anular comanda"}
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function CatBtn({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13,
        background: active ? color : "var(--t-chip-bg)", color: active ? "#fff" : "var(--t-chip-fg)",
      }}
    >
      {children}
    </button>
  );
}

const btnPrimary: React.CSSProperties = { padding: 14, borderRadius: 10, border: "none", background: "var(--t-green-fg)", color: "var(--t-primary-fg)", fontWeight: 700, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: 12, borderRadius: 10, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer" };

function qtyBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 999,
    border: "1px solid var(--t-border-strong)",
    background: "var(--t-card)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 700,
  };
}
