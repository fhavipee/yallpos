import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
import { printInvoiceReceipt, printKitchenVoidTicket } from "../lib/print";
import { useBarcodeScanner } from "../lib/barcode";
import PaymentModal from "../components/PaymentModal";
import { ui, useTheme } from "../lib/theme";

type Product = {
  id: string;
  name: string;
  categoryId?: string;
  variants: { id: string; name: string; price: string; sellByWeight: boolean; unit: string; barcode?: string }[];
  category?: { id: string; name: string; color?: string };
};

type Category = { id: string; name: string; color?: string };

type PickupOrder = {
  ticketId: string;
  invoiceId: string;
  pickupCode?: string;
  pickupName?: string;
  pickupPhone?: string;
  kitchenStatus: "new" | "preparing" | "ready";
  itemsSummary: string;
  whatsappLink?: string | null;
  smsLink?: string | null;
  pickupNotifiedAt?: string | null;
};

type DeliveryOrder = {
  ticketId: string;
  invoiceId: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  deliveryFee?: string | number;
  total?: string | number;
  invoiceStatus: string;
  kitchenStatus: "new" | "preparing" | "ready";
  deliveryStatus: "new" | "in_kitchen" | "pending" | "on_route" | "delivered";
  itemsSummary: string;
};

type OpenOrder = {
  id: string;
  serviceType: SaleMode;
  status: string;
  total: string | number;
  createdAt: string;
  pickupCode?: string | null;
  pickupName?: string | null;
  pickupPhone?: string | null;
  deliveryName?: string | null;
  deliveryPhone?: string | null;
  lines?: { id: string; nameSnapshot: string }[];
};

type SaleMode = "counter" | "takeaway" | "delivery";
type OpenOrderTypeFilter = "all" | SaleMode;
type OpenOrderStatusFilter = "all" | "draft" | "sent_to_kitchen";

const OPEN_ORDER_STALE_HOURS = 4;

export default function CounterSale({ branchId, branchType }: { branchId: string; branchType: string }) {
  const { productCardBg } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [invoice, setInvoice] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [weight, setWeight] = useState("0.5");
  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [savingPickup, setSavingPickup] = useState(false);
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [deliveryStatusId, setDeliveryStatusId] = useState<string | null>(null);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [updatingQtyId, setUpdatingQtyId] = useState<string | null>(null);
  const [updatingNoteId, setUpdatingNoteId] = useState<string | null>(null);
  const [saleMode, setSaleMode] = useState<SaleMode>("counter");
  const [pickupQueue, setPickupQueue] = useState<PickupOrder[]>([]);
  const [deliveryQueue, setDeliveryQueue] = useState<DeliveryOrder[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [openOrdersSearch, setOpenOrdersSearch] = useState("");
  const [openOrdersTypeFilter, setOpenOrdersTypeFilter] = useState<OpenOrderTypeFilter>("all");
  const [openOrdersStatusFilter, setOpenOrdersStatusFilter] = useState<OpenOrderStatusFilter>("all");
  const [voidingOrderId, setVoidingOrderId] = useState<string | null>(null);
  const [voidingStale, setVoidingStale] = useState(false);
  const invoiceRef = useRef<any>(null);
  invoiceRef.current = invoice;

  useEffect(() => { setBranchId(branchId); }, [branchId]);

  useEffect(() => {
    (async () => {
      const [cats, prods] = await Promise.all([
        api.get("/v1/catalog/categories"),
        api.get("/v1/catalog/products"),
      ]);
      setCategories(cats.data);
      setProducts(prods.data);
    })();
  }, [branchId]);

  async function startSale(mode: SaleMode = saleMode) {
    const res = mode === "delivery"
      ? await api.post("/v1/pos/invoices", { serviceType: "delivery" })
      : await api.post(mode === "takeaway" ? "/v1/pos/invoices/takeaway" : "/v1/pos/invoices/counter");
    setInvoice(res.data);
    setPickupName("");
    setPickupPhone("");
    setDeliveryName("");
    setDeliveryPhone("");
    setDeliveryAddress("");
    setDeliveryReference("");
    setDeliveryFee("0");
  }

  async function refreshPickupQueue() {
    try {
      const res = await api.get("/v1/pos/pickup-queue");
      setPickupQueue(res.data);
    } catch {
      setPickupQueue([]);
    }
  }

  async function refreshDeliveryQueue() {
    try {
      const res = await api.get("/v1/pos/delivery-queue");
      setDeliveryQueue(res.data);
    } catch {
      setDeliveryQueue([]);
    }
  }

  async function refreshOpenOrders() {
    try {
      const res = await api.get("/v1/pos/invoices/open-counter");
      setOpenOrders(res.data);
    } catch {
      setOpenOrders([]);
    }
  }

  async function markDelivered(invoiceId: string) {
    setDeliveringId(invoiceId);
    try {
      await api.post(`/v1/pos/invoices/${invoiceId}/pickup-delivered`);
      await refreshPickupQueue();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo marcar como entregado");
    } finally {
      setDeliveringId(null);
    }
  }

  async function updateDeliveryStatus(invoiceId: string, status: DeliveryOrder["deliveryStatus"]) {
    setDeliveryStatusId(`${invoiceId}:${status}`);
    try {
      await api.post(`/v1/pos/invoices/${invoiceId}/delivery-status/${status}`);
      await refreshDeliveryQueue();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo actualizar el domicilio");
    } finally {
      setDeliveryStatusId(null);
    }
  }

  useEffect(() => { startSale(saleMode); }, [branchId, saleMode]);

  useEffect(() => {
    refreshPickupQueue();
    refreshDeliveryQueue();
    refreshOpenOrders();
    const id = window.setInterval(() => {
      refreshPickupQueue();
      refreshDeliveryQueue();
      refreshOpenOrders();
    }, 10000);
    return () => window.clearInterval(id);
  }, [branchId]);

  useEffect(() => {
    if (!invoice) return;
    setPickupName(invoice.pickupName ?? "");
    setPickupPhone(invoice.pickupPhone ?? "");
    setDeliveryName(invoice.deliveryName ?? "");
    setDeliveryPhone(invoice.deliveryPhone ?? "");
    setDeliveryAddress(invoice.deliveryAddress ?? "");
    setDeliveryReference(invoice.deliveryReference ?? "");
    setDeliveryFee(String(invoice.deliveryFee ?? "0"));
  }, [invoice?.id]);

  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategory) list = list.filter((p) => p.categoryId === selectedCategory);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, selectedCategory, search]);

  const filteredOpenOrders = useMemo(() => {
    let list = openOrders;
    if (openOrdersTypeFilter !== "all") {
      list = list.filter((order) => order.serviceType === openOrdersTypeFilter);
    }
    if (openOrdersStatusFilter !== "all") {
      list = list.filter((order) => order.status === openOrdersStatusFilter);
    }
    const q = openOrdersSearch.trim().toLowerCase();
    if (!q) return list;

    const qDigits = q.replace(/\D/g, "");
    return list.filter((order) => {
      const haystack = [
        order.pickupName,
        order.deliveryName,
        order.pickupCode,
        order.pickupPhone,
        order.deliveryPhone,
        ...(order.lines?.map((line) => line.nameSnapshot) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (haystack.includes(q)) return true;
      if (qDigits.length >= 3) {
        const phones = [order.pickupPhone, order.deliveryPhone]
          .filter(Boolean)
          .map((phone) => String(phone).replace(/\D/g, ""));
        return phones.some((phone) => phone.includes(qDigits));
      }
      return false;
    });
  }, [openOrders, openOrdersSearch, openOrdersTypeFilter, openOrdersStatusFilter]);

  const visibleOpenOrders = useMemo(
    () => filteredOpenOrders.filter((order) => order.id !== invoice?.id && isMeaningfulOpenOrder(order)),
    [filteredOpenOrders, invoice?.id],
  );

  const staleOpenOrders = useMemo(
    () => visibleOpenOrders.filter((order) => isStaleOpenOrder(order, OPEN_ORDER_STALE_HOURS)),
    [visibleOpenOrders],
  );

  async function addVariant(variant: Product["variants"][0], productName: string, sellByWeight?: boolean) {
    const inv = invoiceRef.current;
    if (!inv) return;
    const qty = sellByWeight ? weight : "1";
    await api.post(`/v1/pos/invoices/${inv.id}/add-line`, {
      variantId: variant.id,
      name: productName,
      qty,
      unitPrice: String(variant.price),
      weight: sellByWeight ? weight : undefined,
    });
    const updated = await api.get(`/v1/pos/invoices/${inv.id}`);
    setInvoice(updated.data);
  }

  const handleBarcode = useCallback(async (code: string) => {
    try {
      const res = await api.get(`/v1/catalog/barcode/${encodeURIComponent(code)}`);
      const variant = res.data;
      const product = variant.product;
      await addVariant(variant, product.name, variant.sellByWeight);
      setScanFlash(`${product.name} ✓`);
      setTimeout(() => setScanFlash(null), 1500);
    } catch {
      setScanFlash(`No encontrado: ${code}`);
      setTimeout(() => setScanFlash(null), 2000);
    }
  }, [weight]);

  useBarcodeScanner(handleBarcode, !!invoice);

  async function addProduct(product: Product) {
    const variant = product.variants[0];
    if (!variant) return;
    await addVariant(variant, product.name, variant.sellByWeight);
  }

  async function resumeOrder(order: OpenOrder) {
    const res = await api.get(`/v1/pos/invoices/${order.id}`);
    setSaleMode(order.serviceType);
    setInvoice(res.data);
  }

  async function voidOpenOrder(order: OpenOrder) {
    const isEmptyDraft =
      order.status === "draft"
      && Number(order.total ?? 0) === 0
      && (order.lines?.length ?? 0) === 0;
    if (!isEmptyDraft) {
      const label = order.deliveryName || order.pickupName || order.pickupCode || "este pedido";
      const msg = order.status === "sent_to_kitchen"
        ? `Anular "${label}"? Se cancelará en cocina y ya no aparecerá en pedidos abiertos.`
        : `Anular "${label}"? Ya no aparecerá en pedidos abiertos.`;
      if (!window.confirm(msg)) return;
    }

    setVoidingOrderId(order.id);
    try {
      const res = await api.post(`/v1/pos/invoices/${order.id}/void`, {
        reason: isEmptyDraft ? "Borrador vacío descartado" : "Anulado desde mostrador",
      });
      if (res.data.wasInKitchen) {
        await printKitchenVoidTicket(order.id);
      }
      if (invoice?.id === order.id) {
        await startSale(order.serviceType);
      }
      await Promise.all([refreshOpenOrders(), refreshPickupQueue(), refreshDeliveryQueue()]);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo anular el pedido");
    } finally {
      setVoidingOrderId(null);
    }
  }

  async function voidStaleOpenOrders() {
    if (staleOpenOrders.length === 0) return;
    const msg = `Anular ${staleOpenOrders.length} pedido(s) abiertos con más de ${OPEN_ORDER_STALE_HOURS} horas?`;
    if (!window.confirm(msg)) return;

    setVoidingStale(true);
    try {
      const res = await api.post(`/v1/pos/invoices/open-counter/void-stale?hours=${OPEN_ORDER_STALE_HOURS}`);
      if (invoice && res.data.invoiceIds?.includes(invoice.id)) {
        await startSale(saleMode);
      }
      await Promise.all([refreshOpenOrders(), refreshPickupQueue(), refreshDeliveryQueue()]);
      if (res.data.voidedCount > 0) {
        alert(`${res.data.voidedCount} pedido(s) anulado(s).`);
      }
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudieron anular los pedidos viejos");
    } finally {
      setVoidingStale(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!invoice) return;
    setRemovingLineId(lineId);
    try {
      const updated = await api.post(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/remove`);
      setInvoice(updated.data);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo quitar el producto");
    } finally {
      setRemovingLineId(null);
    }
  }

  async function changeLineQty(lineId: string, currentQty: string | number, delta: number) {
    if (!invoice) return;
    const nextQty = Number(currentQty) + delta;
    if (nextQty <= 0) {
      await removeLine(lineId);
      return;
    }

    setUpdatingQtyId(lineId);
    try {
      const updated = await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/qty`, {
        qty: String(nextQty),
      });
      setInvoice(updated.data);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo actualizar la cantidad");
    } finally {
      setUpdatingQtyId(null);
    }
  }

  async function editLineNote(lineId: string, currentNote?: string | null) {
    if (!invoice || inKitchen) return;
    const nextNote = window.prompt("Nota para cocina / preparación", currentNote ?? "");
    if (nextNote === null) return;

    setUpdatingNoteId(lineId);
    try {
      const updated = await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/note`, {
        lineNotes: nextNote,
      });
      setInvoice(updated.data);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo guardar la nota");
    } finally {
      setUpdatingNoteId(null);
    }
  }

  async function savePickup() {
    if (!invoice) return;
    setSavingPickup(true);
    try {
      const res = await api.patch(`/v1/pos/invoices/${invoice.id}/pickup`, {
        pickupName: pickupName || undefined,
        pickupPhone: pickupPhone || undefined,
      });
      setInvoice((prev: any) => ({ ...prev, ...res.data }));
    } finally {
      setSavingPickup(false);
    }
  }

  async function saveDelivery() {
    if (!invoice || saleMode !== "delivery") return;
    setSavingDelivery(true);
    try {
      const res = await api.patch(`/v1/pos/invoices/${invoice.id}/delivery`, {
        deliveryName: deliveryName || undefined,
        deliveryPhone: deliveryPhone || undefined,
        deliveryAddress: deliveryAddress || undefined,
        deliveryReference: deliveryReference || undefined,
        deliveryFee: deliveryFee || "0",
      });
      setInvoice((prev: any) => ({ ...prev, ...res.data }));
    } finally {
      setSavingDelivery(false);
    }
  }

  async function sendToKitchen() {
    if (!invoice?.lines?.length) return;
    setSendingKitchen(true);
    try {
      if (saleMode === "delivery") {
        await saveDelivery();
      } else if (pickupPhone || pickupName) {
        await savePickup();
      }
      const res = await api.post(`/v1/pos/invoices/${invoice.id}/send-to-kitchen`);
      setInvoice(res.data);
      refreshPickupQueue();
      const code = res.data.pickupCode ? ` Pedido #${res.data.pickupCode}.` : "";
      if (saleMode === "delivery") {
        alert("Domicilio enviado a cocina.");
      } else if (pickupPhone) {
        alert(`Pedido enviado a cocina.${code} Avisaremos al cliente cuando esté listo.`);
      } else {
        alert(`Pedido enviado a cocina.${code}`);
      }
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo enviar a cocina");
    } finally {
      setSendingKitchen(false);
    }
  }

  async function handlePay(data: { payments: any[]; tipAmount: string }) {
    if (!invoice) return;
    if (saleMode === "delivery") {
      await saveDelivery();
    } else if (pickupPhone || pickupName) {
      await savePickup();
    }
    const res = await api.post(`/v1/pos/invoices/${invoice.id}/pay`, data);
    const doc = res.data.fiscalDocument?.fullNumber ?? "simulado";
    setShowPay(false);
    const print = await printInvoiceReceipt(invoice.id);
    const notifyNote = pickupPhone && invoice.status === "sent_to_kitchen"
      ? "\n📱 Aviso al cliente cuando cocina marque listo."
      : "";
    alert(`✅ Venta pagada\nDE POS: ${doc}\nImpresión: ${print.methods.join(", ") || "HTML"}${notifyNote}`);
    await startSale(saleMode);
  }

  const isBakery = branchType === "bakery";
  const inKitchen = invoice?.status === "sent_to_kitchen";
  const readyOrders = pickupQueue.filter((o) => o.kitchenStatus === "ready");
  const pendingOrders = pickupQueue.filter((o) => o.kitchenStatus !== "ready");
  const activeDeliveries = deliveryQueue.filter((o) => o.deliveryStatus !== "delivered");
  const baseTotal = Number(invoice?.total ?? 0);
  const deliveryFeeNum = saleMode === "delivery" ? Number(deliveryFee || 0) : 0;
  const chargeTotal = baseTotal + deliveryFeeNum;

  return (
    <div>
      {visibleOpenOrders.length > 0 && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 12,
          background: "var(--t-card-alt)", border: "1px solid var(--t-border-strong)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0, fontSize: 14, color: "var(--t-fg)" }}>
              📂 Pedidos abiertos ({visibleOpenOrders.length})
            </h4>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {staleOpenOrders.length > 0 && (
                <button
                  onClick={voidStaleOpenOrders}
                  disabled={voidingStale}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--t-danger-border)",
                    background: "var(--t-danger-soft)",
                    color: "#f87171",
                    cursor: voidingStale ? "not-allowed" : "pointer",
                    opacity: voidingStale ? 0.7 : 1,
                  }}
                >
                  {voidingStale ? "Anulando…" : `Anular viejos (+${OPEN_ORDER_STALE_HOURS}h · ${staleOpenOrders.length})`}
                </button>
              )}
              <button onClick={refreshOpenOrders} style={{ ...ui.btnSecondary, fontSize: 12, padding: "4px 10px" }}>
                Actualizar
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <input
              value={openOrdersSearch}
              onChange={(e) => setOpenOrdersSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o producto…"
              style={{ ...ui.input, width: "100%", fontSize: 13 }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--t-muted)", marginRight: 2 }}>Tipo:</span>
              {([
                ["all", "Todos"],
                ["counter", "Mostrador"],
                ["takeaway", "Para llevar"],
                ["delivery", "Domicilio"],
              ] as const).map(([value, label]) => (
                <FilterChip
                  key={value}
                  active={openOrdersTypeFilter === value}
                  onClick={() => setOpenOrdersTypeFilter(value)}
                  label={label}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--t-muted)", marginRight: 2 }}>Estado:</span>
              {([
                ["all", "Todos"],
                ["draft", "Borrador"],
                ["sent_to_kitchen", "En cocina"],
              ] as const).map(([value, label]) => (
                <FilterChip
                  key={value}
                  active={openOrdersStatusFilter === value}
                  onClick={() => setOpenOrdersStatusFilter(value)}
                  label={label}
                />
              ))}
              {(openOrdersSearch || openOrdersTypeFilter !== "all" || openOrdersStatusFilter !== "all") && (
                <button
                  onClick={() => {
                    setOpenOrdersSearch("");
                    setOpenOrdersTypeFilter("all");
                    setOpenOrdersStatusFilter("all");
                  }}
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--t-border-strong)",
                    background: "var(--t-card)",
                    cursor: "pointer",
                    color: "var(--t-muted)",
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {visibleOpenOrders.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--t-muted)", padding: "8px 4px" }}>
                No hay pedidos que coincidan con los filtros.
              </div>
            ) : visibleOpenOrders.slice(0, 12).map((order) => {
              const stale = isStaleOpenOrder(order, OPEN_ORDER_STALE_HOURS);
              return (
              <div key={order.id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 10, alignItems: "center",
                background: invoice?.id === order.id ? "var(--t-accent-soft)" : stale ? "var(--t-orange-soft)" : "var(--t-card)",
                border: stale ? "1px solid var(--t-orange-border)" : "1px solid var(--t-border)",
                padding: "8px 10px", borderRadius: 8, fontSize: 13, color: "var(--t-fg)",
              }}>
                <strong style={{ textTransform: "capitalize" }}>{labelSaleMode(order.serviceType)}</strong>
                <div>
                  <div>
                    {order.deliveryName || order.pickupName || order.pickupCode || "Pedido sin nombre"} · {formatCOP(Number(order.total ?? 0))}
                    {stale && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#c2410c", fontWeight: 600 }}>
                        +{OPEN_ORDER_STALE_HOURS}h
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                    {new Date(order.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    {order.lines?.[0] ? ` · ${order.lines[0].nameSnapshot}${order.lines.length > 1 ? ` y ${order.lines.length - 1} más` : ""}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 999,
                  background: order.status === "sent_to_kitchen" ? "#fef3c7" : "#e0f2fe",
                  color: order.status === "sent_to_kitchen" ? "#92400e" : "#075985",
                }}>
                  {order.status === "sent_to_kitchen" ? "En cocina" : "Borrador"}
                </span>
                <button
                  onClick={() => resumeOrder(order)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--t-border-strong)",
                    background: "var(--t-card)",
                    color: "var(--t-fg)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Retomar
                </button>
                <button
                  onClick={() => voidOpenOrder(order)}
                  disabled={voidingOrderId === order.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--t-danger-border)",
                    background: "var(--t-card)",
                    color: "#f87171",
                    cursor: voidingOrderId === order.id ? "not-allowed" : "pointer",
                    fontSize: 12,
                    opacity: voidingOrderId === order.id ? 0.7 : 1,
                  }}
                >
                  {voidingOrderId === order.id ? "…" : "Anular"}
                </button>
              </div>
            );})}
          </div>
        </div>
      )}

      {activeDeliveries.length > 0 && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 12,
          background: "var(--t-orange-soft)", border: "1px solid var(--t-orange-border)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, color: "var(--t-fg)" }}>🛵 Domicilios activos ({activeDeliveries.length})</h4>
            <button onClick={refreshDeliveryQueue} style={{ ...ui.btnSecondary, fontSize: 12, padding: "4px 10px" }}>
              Actualizar
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {activeDeliveries.slice(0, 6).map((o) => (
              <div key={o.invoiceId} style={{
                display: "grid", gridTemplateColumns: "1.2fr 1fr auto auto auto", gap: 10, alignItems: "center",
                background: "var(--t-card)", padding: "10px 12px", borderRadius: 8, fontSize: 13, color: "var(--t-fg)",
              }}>
                <div>
                  <strong>{o.customerName || "Cliente domicilio"}</strong>
                  <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 3 }}>
                    {o.deliveryAddress || "Sin direccion"}{o.deliveryReference ? ` · ${o.deliveryReference}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 3 }}>
                    {o.itemsSummary} · {formatCOP(Number(o.total ?? 0) + Number(o.deliveryFee ?? 0))}
                  </div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div><strong>Cocina:</strong> {o.kitchenStatus === "ready" ? "Listo" : o.kitchenStatus === "preparing" ? "Preparando" : "Nuevo"}</div>
                  <div><strong>Ruta:</strong> {labelDeliveryStatus(o.deliveryStatus)}</div>
                </div>
                <StatusBtn
                  active={o.deliveryStatus === "pending"}
                  busy={deliveryStatusId === `${o.invoiceId}:pending`}
                  onClick={() => updateDeliveryStatus(o.invoiceId, "pending")}
                >
                  Pendiente
                </StatusBtn>
                <StatusBtn
                  active={o.deliveryStatus === "on_route"}
                  busy={deliveryStatusId === `${o.invoiceId}:on_route`}
                  onClick={() => updateDeliveryStatus(o.invoiceId, "on_route")}
                >
                  En ruta
                </StatusBtn>
                <StatusBtn
                  active={o.deliveryStatus === "delivered"}
                  busy={deliveryStatusId === `${o.invoiceId}:delivered`}
                  onClick={() => updateDeliveryStatus(o.invoiceId, "delivered")}
                >
                  Entregado
                </StatusBtn>
              </div>
            ))}
          </div>
        </div>
      )}

      {(readyOrders.length > 0 || pendingOrders.length > 0) && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 12,
          background: readyOrders.length ? "var(--t-success-soft)" : "var(--t-accent-soft)",
          border: `1px solid ${readyOrders.length ? "var(--t-success-border)" : "var(--t-accent-border)"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, color: "var(--t-fg)" }}>
              {readyOrders.length > 0 ? `🟢 ${readyOrders.length} listo(s) para retirar` : `🍳 ${pendingOrders.length} en cocina`}
            </h4>
            <button onClick={refreshPickupQueue} style={{ ...ui.btnSecondary, fontSize: 12, padding: "4px 10px" }}>
              Actualizar
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[...readyOrders, ...pendingOrders].slice(0, 6).map((o) => (
              <div key={o.ticketId} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 10, alignItems: "center",
                background: "var(--t-card)", padding: "8px 10px", borderRadius: 8, fontSize: 13, color: "var(--t-fg)",
              }}>
                <strong style={{ fontSize: 18, color: o.kitchenStatus === "ready" ? "#16a34a" : "#2563eb" }}>
                  #{o.pickupCode ?? "—"}
                </strong>
                <div>
                  <div>{o.pickupName || "Cliente"} · {o.itemsSummary}</div>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                    {o.kitchenStatus === "ready" ? "Listo" : o.kitchenStatus === "preparing" ? "Preparando" : "Nuevo"}
                  </div>
                </div>
                {o.whatsappLink && o.kitchenStatus === "ready" && (
                  <a href={o.whatsappLink} target="_blank" rel="noreferrer" style={{
                    padding: "5px 10px", borderRadius: 6, background: "#25D366", color: "#fff",
                    textDecoration: "none", fontSize: 12,
                  }}>WhatsApp</a>
                )}
                {o.smsLink && o.kitchenStatus === "ready" && !o.whatsappLink && (
                  <a href={o.smsLink} style={{ fontSize: 12, color: "#2563eb" }}>SMS</a>
                )}
                {o.kitchenStatus === "ready" && (
                  <button
                    onClick={() => markDelivered(o.invoiceId)}
                    disabled={deliveringId === o.invoiceId}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--t-border-strong)",
                      background: "var(--t-card)",
                      cursor: "pointer",
                      fontSize: 12,
                      opacity: deliveringId === o.invoiceId ? 0.6 : 1,
                    }}
                  >
                    {deliveringId === o.invoiceId ? "..." : "Entregado"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showPay && invoice?.lines?.length > 0 && (
        <PaymentModal
          total={chargeTotal}
          onConfirm={handlePay}
          onClose={() => setShowPay(false)}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{isBakery ? "🥐 Mostrador Panadería" : "🛒 Venta rápida"}</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ModeBtn active={saleMode === "counter"} onClick={() => setSaleMode("counter")}>Mostrador</ModeBtn>
          <ModeBtn active={saleMode === "takeaway"} onClick={() => setSaleMode("takeaway")}>Para llevar</ModeBtn>
          <ModeBtn active={saleMode === "delivery"} onClick={() => setSaleMode("delivery")}>Domicilio</ModeBtn>
          {scanFlash && (
            <span style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: scanFlash.includes("✓") ? "#dcfce7" : "#fef2f2",
              color: scanFlash.includes("✓") ? "#166534" : "#b91c1c",
            }}>
              {scanFlash}
            </span>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "4px 0 12px" }}>
        {saleMode === "delivery"
          ? "Escanea productos y registra datos del domicilio antes de enviar a cocina o cobrar"
          : "Escanea código de barras o toca un producto · Celular opcional para avisar cuando el pedido esté listo"}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Buscar o escanear..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && search.length >= 3) {
              try {
                await handleBarcode(search);
                setSearch("");
              } catch { /* ignore */ }
            }
          }}
          style={{ ...ui.input, flex: 1, minWidth: 200 }}
        />
        {isBakery && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label>Peso (kg):</label>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...ui.input, width: 60, padding: 6 }} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => setSelectedCategory("")}
          style={{ padding: "6px 12px", borderRadius: 20, border: "none", background: !selectedCategory ? "#2563eb" : "var(--t-chip-bg)", color: !selectedCategory ? "#fff" : "var(--t-chip-fg)", cursor: "pointer" }}
        >
          Todos
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            style={{
              padding: "6px 12px", borderRadius: 20, border: "none",
              background: selectedCategory === c.id ? (c.color ?? "#2563eb") : "var(--t-chip-bg)",
              color: selectedCategory === c.id ? "#fff" : "var(--t-chip-fg)",
              cursor: "pointer",
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {filtered.map((p) => {
            const v = p.variants[0];
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                style={{
                  padding: 16, borderRadius: 12, border: "1px solid var(--t-border)",
                  background: productCardBg(p.category?.color),
                  color: "var(--t-fg)",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 4 }}>
                  {formatCOP(Number(v?.price))}
                  {v?.sellByWeight ? ` / ${v.unit}` : ""}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ ...ui.card, padding: 16, position: "sticky", top: 80 }}>
          <h4 style={{ margin: "0 0 12px", color: "var(--t-fg)" }}>Ticket</h4>
          {inKitchen && (
            <div style={{
              fontSize: 12, padding: "8px 10px", borderRadius: 8, marginBottom: 10,
              background: "var(--t-accent-soft)", color: "#60a5fa", border: "1px solid var(--t-accent-border)",
            }}>
              🍳 En cocina
              {invoice.pickupCode ? ` · Pedido #${invoice.pickupCode}` : ""}
              {pickupPhone ? " — avisaremos al cliente" : ""}
            </div>
          )}
          {invoice?.lines?.map((l: any) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 6, color: "var(--t-fg)" }}>
              <div>
                <div>{l.nameSnapshot}</div>
                {l.lineNotes && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>📝 {l.lineNotes}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => changeLineQty(l.id, l.qty, -1)}
                  disabled={updatingQtyId === l.id || inKitchen}
                  style={qtyBtnStyle(updatingQtyId === l.id || inKitchen)}
                >
                  -
                </button>
                <strong style={{ minWidth: 26, textAlign: "center" }}>{Number(l.qty)}</strong>
                <button
                  onClick={() => changeLineQty(l.id, l.qty, 1)}
                  disabled={updatingQtyId === l.id || inKitchen}
                  style={qtyBtnStyle(updatingQtyId === l.id || inKitchen)}
                >
                  +
                </button>
              </div>
              <span>{formatCOP(Number(l.lineTotal))}</span>
              <button
                onClick={() => editLineNote(l.id, l.lineNotes)}
                disabled={updatingNoteId === l.id || inKitchen}
                title={inKitchen ? "No se puede editar despues de enviar a cocina" : "Editar nota"}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--t-warn-border)",
                  background: "var(--t-warn-soft)",
                  color: "#fbbf24",
                  cursor: inKitchen ? "not-allowed" : "pointer",
                  fontSize: 12,
                  opacity: updatingNoteId === l.id || inKitchen ? 0.6 : 1,
                }}
              >
                {updatingNoteId === l.id ? "..." : "Nota"}
              </button>
              <button
                onClick={() => removeLine(l.id)}
                disabled={removingLineId === l.id || inKitchen}
                title={inKitchen ? "No se puede quitar despues de enviar a cocina" : "Quitar producto"}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--t-danger-border)",
                  background: "var(--t-danger-soft)",
                  color: "#f87171",
                  cursor: inKitchen ? "not-allowed" : "pointer",
                  fontSize: 12,
                  opacity: removingLineId === l.id || inKitchen ? 0.6 : 1,
                }}
              >
                {removingLineId === l.id ? "..." : "Quitar"}
              </button>
            </div>
          ))}
          <hr />
          {saleMode === "delivery" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Consumo</span>
                <span>{formatCOP(baseTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Domicilio</span>
                <span>{formatCOP(deliveryFeeNum)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
                <span>Total a cobrar</span>
                <span>{formatCOP(chargeTotal)}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
              <span>Total</span>
              <span>{formatCOP(baseTotal)}</span>
            </div>
          )}

          {saleMode === "delivery" ? (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--t-card-alt)", border: "1px solid var(--t-border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--t-fg)" }}>Datos del domicilio</div>
              <input
                placeholder="Nombre cliente"
                value={deliveryName}
                onChange={(e) => setDeliveryName(e.target.value)}
                onBlur={saveDelivery}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Celular 3xx..."
                value={deliveryPhone}
                onChange={(e) => setDeliveryPhone(e.target.value)}
                onBlur={saveDelivery}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Direccion"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                onBlur={saveDelivery}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Referencia / barrio"
                value={deliveryReference}
                onChange={(e) => setDeliveryReference(e.target.value)}
                onBlur={saveDelivery}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Domicilio"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                onBlur={saveDelivery}
                style={{ ...ui.input, width: "100%", boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "var(--t-muted)", margin: "8px 0 0" }}>
                Datos para envio y recargo de domicilio{savingDelivery ? " · guardando…" : ""}
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--t-card-alt)", border: "1px solid var(--t-border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--t-fg)" }}>Cliente espera pedido</div>
              <input
                placeholder="Nombre (opcional)"
                value={pickupName}
                onChange={(e) => setPickupName(e.target.value)}
                onBlur={savePickup}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Celular 3xx..."
                value={pickupPhone}
                onChange={(e) => setPickupPhone(e.target.value)}
                onBlur={savePickup}
                style={{ ...ui.input, width: "100%", boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "var(--t-muted)", margin: "8px 0 0" }}>
                WhatsApp o SMS cuando cocina marque listo{savingPickup ? " · guardando…" : ""}
              </p>
            </div>
          )}

          {!inKitchen && (
            <button
              onClick={sendToKitchen}
              disabled={!invoice?.lines?.length || sendingKitchen}
              style={{
                width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 10,
                border: "1px solid #2563eb", background: "var(--t-card)", color: "#60a5fa", fontWeight: 700, fontSize: 14,
                cursor: invoice?.lines?.length ? "pointer" : "not-allowed",
                opacity: invoice?.lines?.length ? 1 : 0.5,
              }}
            >
              {sendingKitchen ? "Enviando…" : "Enviar a cocina"}
            </button>
          )}

          <button
            onClick={() => setShowPay(true)}
            disabled={!invoice?.lines?.length}
            style={{
              width: "100%", marginTop: 10, padding: "14px 0", borderRadius: 10,
              border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 16,
              cursor: invoice?.lines?.length ? "pointer" : "not-allowed",
              opacity: invoice?.lines?.length ? 1 : 0.5,
            }}
          >
            Cobrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
        background: active ? "#2563eb" : "var(--t-chip-bg)",
        color: active ? "#fff" : "var(--t-chip-fg)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function StatusBtn({
  active,
  busy,
  onClick,
  children,
}: {
  active: boolean;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: active ? "none" : "1px solid var(--t-border-strong)",
        background: active ? "#ea580c" : "var(--t-card)",
        color: active ? "#fff" : "var(--t-chip-fg)",
        cursor: "pointer",
        fontSize: 12,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? "..." : children}
    </button>
  );
}

function labelDeliveryStatus(status: DeliveryOrder["deliveryStatus"]) {
  switch (status) {
    case "in_kitchen":
      return "En cocina";
    case "pending":
      return "Pendiente";
    case "on_route":
      return "En ruta";
    case "delivered":
      return "Entregado";
    default:
      return "Nuevo";
  }
}

function isMeaningfulOpenOrder(order: OpenOrder) {
  if (order.status === "sent_to_kitchen") return true;
  return (order.lines?.length ?? 0) > 0 || Number(order.total ?? 0) > 0;
}

function isStaleOpenOrder(order: OpenOrder, hours: number) {
  const ageMs = Date.now() - new Date(order.createdAt).getTime();
  return ageMs >= hours * 3600000;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "#2563eb" : "var(--t-border-strong)"}`,
        background: active ? "var(--t-accent-soft)" : "var(--t-card)",
        color: active ? "#60a5fa" : "var(--t-chip-fg)",
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function labelSaleMode(mode: SaleMode) {
  switch (mode) {
    case "takeaway":
      return "Para llevar";
    case "delivery":
      return "Domicilio";
    default:
      return "Mostrador";
  }
}

function qtyBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 999,
    border: "1px solid var(--t-border-strong)",
    background: "var(--t-card)",
    color: "var(--t-fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 700,
  };
}
