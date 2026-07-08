import { useState } from "react";
import { formatCOP } from "../lib/api";

type DiscountKind = "percent" | "amount";

type Props = {
  baseTotal: number;
  currentDiscount?: number;
  title?: string;
  onApply: (data: { kind: DiscountKind; value: string; reason?: string }, approvalPin?: string) => Promise<boolean | void>;
  onClear: () => Promise<void>;
  onClose: () => void;
};

export default function InvoiceDiscountModal({
  baseTotal,
  currentDiscount = 0,
  title = "Descuento en la cuenta",
  onApply,
  onClear,
  onClose,
}: Props) {
  const [kind, setKind] = useState<DiscountKind>("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const presets = [5, 10, 15, 20];

  async function submit() {
    if (!value.trim()) {
      alert(kind === "percent" ? "Indica el porcentaje" : "Indica el monto");
      return;
    }
    setBusy(true);
    try {
      const done = await onApply({ kind, value: value.trim(), reason: reason.trim() || undefined });
      if (done === false) return;
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo aplicar el descuento");
    } finally {
      setBusy(false);
    }
  }

  async function clearDiscount() {
    setBusy(true);
    try {
      await onClear();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo quitar el descuento");
    } finally {
      setBusy(false);
    }
  }

  const previewValue = kind === "percent"
    ? Math.round(baseTotal * (Number(value) || 0) / 100)
    : Number(value) || 0;
  const previewTotal = Math.max(0, baseTotal - Math.min(previewValue, baseTotal));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 110,
    }}>
      <div style={{
        background: "var(--t-card)", color: "var(--t-fg)", borderRadius: 16, padding: 24,
        width: 380, maxWidth: "92vw", border: "1px solid var(--t-border)",
      }}>
        <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)" }}>
          Base: {formatCOP(baseTotal)}
          {currentDiscount > 0 ? ` · Descuento actual: ${formatCOP(currentDiscount)}` : ""}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setKind("percent")}
            style={tabStyle(kind === "percent")}
          >
            Porcentaje
          </button>
          <button
            type="button"
            onClick={() => setKind("amount")}
            style={tabStyle(kind === "amount")}
          >
            Monto fijo
          </button>
        </div>

        {kind === "percent" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {presets.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setValue(String(pct))}
                style={{
                  flex: "1 1 70px",
                  padding: "8px 6px",
                  borderRadius: 8,
                  border: Number(value) === pct ? "2px solid #2563eb" : "1px solid var(--t-border)",
                  background: Number(value) === pct ? "var(--t-accent-soft)" : "var(--t-card)",
                  cursor: "pointer",
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        <label style={labelStyle}>
          {kind === "percent" ? "Porcentaje (%)" : "Monto en pesos"}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            min={0}
            max={kind === "percent" ? 100 : undefined}
            style={inputStyle}
            placeholder={kind === "percent" ? "10" : "5000"}
          />
        </label>

        <label style={labelStyle}>
          Motivo (opcional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
            placeholder="Ej. cliente frecuente, promoción"
          />
        </label>

        {value.trim() && (
          <div style={{ fontSize: 13, marginBottom: 12, color: "var(--t-muted)" }}>
            Total con descuento: <strong style={{ color: "var(--t-fg)" }}>{formatCOP(previewTotal)}</strong>
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            style={{
              padding: 14, borderRadius: 10, border: "none", background: "var(--t-green-fg)",
              color: "var(--t-primary-fg)", fontWeight: 700, cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Aplicando…" : "Aplicar descuento"}
          </button>
          {currentDiscount > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={clearDiscount}
              style={{
                padding: 12, borderRadius: 10, border: "1px solid var(--t-border-strong)",
                background: "var(--t-card)", cursor: busy ? "wait" : "pointer",
              }}
            >
              Quitar descuento
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: 12, borderRadius: 10, border: "1px solid var(--t-border-strong)",
              background: "var(--t-card)", cursor: busy ? "wait" : "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: 12,
    borderRadius: 10,
    border: active ? "2px solid #2563eb" : "1px solid var(--t-border)",
    background: active ? "var(--t-accent-soft)" : "var(--t-card)",
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
  };
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 14,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--t-border-strong)",
  background: "var(--t-input-bg)",
  color: "var(--t-input-fg)",
};
