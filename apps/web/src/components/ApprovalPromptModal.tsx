import { useEffect, useRef, useState } from "react";

export type ApprovalMethod = "pin" | "totp";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  /** method + code (PIN 4-6 o TOTP 6) */
  onSubmit: (payload: { approvalPin?: string; approvalTotp?: string }) => void | Promise<void>;
  error?: string | null;
  busy?: boolean;
  /** Por defecto permite ambas */
  allowTotp?: boolean;
};

export default function ApprovalPromptModal({
  open,
  title,
  description,
  confirmLabel = "Autorizar",
  onCancel,
  onSubmit,
  error,
  busy,
  allowTotp = true,
}: Props) {
  const [method, setMethod] = useState<ApprovalMethod>("pin");
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setCode("");
      setMethod("pin");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, method]);

  if (!open) return null;

  const minLen = method === "pin" ? 4 : 6;
  const maxLen = method === "pin" ? 6 : 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < minLen || busy) return;
    if (method === "pin") {
      await onSubmit({ approvalPin: code });
    } else {
      await onSubmit({ approvalTotp: code });
    }
  }

  return (
    <div className="yall-pin-modal" onClick={onCancel} role="presentation">
      <form
        className="yall-pin-modal__panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className="yall-pin-modal__title">{title}</h3>
        {description && <p className="yall-pin-modal__desc">{description}</p>}

        {allowTotp && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => { setMethod("pin"); setCode(""); }}
              style={tabStyle(method === "pin")}
            >
              PIN gerente
            </button>
            <button
              type="button"
              onClick={() => { setMethod("totp"); setCode(""); }}
              style={tabStyle(method === "totp")}
            >
              Autenticador
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          className="yall-pin-modal__input"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={maxLen}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, maxLen))}
          placeholder={method === "pin" ? "••••" : "000000"}
          aria-label={method === "pin" ? "PIN" : "Código autenticador"}
        />
        <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "8px 0 0" }}>
          {method === "pin"
            ? "PIN de gerente, dueño o administrador kiosk (4–6 dígitos)"
            : "Código de 6 dígitos de Google Authenticator / Authy"}
        </p>
        {error && <p className="yall-pin-modal__error">{error}</p>}
        <div className="yall-pin-modal__actions">
          <button type="button" className="yall-pin-modal__btn yall-pin-modal__btn--ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="yall-pin-modal__btn yall-pin-modal__btn--primary"
            disabled={busy || code.length < minLen}
          >
            {busy ? "Verificando…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 8,
    border: active ? "2px solid #2563eb" : "1px solid var(--t-border)",
    background: active ? "var(--t-accent-soft)" : "var(--t-card)",
    color: "var(--t-fg)",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
  };
}
