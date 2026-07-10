import { useEffect, useMemo, useState, useCallback } from "react";
import { api, formatApiError, setBranchId, formatCOP } from "../lib/api";
import { canVoidInvoice, getStoredAuth } from "../lib/auth";
import { printInvoiceReceipt, printKitchenTicket, printKitchenLineVoidEscpos, printKitchenVoidTicket } from "../lib/print";
import { dispatchTableUpdated, TABLE_READY_EVENT, TABLE_SERVED_EVENT, LINE_VOIDED_EVENT, INVOICE_UPDATED_EVENT, type TableReadyDetail, type TableServedDetail, type LineVoidedDetail, type InvoiceUpdatedDetail } from "../lib/kdsSocket";
import { discountPercentFromAmount, discountPinErrorMessage, isDiscountPinRequiredError, needsDiscountPin } from "../lib/discountPin";
import PinPromptModal from "../components/PinPromptModal";
import { matchesOrderWaiter, orderReadyActionLabel, playKitchenReadyTone } from "../lib/kitchenReady";
import CategoryPicker from "../components/CategoryPicker";
import ModifierPickerModal from "../components/ModifierPickerModal";
import PaymentModal from "../components/PaymentModal";
import InvoiceDiscountModal from "../components/InvoiceDiscountModal";
import { useBarcodeScanner } from "../lib/barcode";
import { useTheme } from "../lib/theme";
import { useIsMobile } from "../lib/useMediaQuery";
import type { WaiterIdentity } from "../lib/pin";
import { assignTableWaiter } from "../lib/waiterAttribution";

type Product = {
  id: string;
  name: string;
  categoryId?: string;
  course?: string;
  category?: { id: string; name: string; color?: string };
  variants: { id: string; name: string; price: string }[];
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

function canWaiterVoidLine(inKitchen: boolean, kitchenStatus?: string | null) {
  if (!inKitchen) return true;
  return kitchenStatus === "new" || kitchenStatus === null;
}

function isLinePendingKitchen(kitchenStatus?: string | null) {
  return kitchenStatus == null;
}

function canEditOpenLine(isPaid: boolean, kitchenStatus?: string | null) {
  if (isPaid) return false;
  return isLinePendingKitchen(kitchenStatus);
}

function lineKitchenStatusLabel(kitchenStatus?: string | null) {
  if (kitchenStatus === "preparing") return "Preparando en cocina";
  if (kitchenStatus === "ready") return "Listo en cocina";
  if (kitchenStatus === "new") return "Enviado a cocina";
  return null;
}

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
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const [showMobileActions, setShowMobileActions] = useState(false);
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
  const canVoid = canVoidInvoice(getStoredAuth()?.user);
  const isMobile = useIsMobile();

  useEffect(() => { setBranchId(branchId); }, [branchId]);

  useEffect(() => {
    api.get("/v1/restaurant/waiters").then((res) => setWaiters(res.data));
  }, [branchId]);

  useEffect(() => {
    api.get("/v1/settings/branch").then((res) => {
      const max = Number(res.data?.pos?.maxDiscountPercentWithoutPin);
      setMaxDiscountWithoutPin(Number.isFinite(max) && max >= 0 && max <= 100 ? max : 10);
      setKitchenSendMode(res.data?.pos?.kitchenSendMode === "auto" ? "auto" : "manual");
    }).catch(() => {});
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
      if (!matchesOrderWaiter({ waiterId: inv.waiterId, waiterUserId: inv.waiterUserId }, activeWaiter)) {
        setKitchenReadyAlert(null);
        return;
      }
      const table = inv.tableSession?.table;
      const label = table
        ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
        : "Mesa";
      const base: TableReadyDetail = {
        invoiceId: inv.id,
        tableSessionId: inv.tableSessionId,
        tableId: inv.tableId,
        tableLabel: label,
        orderLabel: label,
        serviceType: inv.serviceType,
        waiterId: inv.waiterId,
        waiterUserId: inv.waiterUserId,
        itemsSummary: inv.lines?.slice(0, 3).map((l: any) => l.nameSnapshot).join(", "),
        actionHint: inv.serviceType === "dine_in" ? "serve" : "pickup",
      };
      setKitchenReadyAlert(base);
      api.get("/v1/pos/table-ready-queue").then((res) => {
        const row = res.data.find((r: any) => r.invoiceId === inv.id);
        if (row?.waiterWhatsAppLink) {
          setKitchenReadyAlert((cur) => (cur && cur.invoiceId === inv.id
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
      if (!matchesOrderWaiter(detail, activeWaiter)) return;
      const matchesSession = detail.tableSessionId === tableSessionId;
      const matchesInvoice = detail.invoiceId && openInvoices.some((i) => i.id === detail.invoiceId);
      if (matchesSession || matchesInvoice) {
        setKitchenReadyAlert(detail);
        playKitchenReadyTone();
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
  }, [tableSessionId, openInvoices, activeWaiter?.id, activeWaiter?.kind]);

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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LineVoidedDetail>).detail;
      if (!detail?.invoiceId) return;
      const matchesSession = detail.tableSessionId && detail.tableSessionId === tableSessionId;
      const matchesInvoice = detail.invoiceId === invoice?.id || openInvoices.some((i) => i.id === detail.invoiceId);
      if (matchesSession || matchesInvoice) {
        void loadOrCreate();
      }
    };
    window.addEventListener(LINE_VOIDED_EVENT, handler);
    return () => window.removeEventListener(LINE_VOIDED_EVENT, handler);
  }, [tableSessionId, openInvoices, invoice?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InvoiceUpdatedDetail>).detail;
      if (!detail?.invoiceId) return;
      const matchesSession = detail.tableSessionId && detail.tableSessionId === tableSessionId;
      const matchesInvoice = detail.invoiceId === invoice?.id || openInvoices.some((i) => i.id === detail.invoiceId);
      if (matchesSession || matchesInvoice) {
        void loadOrCreate();
      }
    };
    window.addEventListener(INVOICE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(INVOICE_UPDATED_EVENT, handler);
  }, [tableSessionId, openInvoices, invoice?.id]);

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
    const groups = (product.modifierGroups ?? []).map((row) => row.modifierGroup).filter((g) => (g.options ?? []).length > 0);
    if (groups.length > 0) {
      setModifierProduct(product);
      return;
    }
    await addProductWithModifiers(product, [], undefined);
  }

  async function addProductWithModifiers(
    product: Product,
    modifiers: Array<{ name: string; priceDelta?: string }>,
    lineNotes?: string,
  ) {
    if (!invoice || invoice.status === "paid") return;
    const variant = product.variants[0];
    if (!variant) return;
    try {
      await api.post(`/v1/pos/invoices/${invoice.id}/add-line`, {
        variantId: variant.id,
        name: product.name,
        course: product.course,
        qty: "1",
        unitPrice: String(variant.price),
        lineNotes,
        modifiers: modifiers.length ? modifiers : undefined,
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

  async function removeLine(lineId: string, lineName?: string) {
    if (!invoice) return;
    if (inKitchen) {
      const ok = window.confirm(
        `¿Anular "${lineName ?? "este producto"}" en cocina?\nSe quitará de la comanda y se avisará al KDS.`,
      );
      if (!ok) return;
    }
    try {
      const res = await api.post(`/v1/pos/invoices/${invoice.id}/lines/${lineId}/remove`);
      if (res.data.kitchenLineVoidEscpos?.base64) {
        await printKitchenLineVoidEscpos(res.data.kitchenLineVoidEscpos);
      }
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
    if (!invoice) return;
    const line = invoice.lines?.find((l: any) => l.id === lineId);
    if (line && !canEditOpenLine(false, line.kitchenStatus)) return;
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
    await api.patch(`/v1/pos/invoices/${invoice.id}/discount`, {
      kind: data.kind,
      value: data.value,
      reason: data.reason,
      approvalPin,
    });
    await loadOrCreate();
  }

  async function clearInvoiceDiscount() {
    if (!invoice) return;
    await api.patch(`/v1/pos/invoices/${invoice.id}/discount`, { kind: "clear" });
    await loadOrCreate();
  }

  async function toggleLineCourtesy(line: any, approvalPin?: string) {
    if (!invoice || invoice.status === "paid") return;
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
      await api.patch(`/v1/pos/invoices/${invoice.id}/lines/${line.id}/discount`, {
        kind: isCourtesy ? "clear" : "courtesy",
        approvalPin,
      });
      await loadOrCreate();
    } catch (err: unknown) {
      alert(discountPinErrorMessage(err, "No se pudo aplicar la cortesía"));
    } finally {
      setApplyingCourtesyId(null);
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

  const total = Number(invoice?.total ?? 0);
  const linesTotal = invoice?.lines?.reduce((sum: number, line: any) => sum + Number(line.lineTotal), 0) ?? 0;
  const invoiceDiscount = Number(invoice?.discount ?? 0);
  const inKitchen = invoice?.status === "sent_to_kitchen";
  const pendingKitchenCount = invoice?.lines?.filter((l: any) => isLinePendingKitchen(l.kitchenStatus)).length ?? 0;
  const hasPendingKitchen = pendingKitchenCount > 0;

  if (!tableSessionId) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--t-muted)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
        <p>Selecciona una mesa en la pestaña <strong>Mesas</strong> para abrir la comanda.</p>
      </div>
    );
  }

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
      {showDiscount && !isPaid && invoice && (
        <InvoiceDiscountModal
          baseTotal={linesTotal}
          currentDiscount={invoiceDiscount}
          onApply={applyInvoiceDiscount}
          onClear={clearInvoiceDiscount}
          onClose={() => setShowDiscount(false)}
        />
      )}
      {showPay && !isPaid && (
        <PaymentModal
          total={total}
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
            🟢 Cocina lista — {kitchenReadyAlert.orderLabel ?? kitchenReadyAlert.tableLabel ?? tableLabel ?? "Mesa"}
            {kitchenReadyAlert.itemsSummary ? ` · ${kitchenReadyAlert.itemsSummary}` : ""}
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
              {orderReadyActionLabel(kitchenReadyAlert)}
            </span>
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

          <CategoryPicker
            categories={categories}
            selectedId={selectedCat}
            onSelect={setSelectedCat}
          />

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
                  {!isPaid && canEditOpenLine(isPaid, l.kitchenStatus) && (
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
                  {(isPaid || !canEditOpenLine(isPaid, l.kitchenStatus)) && <span>×{l.qty}</span>}
                  {!isPaid && (
                    <button
                      onClick={() => editLineNote(l.id, l.lineNotes)}
                      disabled={!canEditOpenLine(isPaid, l.kitchenStatus) || updatingNoteId === l.id}
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 6,
                        border: "1px solid var(--t-border-strong)",
                        background: l.lineNotes ? "var(--t-accent-soft)" : "var(--t-card)",
                        color: "var(--t-fg)",
                        cursor: !canEditOpenLine(isPaid, l.kitchenStatus) ? "not-allowed" : "pointer",
                        opacity: !canEditOpenLine(isPaid, l.kitchenStatus) ? 0.6 : 1,
                      }}
                    >
                      {l.lineNotes ? "Nota ✓" : "Nota"}
                    </button>
                  )}
                  {isLinePendingKitchen(l.kitchenStatus) && !isPaid && (
                    <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>Pendiente</span>
                  )}
                </div>
                {Array.isArray(l.modifiers) && l.modifiers.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 2 }}>
                    {l.modifiers.map((m: any) => m.nameSnapshot).join(" · ")}
                  </div>
                )}
                {l.lineNotes && <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 2 }}>{l.lineNotes}</div>}
                {inKitchen && lineKitchenStatusLabel(l.kitchenStatus) && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>
                    {lineKitchenStatusLabel(l.kitchenStatus)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{formatCOP(Number(l.lineTotal))}</span>
                  {!isPaid && (
                    <button
                      type="button"
                      onClick={() => toggleLineCourtesy(l)}
                      disabled={applyingCourtesyId === l.id}
                      title={Number(l.lineTotal) === 0 && Number(l.lineDiscount) > 0 ? "Quitar cortesía" : "Cortesía"}
                      style={{
                        border: "none",
                        background: Number(l.lineDiscount) > 0 ? "#fef3c7" : "transparent",
                        color: Number(l.lineDiscount) > 0 ? "#b45309" : "var(--t-muted)",
                        cursor: applyingCourtesyId === l.id ? "wait" : "pointer",
                        fontSize: 14,
                        borderRadius: 6,
                        padding: "0 4px",
                      }}
                    >
                      {applyingCourtesyId === l.id ? "…" : "🎁"}
                    </button>
                  )}
                  {!isPaid && canWaiterVoidLine(inKitchen, l.kitchenStatus) && (
                    <button
                      onClick={() => removeLine(l.id, l.nameSnapshot)}
                      title={inKitchen ? "Anular en cocina" : "Quitar"}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontSize: inKitchen ? 11 : 16,
                        fontWeight: inKitchen ? 600 : undefined,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {inKitchen ? "Anular" : "×"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!invoice?.lines?.length && <p style={{ color: "var(--t-muted)", fontSize: 13 }}>Sin productos</p>}
          <hr style={{ border: "none", borderTop: "1px solid var(--t-border)" }} />
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
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}>
            <span>Total</span>
            <span>{formatCOP(total)}</span>
          </div>

          {!isPaid && (
            <div className={isMobile ? "yall-order-actions yall-order-actions--mobile" : "yall-order-actions"} style={{ display: "grid", gap: 8, marginTop: 16 }}>
              {isMobile ? (
                <div className="yall-order-actions-row">
                  <button
                    type="button"
                    className="yall-order-action-btn"
                    onClick={() => setShowMobileActions((prev) => !prev)}
                    style={btnSecondary}
                  >
                    {showMobileActions ? "▲ Ocultar" : "⚙️ Más opciones"}
                  </button>
                  <button
                    onClick={() => setShowPay(true)}
                    disabled={!invoice?.lines?.length}
                    className="yall-order-pay-btn"
                    style={btnPrimary}
                  >
                    💳 Cobrar
                  </button>
                </div>
              ) : null}
              {(!isMobile || showMobileActions) && (
                <>
                  {invoice?.lines?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDiscount(true)}
                      className={isMobile ? "yall-order-action-btn" : undefined}
                      style={btnSecondary}
                    >
                      {invoiceDiscount > 0
                        ? (isMobile ? "✏️ Editar descuento" : "Editar descuento de cuenta")
                        : (isMobile ? "🏷️ Descuento" : "Descuento en la cuenta")}
                    </button>
                  )}
                  {invoice?.lines?.length > 1 && openInvoices.length === 1 && (
                    <button
                      onClick={() => setShowSplit(true)}
                      className={isMobile ? "yall-order-action-btn" : undefined}
                      style={btnSecondary}
                    >
                      {isMobile ? "🍴 Dividir cuenta" : "Dividir cuenta"}
                    </button>
                  )}
                  {(kitchenSendMode === "manual" || hasPendingKitchen || !inKitchen) && (
                    <button
                      onClick={sendToKitchen}
                      disabled={!invoice?.lines?.length || (kitchenSendMode === "manual" && inKitchen && !hasPendingKitchen)}
                      className={isMobile ? "yall-order-action-btn" : undefined}
                      style={btnSecondary}
                    >
                      {hasPendingKitchen
                        ? (isMobile
                          ? `🍳 Enviar ${pendingKitchenCount}`
                          : `Enviar ${pendingKitchenCount} a cocina`)
                        : inKitchen
                          ? (isMobile ? "🍳 Reenviar cocina" : "Reenviar comanda cocina")
                          : (isMobile ? "🍳 Enviar a cocina" : "Enviar a cocina")}
                    </button>
                  )}
                  {inKitchen && (
                    <>
                      <button
                        onClick={reprintKitchen}
                        disabled={reprintingKitchen}
                        className={isMobile ? "yall-order-action-btn" : undefined}
                        style={{
                          ...btnSecondary,
                          opacity: reprintingKitchen ? 0.7 : 1,
                        }}
                      >
                        {reprintingKitchen ? "Imprimiendo…" : (isMobile ? "🖨️ Reimprimir" : "Reimprimir comanda")}
                      </button>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--t-muted)", textAlign: "center" }}>
                        {kitchenSendMode === "auto"
                          ? "Modo automático: cada producto nuevo va al KDS"
                          : hasPendingKitchen
                            ? `${pendingKitchenCount} producto(s) pendiente(s) de enviar a cocina`
                            : "Modo manual: agrega productos y envía cuando esté listo"}
                      </p>
                    </>
                  )}
                  {!inKitchen && kitchenSendMode === "auto" && (
                    <p style={{ margin: 0, fontSize: 11, color: "var(--t-muted)", textAlign: "center" }}>
                      Modo automático: al agregar un producto se envía a cocina
                    </p>
                  )}
                  {!inKitchen && kitchenSendMode === "manual" && invoice?.lines?.length > 0 && (
                    <p style={{ margin: 0, fontSize: 11, color: "var(--t-muted)", textAlign: "center" }}>
                      Modo manual: arma la comanda y luego envía a cocina
                    </p>
                  )}
                  {canVoid && (
                    <button
                      onClick={voidInvoice}
                      disabled={voiding}
                      className={isMobile ? "yall-order-action-btn" : undefined}
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
                </>
              )}
              {!isMobile && (
                <button
                  onClick={() => setShowPay(true)}
                  disabled={!invoice?.lines?.length}
                  style={btnPrimary}
                >
                  Cobrar
                </button>
              )}
            </div>
          )}
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
            setModifierProduct(null);
            await addProductWithModifiers(current, modifiers, lineNotes);
          }}
        />
      )}
    </div>
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
