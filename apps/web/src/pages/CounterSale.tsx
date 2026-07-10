import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
import { printInvoiceReceipt, printKitchenLineVoidEscpos, printKitchenVoidTicket } from "../lib/print";
import { useBarcodeScanner } from "../lib/barcode";
import CategoryPicker from "../components/CategoryPicker";
import ModifierPickerModal from "../components/ModifierPickerModal";
import PaymentModal from "../components/PaymentModal";
import InvoiceDiscountModal from "../components/InvoiceDiscountModal";
import { ui, useTheme } from "../lib/theme";
import { formatPickupDisplay, formatPickupLabel } from "../lib/pickupCode";
import { LINE_VOIDED_EVENT, INVOICE_UPDATED_EVENT, type LineVoidedDetail, type InvoiceUpdatedDetail } from "../lib/kdsSocket";
import { discountPercentFromAmount, discountPinErrorMessage, isDiscountPinRequiredError, needsDiscountPin } from "../lib/discountPin";
import PinPromptModal from "../components/PinPromptModal";

type Product = {
  id: string;
  name: string;
  categoryId?: string;
  variants: { id: string; name: string; price: string; sellByWeight: boolean; unit: string; barcode?: string }[];
  category?: { id: string; name: string; color?: string };
  modifierGroups?: {
    modifierGroup: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      options: { id: string; name: string; priceDelta: string; isActive?: boolean }[];
    };
  }[];
};

type Category = {
  id: string;
  name: string;
  color?: string;
  description?: string | null;
  imageUrl?: string | null;
  mobileDisplay?: "image" | "description" | string | null;
};

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

function canWaiterVoidLine(inKitchen: boolean, kitchenStatus?: string | null) {
  if (!inKitchen) return true;
  return kitchenStatus === "new" || kitchenStatus === null;
}

function isLinePendingKitchen(kitchenStatus?: string | null) {
  return kitchenStatus == null;
}

function canEditOpenLine(kitchenStatus?: string | null) {
  return isLinePendingKitchen(kitchenStatus);
}

function lineKitchenStatusLabel(kitchenStatus?: string | null) {
  if (kitchenStatus === "preparing") return "Preparando en cocina";
  if (kitchenStatus === "ready") return "Listo en cocina";
  if (kitchenStatus === "new") return "Enviado a cocina";
  return null;
}

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
  const [pickupCode, setPickupCode] = useState("");
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
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [applyingCourtesyId, setApplyingCourtesyId] = useState<string | null>(null);
  const [maxDiscountWithoutPin, setMaxDiscountWithoutPin] = useState(10);
  const [kitchenSendMode, setKitchenSendMode] = useState<"manual" | "auto">("manual");
  const [pinPrompt, setPinPrompt] = useState<{
    title: string;
    description: string;
    onSubmit: (pin: string) => Promise<void>;
  } | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
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
    api.get("/v1/settings/branch").then((res) => {
      const max = Number(res.data?.pos?.maxDiscountPercentWithoutPin);
      setMaxDiscountWithoutPin(Number.isFinite(max) && max >= 0 && max <= 100 ? max : 10);
      setKitchenSendMode(res.data?.pos?.kitchenSendMode === "auto" ? "auto" : "manual");
    }).catch(() => {});
  }, [branchId]);

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
    setPickupCode(invoice.pickupCode ?? "");
    setDeliveryName(invoice.deliveryName ?? "");
    setDeliveryPhone(invoice.deliveryPhone ?? "");
    setDeliveryAddress(invoice.deliveryAddress ?? "");
    setDeliveryReference(invoice.deliveryReference ?? "");
    setDeliveryFee(String(invoice.deliveryFee ?? "0"));
  }, [invoice?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LineVoidedDetail>).detail;
      if (!detail?.invoiceId) return;
      void refreshOpenOrders();
      if (invoice?.id !== detail.invoiceId) return;
      void api.get(`/v1/pos/invoices/${detail.invoiceId}`).then((res) => {
        setInvoice(res.data);
      }).catch(() => {});
    };
    window.addEventListener(LINE_VOIDED_EVENT, handler);
    return () => window.removeEventListener(LINE_VOIDED_EVENT, handler);
  }, [invoice?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InvoiceUpdatedDetail>).detail;
      if (!detail?.invoiceId) return;
      void refreshOpenOrders();
      if (invoice?.id !== detail.invoiceId) return;
      void api.get(`/v1/pos/invoices/${detail.invoiceId}`).then((res) => {
        setInvoice(res.data);
      }).catch(() => {});
    };
    window.addEventListener(INVOICE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(INVOICE_UPDATED_EVENT, handler);
  }, [invoice?.id]);

  function requestDiscountPin(title: string, description: string, action: (pin: string) => Promise<void>) {
    setPinError(null);
    setPinPrompt({
      title,
      description,
      onSubmit: async (pin) => {
        setPinBusy(true);
        setPinError(null);
        try {
          await action(pin);
          setPinPrompt(null);
        } catch (err: unknown) {
          if (isDiscountPinRequiredError(err) || (err as { response?: { status?: number } })?.response?.status === 401) {
            setPinError(discountPinErrorMessage(err, "PIN incorrecto"));
          } else {
            setPinPrompt(null);
            alert(discountPinErrorMessage(err, "No se pudo aplicar"));
          }
        } finally {
          setPinBusy(false);
        }
      },
    });
  }

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

  async function addVariant(
    variant: Product["variants"][0],
    productName: string,
    sellByWeight?: boolean,
    modifiers?: Array<{ name: string; priceDelta?: string }>,
    lineNotes?: string,
  ) {
    const inv = invoiceRef.current;
    if (!inv) return;
    const qty = sellByWeight ? weight : "1";
    await api.post(`/v1/pos/invoices/${inv.id}/add-line`, {
      variantId: variant.id,
      name: productName,
      qty,
      unitPrice: String(variant.price),
      weight: sellByWeight ? weight : undefined,
      modifiers: modifiers?.length ? modifiers : undefined,
      lineNotes,
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
    const groups = (product.modifierGroups ?? []).map((row) => row.modifierGroup).filter((g) => (g.options ?? []).length > 0);
    if (groups.length > 0) {
      setModifierProduct(product);
      return;
    }
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

  async function removeLine(lineId: string, lineName?: string) {
    if (!invoice) return;
    const line = invoice.lines?.find((l: any) => l.id === lineId);
    const alreadyInKitchen = inKitchen && line && !isLinePendingKitchen(line.kitchenStatus);
    if (alreadyInKitchen) {
      const ok = window.confirm(
        `¿Anular "${lineName ?? "este producto"}" en cocina?\nSe quitará del pedido y se avisará al KDS.`,
      );
      if (!ok) return;
    }
    setRemovingLineId(lineId);
    try {
      const updated = await api.post(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/remove`);
      if (updated.data.kitchenLineVoidEscpos?.base64) {
        await printKitchenLineVoidEscpos(updated.data.kitchenLineVoidEscpos);
      }
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
    if (!invoice) return;
    const line = invoice.lines?.find((l: any) => l.id === lineId);
    if (line && !canEditOpenLine(line.kitchenStatus)) return;
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
        pickupCode: pickupCode.trim() || undefined,
      });
      setInvoice((prev: any) => ({ ...prev, ...res.data }));
      setPickupCode(res.data.pickupCode ?? pickupCode);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo guardar el localizador");
    } finally {
      setSavingPickup(false);
    }
  }

  async function persistPickupIfNeeded() {
    if (pickupPhone || pickupName || pickupCode.trim()) {
      await savePickup();
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
      } else {
        await persistPickupIfNeeded();
      }
      const res = await api.post(`/v1/pos/invoices/${invoice.id}/send-to-kitchen`);
      setInvoice(res.data);
      refreshPickupQueue();
      const code = res.data.pickupCode ? ` ${formatPickupLabel(res.data.pickupCode)}.` : "";
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

  async function applyInvoiceDiscount(
    data: { kind: "percent" | "amount"; value: string; reason?: string },
    approvalPin?: string,
  ): Promise<boolean | void> {
    if (!invoice) return;
    const baseTotal = invoice.lines?.reduce((sum: number, line: any) => sum + Number(line.lineTotal), 0) ?? 0;
    const pct = data.kind === "percent"
      ? Number(data.value)
      : discountPercentFromAmount(Number(data.value), baseTotal);
    if (!approvalPin && needsDiscountPin(pct, maxDiscountWithoutPin)) {
      requestDiscountPin(
        "Autorizar descuento",
        `El descuento supera el ${maxDiscountWithoutPin}% permitido sin autorización. Ingresa PIN de gerente o administrador.`,
        async (pin) => {
          await applyInvoiceDiscount(data, pin);
          setShowDiscount(false);
        },
      );
      return false;
    }
    const res = await api.patch(`/v1/pos/invoices/${invoice.id}/discount`, {
      kind: data.kind,
      value: data.value,
      reason: data.reason,
      approvalPin,
    });
    setInvoice(res.data);
  }

  async function clearInvoiceDiscount() {
    if (!invoice) return;
    const res = await api.patch(`/v1/pos/invoices/${invoice.id}/discount`, { kind: "clear" });
    setInvoice(res.data);
  }

  async function toggleLineCourtesy(line: any, approvalPin?: string) {
    if (!invoice) return;
    const isCourtesy = Number(line.lineTotal) === 0 && Number(line.lineDiscount) > 0;
    if (!isCourtesy && !approvalPin && needsDiscountPin(100, maxDiscountWithoutPin)) {
      requestDiscountPin(
        "Autorizar cortesía",
        "El producto quedará sin costo. Ingresa PIN de gerente o administrador.",
        (pin) => toggleLineCourtesy(line, pin),
      );
      return;
    }
    setApplyingCourtesyId(line.id);
    try {
      const res = await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${line.id}/discount`, {
        kind: isCourtesy ? "clear" : "courtesy",
        approvalPin,
      });
      setInvoice(res.data);
    } catch (err: unknown) {
      alert(discountPinErrorMessage(err, "No se pudo aplicar la cortesía"));
    } finally {
      setApplyingCourtesyId(null);
    }
  }

  async function handlePay(data: { payments: any[]; tipAmount: string }) {
    if (!invoice) return;
    if (saleMode === "delivery") {
      await saveDelivery();
    } else {
      await persistPickupIfNeeded();
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
  const pendingKitchenCount = invoice?.lines?.filter((l: any) => isLinePendingKitchen(l.kitchenStatus)).length ?? 0;
  const hasPendingKitchen = pendingKitchenCount > 0;
  const readyOrders = pickupQueue.filter((o) => o.kitchenStatus === "ready");
  const pendingOrders = pickupQueue.filter((o) => o.kitchenStatus !== "ready");
  const activeDeliveries = deliveryQueue.filter((o) => o.deliveryStatus !== "delivered");
  const baseTotal = Number(invoice?.total ?? 0);
  const linesTotal = invoice?.lines?.reduce((sum: number, line: any) => sum + Number(line.lineTotal), 0) ?? 0;
  const invoiceDiscount = Number(invoice?.discount ?? 0);
  const deliveryFeeNum = saleMode === "delivery" ? Number(deliveryFee || 0) : 0;
  const chargeTotal = baseTotal + deliveryFeeNum;

  return (
    <div>
      {pinPrompt && (
        <PinPromptModal
          open
          title={pinPrompt.title}
          description={pinPrompt.description}
          confirmLabel="Autorizar"
          onCancel={() => {
            if (!pinBusy) setPinPrompt(null);
          }}
          onSubmit={pinPrompt.onSubmit}
          error={pinError}
          busy={pinBusy}
        />
      )}
      {showDiscount && invoice && (
        <InvoiceDiscountModal
          baseTotal={linesTotal}
          currentDiscount={invoiceDiscount}
          onApply={applyInvoiceDiscount}
          onClear={clearInvoiceDiscount}
          onClose={() => setShowDiscount(false)}
        />
      )}
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
                  {formatPickupDisplay(o.pickupCode)}
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
          linesTotal={linesTotal}
          invoiceDiscount={invoiceDiscount}
          onOpenDiscount={() => {
            setShowPay(false);
            setShowDiscount(true);
          }}
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
          : "Escanea o toca productos · Ingresa el número de localizador que entregas al cliente (opcional: celular para aviso)"}
      </p>

      <div className="yall-search-row">
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
          style={{ ...ui.input, flex: 1, minWidth: 0 }}
        />
        {isBakery && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label>Peso (kg):</label>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...ui.input, width: 60, padding: 6 }} />
          </div>
        )}
      </div>

      <CategoryPicker
        categories={categories}
        selectedId={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <div className="yall-pos-layout">
        <div className="yall-pos-products">
          {filtered.map((p) => {
            const v = p.variants[0];
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="yall-product-btn"
                style={{
                  background: productCardBg(p.category?.color),
                  color: "var(--t-fg)",
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

        <div className="yall-pos-ticket">
        <div className="yall-pos-ticket-inner">
          <h4 style={{ margin: "0 0 12px", color: "var(--t-fg)" }}>Ticket</h4>
          {inKitchen && (
            <div style={{
              fontSize: 12, padding: "8px 10px", borderRadius: 8, marginBottom: 10,
              background: "var(--t-accent-soft)", color: "#60a5fa", border: "1px solid var(--t-accent-border)",
            }}>
              🍳 En cocina
              {invoice.pickupCode ? ` · ${formatPickupLabel(invoice.pickupCode)}` : ""}
              {pickupPhone ? " — avisaremos al cliente" : ""}
              {hasPendingKitchen ? ` · ${pendingKitchenCount} pendiente(s)` : ""}
            </div>
          )}
          {invoice?.lines?.map((l: any) => {
            const lineEditable = canEditOpenLine(l.kitchenStatus);
            return (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto auto", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 6, color: "var(--t-fg)" }}>
              <div>
                <div>
                  {l.nameSnapshot}
                  {isLinePendingKitchen(l.kitchenStatus) && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#b45309", fontWeight: 600 }}>Pendiente</span>
                  )}
                </div>
                {Array.isArray(l.modifiers) && l.modifiers.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 2 }}>
                    {l.modifiers.map((m: any) => m.nameSnapshot).join(" · ")}
                  </div>
                )}
                {l.lineNotes && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>📝 {l.lineNotes}</div>
                )}
                {inKitchen && lineKitchenStatusLabel(l.kitchenStatus) && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>
                    {lineKitchenStatusLabel(l.kitchenStatus)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => changeLineQty(l.id, l.qty, -1)}
                  disabled={updatingQtyId === l.id || !lineEditable}
                  style={qtyBtnStyle(updatingQtyId === l.id || !lineEditable)}
                >
                  -
                </button>
                <strong style={{ minWidth: 26, textAlign: "center" }}>{Number(l.qty)}</strong>
                <button
                  onClick={() => changeLineQty(l.id, l.qty, 1)}
                  disabled={updatingQtyId === l.id || !lineEditable}
                  style={qtyBtnStyle(updatingQtyId === l.id || !lineEditable)}
                >
                  +
                </button>
              </div>
              <span>{formatCOP(Number(l.lineTotal))}</span>
              <button
                type="button"
                onClick={() => toggleLineCourtesy(l)}
                disabled={applyingCourtesyId === l.id}
                title={Number(l.lineTotal) === 0 && Number(l.lineDiscount) > 0 ? "Quitar cortesía" : "Cortesía"}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: Number(l.lineDiscount) > 0 ? "1px solid #fcd34d" : "1px solid var(--t-border)",
                  background: Number(l.lineDiscount) > 0 ? "#fef3c7" : "var(--t-card)",
                  color: Number(l.lineDiscount) > 0 ? "#b45309" : "var(--t-muted)",
                  cursor: applyingCourtesyId === l.id ? "wait" : "pointer",
                  fontSize: 12,
                  opacity: applyingCourtesyId === l.id ? 0.6 : 1,
                }}
              >
                {applyingCourtesyId === l.id ? "..." : "🎁"}
              </button>
              <button
                onClick={() => editLineNote(l.id, l.lineNotes)}
                disabled={updatingNoteId === l.id || !lineEditable}
                title={!lineEditable ? "No se puede editar despues de enviar a cocina" : "Editar nota"}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--t-warn-border)",
                  background: "var(--t-warn-soft)",
                  color: "#fbbf24",
                  cursor: !lineEditable ? "not-allowed" : "pointer",
                  fontSize: 12,
                  opacity: updatingNoteId === l.id || !lineEditable ? 0.6 : 1,
                }}
              >
                {updatingNoteId === l.id ? "..." : "Nota"}
              </button>
              <button
                onClick={() => removeLine(l.id, l.nameSnapshot)}
                disabled={removingLineId === l.id || !canWaiterVoidLine(inKitchen, l.kitchenStatus)}
                title={
                  inKitchen && !canWaiterVoidLine(inKitchen, l.kitchenStatus)
                    ? "Ya está en preparación. Pide a cocina que lo anule."
                    : inKitchen && !isLinePendingKitchen(l.kitchenStatus)
                      ? "Anular en cocina"
                      : "Quitar producto"
                }
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--t-danger-border)",
                  background: "var(--t-danger-soft)",
                  color: "#f87171",
                  cursor: removingLineId === l.id || !canWaiterVoidLine(inKitchen, l.kitchenStatus) ? "not-allowed" : "pointer",
                  fontSize: 12,
                  opacity: removingLineId === l.id || !canWaiterVoidLine(inKitchen, l.kitchenStatus) ? 0.6 : 1,
                }}
              >
                {removingLineId === l.id ? "..." : (inKitchen && !isLinePendingKitchen(l.kitchenStatus) ? "Anular" : "Quitar")}
              </button>
            </div>
            );
          })}
          <hr />
          {invoiceDiscount > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--t-muted)", marginBottom: 4 }}>
                <span>Subtotal</span>
                <span>{formatCOP(linesTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#b91c1c", marginBottom: 8 }}>
                <span>Descuento</span>
                <span>-{formatCOP(invoiceDiscount)}</span>
              </div>
            </>
          )}
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
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--t-fg)" }}>
                {saleMode === "counter" ? "Localizador del cliente" : "Cliente espera pedido"}
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>
                Número de localizador
                <input
                  placeholder="Ej. 42 → 042"
                  inputMode="numeric"
                  value={pickupCode}
                  onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onBlur={savePickup}
                  disabled={inKitchen && Boolean(invoice?.pickupCode)}
                  style={{ ...ui.input, width: "100%", fontSize: 18, fontWeight: 700, letterSpacing: "0.08em" }}
                />
              </label>
              {invoice?.pickupCode && (
                <p style={{ fontSize: 12, color: "var(--t-accent-fg)", margin: "0 0 8px", fontWeight: 600 }}>
                  {formatPickupLabel(invoice.pickupCode)} asignado
                </p>
              )}
              <input
                placeholder="Nombre (opcional)"
                value={pickupName}
                onChange={(e) => setPickupName(e.target.value)}
                onBlur={savePickup}
                style={{ ...ui.input, width: "100%", marginBottom: 8 }}
              />
              <input
                placeholder="Celular 3xx... (opcional, aviso WhatsApp/SMS)"
                value={pickupPhone}
                onChange={(e) => setPickupPhone(e.target.value)}
                onBlur={savePickup}
                style={{ ...ui.input, width: "100%", boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "var(--t-muted)", margin: "8px 0 0" }}>
                {saleMode === "counter"
                  ? "Localizador físico: 1–999. Si no ingresas número, se asigna consecutivo de pedido desde 1000."
                  : "WhatsApp o SMS cuando cocina marque listo. Sin localizador: consecutivo desde 1000."}
                {savingPickup ? " · guardando…" : ""}
              </p>
            </div>
          )}

          {(kitchenSendMode === "manual" || hasPendingKitchen || !inKitchen) && (
            <button
              onClick={sendToKitchen}
              disabled={!invoice?.lines?.length || sendingKitchen || (kitchenSendMode === "manual" && inKitchen && !hasPendingKitchen)}
              style={{
                width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 10,
                border: "1px solid #2563eb", background: "var(--t-card)", color: "#60a5fa", fontWeight: 700, fontSize: 14,
                cursor: invoice?.lines?.length && !(kitchenSendMode === "manual" && inKitchen && !hasPendingKitchen) ? "pointer" : "not-allowed",
                opacity: invoice?.lines?.length && !(kitchenSendMode === "manual" && inKitchen && !hasPendingKitchen) ? 1 : 0.5,
              }}
            >
              {sendingKitchen
                ? "Enviando…"
                : hasPendingKitchen
                  ? `Enviar ${pendingKitchenCount} a cocina`
                  : "Enviar a cocina"}
            </button>
          )}
          {kitchenSendMode === "auto" && (
            <p style={{ fontSize: 11, color: "var(--t-muted)", margin: "8px 0 0", textAlign: "center" }}>
              Modo automático: cada producto se envía al KDS al agregarlo
            </p>
          )}
          {kitchenSendMode === "manual" && hasPendingKitchen && (
            <p style={{ fontSize: 11, color: "#b45309", margin: "8px 0 0", textAlign: "center" }}>
              {pendingKitchenCount} producto(s) pendiente(s) de cocina
            </p>
          )}

          {invoice?.lines?.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDiscount(true)}
              style={{
                width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 10,
                border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              {invoiceDiscount > 0 ? "✏️ Editar descuento de cuenta" : "🏷️ Descuento en la cuenta"}
            </button>
          )}

          <button
            onClick={() => setShowPay(true)}
            disabled={!invoice?.lines?.length}
            style={{
              width: "100%", marginTop: 10, padding: "14px 0", borderRadius: 10,
              border: "none", background: "var(--t-green-fg)", color: "var(--t-primary-fg)", fontWeight: 700, fontSize: 16,
              cursor: invoice?.lines?.length ? "pointer" : "not-allowed",
              opacity: invoice?.lines?.length ? 1 : 0.5,
            }}
          >
            Cobrar
          </button>
        </div>
        </div>
      </div>
      {modifierProduct && (
        <ModifierPickerModal
          productName={modifierProduct.name}
          groups={(modifierProduct.modifierGroups ?? []).map((row) => row.modifierGroup)}
          onClose={() => setModifierProduct(null)}
          onConfirm={async ({ modifiers, lineNotes }) => {
            const current = modifierProduct;
            const variant = current.variants[0];
            setModifierProduct(null);
            if (!variant) return;
            await addVariant(variant, current.name, variant.sellByWeight, modifiers, lineNotes);
          }}
        />
      )}
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
