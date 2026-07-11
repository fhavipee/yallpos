import { useEffect, useState } from "react";
import { api, formatCOP } from "../lib/api";

type PaymentMethod = "cash" | "card" | "transfer" | "qr";

export type PaymentDetails = {
  authCode?: string;
  rrn?: string;
  franchise?: string;
  lastFour?: string;
  accountType?: "credit" | "debit";
  installments?: number;
  terminalId?: string;
  merchantId?: string;
  entryMode?: "chip" | "contactless" | "swipe" | "keyed" | "qr" | "manual";
  provider?: string;
  externalTxnId?: string;
  bankName?: string;
  terminalPayload?: Record<string, unknown>;
};

export type PayCustomerPayload = {
  docType: "CC" | "NIT" | "CE" | "PA" | "TI" | "RC" | "DIE";
  docNumber: string;
  dv?: string;
  name: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  department?: string;
};

export type PayConfirmData = {
  payments: {
    method: PaymentMethod;
    amount: string;
    reference?: string;
    details?: PaymentDetails;
  }[];
  tipAmount: string;
  requiresNamedBuyer: boolean;
  customerId?: string;
  customer?: PayCustomerPayload;
  applyLoyaltyDiscount?: boolean;
};

type CustomerHit = {
  id: string;
  docType: string;
  docNumber?: string | null;
  dv?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  loyaltyEnabled?: boolean;
  loyaltyPoints?: number;
  loyaltyTier?: string | null;
  discountPercent?: number | string;
};

type Props = {
  total: number;
  linesTotal?: number;
  invoiceDiscount?: number;
  onOpenDiscount?: () => void;
  onConfirm: (data: PayConfirmData) => void;
  onClose: () => void;
};

const DOC_TYPES = [
  { value: "CC", label: "Cédula (CC)" },
  { value: "NIT", label: "NIT" },
  { value: "CE", label: "Cédula extranjería" },
  { value: "PA", label: "Pasaporte" },
  { value: "TI", label: "Tarjeta identidad" },
  { value: "RC", label: "Registro civil" },
  { value: "DIE", label: "Doc. extranjero" },
] as const;

const emptyForm = (): PayCustomerPayload => ({
  docType: "CC",
  docNumber: "",
  dv: "",
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  department: "",
});

export default function PaymentModal({
  total,
  linesTotal,
  invoiceDiscount = 0,
  onOpenDiscount,
  onConfirm,
  onClose,
}: Props) {
  const [tip, setTip] = useState("");
  const [split, setSplit] = useState(false);
  const [method1, setMethod1] = useState<PaymentMethod>("cash");
  const [method2, setMethod2] = useState<PaymentMethod>("card");
  const [amount1, setAmount1] = useState("");
  const [cashReceived, setCashReceived] = useState(String(total));
  const [giveChange, setGiveChange] = useState(false);
  const [cardDetails, setCardDetails] = useState({
    authCode: "",
    lastFour: "",
    franchise: "VISA",
    accountType: "credit" as "credit" | "debit",
    installments: "1",
    rrn: "",
    terminalId: "",
    provider: "",
  });
  const [transferRef, setTransferRef] = useState("");
  const [transferBank, setTransferBank] = useState("");
  const [qrRef, setQrRef] = useState("");
  const [qrProvider, setQrProvider] = useState("nequi");

  const [namedBuyer, setNamedBuyer] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [form, setForm] = useState<PayCustomerPayload>(emptyForm);
  const [applyLoyalty, setApplyLoyalty] = useState(true);
  const [selectedLoyalty, setSelectedLoyalty] = useState<CustomerHit | null>(null);
  const [searching, setSearching] = useState(false);

  const tipNum = Number(tip) || 0;
  const totalWithTip = total + tipNum;
  const cashReceivedNum = Number(cashReceived) || 0;
  const cashExcess = method1 === "cash" && !split ? Math.max(0, cashReceivedNum - totalWithTip) : 0;
  const tipFromExcess = cashExcess > 0 && !giveChange ? cashExcess : 0;
  const finalTip = tipNum + tipFromExcess;
  const finalCharge = total + finalTip;
  const change = cashExcess > 0 && giveChange ? cashExcess : 0;

  const tipPresets = [0, 0.1, 0.15, 0.2].map((p) => Math.round(total * p));
  const loyaltyPct = Number(selectedLoyalty?.discountPercent ?? 0);

  useEffect(() => {
    if (!namedBuyer || search.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get("/v1/customers", { params: { q: search.trim(), take: 8 } });
        if (!cancelled) setHits(r.data ?? []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, namedBuyer]);

  function pickCustomer(c: CustomerHit) {
    setSelectedId(c.id);
    setSelectedLoyalty(c);
    setForm({
      docType: (c.docType as PayCustomerPayload["docType"]) || "CC",
      docNumber: c.docNumber ?? "",
      dv: c.dv ?? "",
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      department: c.department ?? "",
    });
    setHits([]);
    setSearch(`${c.docType} ${c.docNumber ?? ""} · ${c.name}`);
  }

  function validateBuyer(): string | null {
    if (!namedBuyer) return null;
    if (!form.docNumber.trim()) return "Ingrese el documento del cliente";
    if (!form.name.trim()) return "Ingrese nombre o razón social";
    if (!form.email.trim()) return "Email obligatorio para factura electrónica";
    if (!form.address.trim() || !form.city.trim()) return "Dirección y ciudad obligatorias";
    return null;
  }

  function buildPayExtra(): Pick<
    PayConfirmData,
    "requiresNamedBuyer" | "customerId" | "customer" | "applyLoyaltyDiscount"
  > {
    if (!namedBuyer) {
      return { requiresNamedBuyer: false };
    }
    return {
      requiresNamedBuyer: true,
      customerId: selectedId,
      customer: form,
      applyLoyaltyDiscount: applyLoyalty && loyaltyPct > 0,
    };
  }

  function buildMethodPayment(method: PaymentMethod, amount: string) {
    if (method === "card") {
      return {
        method,
        amount,
        reference: cardDetails.authCode.trim() || undefined,
        details: {
          authCode: cardDetails.authCode.trim(),
          lastFour: cardDetails.lastFour.replace(/\D/g, "").slice(-4) || undefined,
          franchise: cardDetails.franchise,
          accountType: cardDetails.accountType,
          installments: Math.max(1, Number(cardDetails.installments) || 1),
          rrn: cardDetails.rrn.trim() || undefined,
          terminalId: cardDetails.terminalId.trim() || undefined,
          provider: cardDetails.provider.trim() || undefined,
          entryMode: "manual" as const,
        },
      };
    }
    if (method === "transfer") {
      return {
        method,
        amount,
        reference: transferRef.trim(),
        details: {
          bankName: transferBank.trim() || undefined,
          externalTxnId: transferRef.trim() || undefined,
          entryMode: "manual" as const,
        },
      };
    }
    if (method === "qr") {
      return {
        method,
        amount,
        reference: qrRef.trim(),
        details: {
          provider: qrProvider,
          externalTxnId: qrRef.trim() || undefined,
          entryMode: "qr" as const,
        },
      };
    }
    return { method, amount };
  }

  function validateMethod(method: PaymentMethod): string | null {
    if (method === "card" && !cardDetails.authCode.trim()) {
      return "Ingrese el código de autorización del datafono";
    }
    if (method === "transfer" && !transferRef.trim()) {
      return "Ingrese la referencia de la transferencia";
    }
    if (method === "qr" && !qrRef.trim()) {
      return "Ingrese la referencia / ID del pago QR";
    }
    return null;
  }

  function confirmSingle() {
    const err = validateBuyer() || validateMethod(method1);
    if (err) return alert(err);
    if (method1 === "cash") {
      if (cashReceivedNum < totalWithTip) {
        alert("El efectivo recibido no cubre el total");
        return;
      }
      const payAmount = giveChange ? totalWithTip : cashReceivedNum;
      onConfirm({
        payments: [buildMethodPayment(method1, String(payAmount))],
        tipAmount: String(finalTip),
        ...buildPayExtra(),
      });
      return;
    }

    onConfirm({
      payments: [buildMethodPayment(method1, String(totalWithTip))],
      tipAmount: String(tipNum),
      ...buildPayExtra(),
    });
  }

  function confirmSplit() {
    const err = validateBuyer() || validateMethod(method1) || validateMethod(method2);
    if (err) return alert(err);
    const a1 = Number(amount1) || 0;
    const a2 = totalWithTip - a1;
    if (a1 <= 0 || a2 <= 0) return alert("Montos inválidos para pago mixto");
    onConfirm({
      payments: [
        buildMethodPayment(method1, String(a1)),
        buildMethodPayment(method2, String(a2)),
      ],
      tipAmount: tip || "0",
      ...buildPayExtra(),
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{ background: "var(--t-card)", color: "var(--t-fg)", borderRadius: 16, padding: 24, width: 440, maxWidth: "94vw", maxHeight: "92vh", overflow: "auto", border: "1px solid var(--t-border)" }}>
        <h3 style={{ margin: "0 0 8px", color: "var(--t-fg)" }}>Cobrar</h3>
        {invoiceDiscount > 0 && linesTotal != null && (
          <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span>{formatCOP(linesTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
              <span>Descuento</span>
              <span>-{formatCOP(invoiceDiscount)}</span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{formatCOP(total)}</div>
          {onOpenDiscount && (
            <button
              type="button"
              onClick={onOpenDiscount}
              style={{
                flexShrink: 0,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--t-border-strong)",
                background: "var(--t-card-alt)",
                color: "var(--t-fg)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {invoiceDiscount > 0 ? "✏️ Descuento" : "🏷️ Descuento"}
            </button>
          )}
        </div>

        <div style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          border: "1px solid var(--t-border)",
          background: "var(--t-card-alt)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Tipo cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setNamedBuyer(false);
                setSelectedId(undefined);
                setSelectedLoyalty(null);
              }}
              style={clientTypeBtnStyle(!namedBuyer)}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>👤</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Consumidor final</span>
            </button>
            <button
              type="button"
              onClick={() => setNamedBuyer(true)}
              style={clientTypeBtnStyle(namedBuyer)}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>🧾</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Datos cliente</span>
            </button>
          </div>

          {namedBuyer && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <label style={labelStyle}>
                Buscar cliente (doc, nombre, teléfono)
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedId(undefined);
                  }}
                  style={inputStyle}
                  placeholder="Cédula, NIT o nombre…"
                />
              </label>
              {searching && <div style={{ fontSize: 12, color: "var(--t-muted)" }}>Buscando…</div>}
              {hits.length > 0 && (
                <div style={{ border: "1px solid var(--t-border)", borderRadius: 8, maxHeight: 140, overflow: "auto" }}>
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => pickCustomer(h)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                        border: "none", borderBottom: "1px solid var(--t-border)", background: "var(--t-card)",
                        color: "var(--t-fg)", cursor: "pointer", fontSize: 13,
                      }}
                    >
                      <strong>{h.name}</strong>
                      <span style={{ color: "var(--t-muted)" }}> · {h.docType} {h.docNumber}</span>
                      {h.loyaltyEnabled && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--t-success-fg)" }}>
                          Fidelización: {h.loyaltyPoints ?? 0} pts
                          {Number(h.discountPercent) > 0 ? ` · ${h.discountPercent}% dto` : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8 }}>
                <label style={labelStyle}>
                  Tipo doc
                  <select
                    value={form.docType}
                    onChange={(e) => setForm({ ...form, docType: e.target.value as PayCustomerPayload["docType"] })}
                    style={inputStyle}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Número
                  <input
                    value={form.docNumber}
                    onChange={(e) => {
                      setForm({ ...form, docNumber: e.target.value.replace(/\D/g, "") });
                      setSelectedId(undefined);
                    }}
                    style={inputStyle}
                  />
                </label>
              </div>
              {form.docType === "NIT" && (
                <label style={labelStyle}>
                  DV
                  <input
                    value={form.dv ?? ""}
                    onChange={(e) => setForm({ ...form, dv: e.target.value.replace(/\D/g, "").slice(0, 1) })}
                    style={inputStyle}
                    maxLength={1}
                  />
                </label>
              )}
              <label style={labelStyle}>
                Nombre / razón social
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Email (factura electrónica)
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle}
                  type="email"
                />
              </label>
              <label style={labelStyle}>
                Teléfono
                <input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Dirección
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={labelStyle}>
                  Ciudad
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Departamento
                  <input
                    value={form.department ?? ""}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    style={inputStyle}
                  />
                </label>
              </div>

              {selectedLoyalty?.loyaltyEnabled && (
                <div style={{ fontSize: 12, padding: 8, borderRadius: 8, background: "var(--t-success-soft)", color: "var(--t-success-fg)" }}>
                  Cliente fidelizado · {selectedLoyalty.loyaltyPoints ?? 0} pts
                  {selectedLoyalty.loyaltyTier ? ` · ${selectedLoyalty.loyaltyTier}` : ""}
                  {loyaltyPct > 0 && (
                    <label style={{ display: "flex", gap: 8, marginTop: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={applyLoyalty} onChange={(e) => setApplyLoyalty(e.target.checked)} />
                      Aplicar descuento fidelización {loyaltyPct}%
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {tipPresets.map((p, i) => (
            <button
              key={p}
              onClick={() => setTip(String(p))}
              style={{
                flex: 1, padding: 6, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer",
                background: Number(tip) === p ? "var(--t-accent-soft)" : "var(--t-card)",
                color: "var(--t-fg)",
              }}
            >
              {i === 0 ? "Sin propina" : `${[0, 10, 15, 20][i]}%`}
              {p > 0 && <div style={{ fontWeight: 700 }}>{formatCOP(p)}</div>}
            </button>
          ))}
        </div>

        <label style={labelStyle}>
          Propina manual
          <input value={tip} onChange={(e) => setTip(e.target.value)} type="number" style={inputStyle} placeholder="0" />
        </label>

        {(tipNum > 0 || tipFromExcess > 0) && (
          <div style={{ fontSize: 14, color: "var(--t-muted)", marginBottom: 12 }}>
            Propina total: <strong>{formatCOP(finalTip)}</strong>
            {tipFromExcess > 0 && (
              <span style={{ display: "block", fontSize: 12, marginTop: 4, color: "var(--t-success-fg)" }}>
                Incluye {formatCOP(tipFromExcess)} del excedente en efectivo
              </span>
            )}
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14, color: "var(--t-fg)" }}>
          <input type="checkbox" checked={split} onChange={(e) => {
            setSplit(e.target.checked);
            if (e.target.checked) setAmount1(String(Math.round(totalWithTip / 2)));
          }} />
          Pago mixto (dos medios)
        </label>

        {!split ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {(["cash", "card", "transfer", "qr"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod1(m)}
                  style={{
                    padding: 12, borderRadius: 10, border: method1 === m ? "2px solid #2563eb" : "1px solid var(--t-border)",
                    background: method1 === m ? "var(--t-accent-soft)" : "var(--t-card)",
                    color: "var(--t-fg)",
                    cursor: "pointer", fontWeight: method1 === m ? 700 : 400,
                  }}
                >
                  {m === "cash" ? "💵 Efectivo" : m === "card" ? "💳 Tarjeta" : m === "transfer" ? "🏦 Transfer." : "📱 QR"}
                </button>
              ))}
            </div>
            {method1 === "cash" && (
              <>
                <label style={labelStyle}>
                  Recibido
                  <input
                    value={cashReceived}
                    onChange={(e) => {
                      setCashReceived(e.target.value);
                      setGiveChange(false);
                    }}
                    type="number"
                    style={inputStyle}
                  />
                </label>
                {cashExcess > 0 && (
                  <div style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 8,
                    background: giveChange ? "var(--t-card-alt)" : "var(--t-success-soft)",
                    border: `1px solid ${giveChange ? "var(--t-border)" : "var(--t-success-border)"}`,
                    fontSize: 13,
                  }}>
                    {giveChange ? (
                      <span style={{ color: "var(--t-success-fg)" }}>Vuelto: <strong>{formatCOP(change)}</strong></span>
                    ) : (
                      <span>
                        Excedente <strong>{formatCOP(cashExcess)}</strong> → propina
                      </span>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={giveChange}
                        onChange={(e) => setGiveChange(e.target.checked)}
                      />
                      Dar vuelto al cliente
                    </label>
                  </div>
                )}
              </>
            )}
            {method1 === "card" && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid var(--t-border)", background: "var(--t-card-alt)" }}>
                <div style={{ fontSize: 12, color: "var(--t-muted)" }}>Datos del datafono (sin PAN ni CVV)</div>
                <label style={labelStyle}>
                  Código autorización *
                  <input
                    value={cardDetails.authCode}
                    onChange={(e) => setCardDetails({ ...cardDetails, authCode: e.target.value.toUpperCase() })}
                    style={inputStyle}
                    placeholder="Ej. 084512"
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={labelStyle}>
                    Últimos 4
                    <input
                      value={cardDetails.lastFour}
                      onChange={(e) => setCardDetails({ ...cardDetails, lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      style={inputStyle}
                      placeholder="1234"
                      inputMode="numeric"
                    />
                  </label>
                  <label style={labelStyle}>
                    Franquicia
                    <select
                      value={cardDetails.franchise}
                      onChange={(e) => setCardDetails({ ...cardDetails, franchise: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="VISA">Visa</option>
                      <option value="MASTERCARD">Mastercard</option>
                      <option value="AMEX">Amex</option>
                      <option value="DINERS">Diners</option>
                      <option value="OTHER">Otra</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={labelStyle}>
                    Tipo
                    <select
                      value={cardDetails.accountType}
                      onChange={(e) => setCardDetails({ ...cardDetails, accountType: e.target.value as "credit" | "debit" })}
                      style={inputStyle}
                    >
                      <option value="credit">Crédito</option>
                      <option value="debit">Débito</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    Cuotas
                    <input
                      value={cardDetails.installments}
                      onChange={(e) => setCardDetails({ ...cardDetails, installments: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                      style={inputStyle}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={labelStyle}>
                    RRN / voucher
                    <input
                      value={cardDetails.rrn}
                      onChange={(e) => setCardDetails({ ...cardDetails, rrn: e.target.value })}
                      style={inputStyle}
                      placeholder="Opcional"
                    />
                  </label>
                  <label style={labelStyle}>
                    Terminal ID
                    <input
                      value={cardDetails.terminalId}
                      onChange={(e) => setCardDetails({ ...cardDetails, terminalId: e.target.value })}
                      style={inputStyle}
                      placeholder="TID"
                    />
                  </label>
                </div>
                <label style={labelStyle}>
                  Adquirente / proveedor
                  <input
                    value={cardDetails.provider}
                    onChange={(e) => setCardDetails({ ...cardDetails, provider: e.target.value })}
                    style={inputStyle}
                    placeholder="Bold, Redeban, Credibanco…"
                  />
                </label>
              </div>
            )}
            {method1 === "transfer" && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <label style={labelStyle}>
                  Referencia *
                  <input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} style={inputStyle} placeholder="Nº transferencia" />
                </label>
                <label style={labelStyle}>
                  Banco
                  <input value={transferBank} onChange={(e) => setTransferBank(e.target.value)} style={inputStyle} placeholder="Bancolombia, Nequi…" />
                </label>
              </div>
            )}
            {method1 === "qr" && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <label style={labelStyle}>
                  ID / referencia *
                  <input value={qrRef} onChange={(e) => setQrRef(e.target.value)} style={inputStyle} placeholder="ID transacción" />
                </label>
                <label style={labelStyle}>
                  Proveedor
                  <select value={qrProvider} onChange={(e) => setQrProvider(e.target.value)} style={inputStyle}>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="bancolombia">Bancolombia</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={method1} onChange={(e) => setMethod1(e.target.value as PaymentMethod)} style={inputStyle}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="qr">QR</option>
              </select>
              <input value={amount1} onChange={(e) => setAmount1(e.target.value)} type="number" style={inputStyle} placeholder="Monto 1" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={method2} onChange={(e) => setMethod2(e.target.value as PaymentMethod)} style={inputStyle}>
                <option value="card">Tarjeta</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="qr">QR</option>
              </select>
              <input
                value={amount1 ? String(totalWithTip - Number(amount1)) : ""}
                readOnly
                style={{ ...inputStyle, background: "var(--t-card-alt)" }}
                placeholder="Monto 2"
              />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 10, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)", cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            onClick={split ? confirmSplit : confirmSingle}
            style={{ flex: 1, padding: 14, borderRadius: 10, border: "none", background: "var(--t-green-fg)", color: "var(--t-primary-fg)", fontWeight: 700, cursor: "pointer" }}
          >
            Cobrar {formatCOP(method1 === "cash" && !split && !giveChange && cashExcess > 0 ? finalCharge : totalWithTip)}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, marginBottom: 0, color: "var(--t-fg)" };
const inputStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", flex: 1,
  background: "var(--t-input-bg)", color: "var(--t-input-fg)",
};

function clientTypeBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "14px 10px",
    borderRadius: 10,
    border: active ? "2px solid #2563eb" : "1px solid var(--t-border)",
    background: active ? "var(--t-accent-soft)" : "var(--t-card)",
    color: "var(--t-fg)",
    cursor: "pointer",
    minHeight: 88,
  };
}
