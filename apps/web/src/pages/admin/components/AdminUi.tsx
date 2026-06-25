import type { ReactNode } from "react";

export const adminStyles = {
  page: { maxWidth: 960 } as const,
  sidebar: {
    width: 220,
    flexShrink: 0,
    borderRight: "1px solid var(--t-border)",
    paddingRight: 16,
  } as const,
  navBtn: (active: boolean) =>
    ({
      display: "block",
      width: "100%",
      textAlign: "left" as const,
      padding: "10px 12px",
      marginBottom: 4,
      borderRadius: 10,
      border: "none",
      cursor: "pointer",
      background: active ? "var(--t-accent-soft)" : "transparent",
      color: active ? "#60a5fa" : "var(--t-muted)",
      fontWeight: active ? 600 : 400,
      fontSize: 13,
    }) as const,
  navDesc: { fontSize: 11, color: "var(--t-muted)", marginTop: 2 } as const,
  section: {
    background: "var(--t-card)",
    border: "1px solid var(--t-border)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  } as const,
  sectionTitle: { margin: "0 0 4px", fontSize: 17, color: "var(--t-fg)" } as const,
  sectionDesc: { margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)", lineHeight: 1.5 } as const,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const,
  field: { marginBottom: 12 } as const,
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--t-muted)", marginBottom: 4 } as const,
  hint: { fontSize: 11, color: "var(--t-muted)", marginTop: 4 } as const,
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--t-border-strong)",
    fontSize: 14,
    boxSizing: "border-box" as const,
    background: "var(--t-input-bg)",
    color: "var(--t-input-fg)",
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--t-border-strong)",
    fontSize: 14,
    background: "var(--t-select-bg)",
    color: "var(--t-select-fg)",
  },
  btnPrimary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  } as const,
  btnSecondary: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid var(--t-border-strong)",
    background: "var(--t-card)",
    color: "var(--t-fg)",
    cursor: "pointer",
    fontSize: 13,
  } as const,
  btnDanger: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--t-danger-soft)",
    color: "#f87171",
    cursor: "pointer",
    fontSize: 12,
  } as const,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13, color: "var(--t-fg)" },
  th: {
    textAlign: "left" as const,
    padding: "10px 8px",
    borderBottom: "2px solid var(--t-border)",
    color: "var(--t-muted)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
  },
  td: { padding: "10px 8px", borderBottom: "1px solid var(--t-border)", verticalAlign: "middle" as const },
};

export function AdminPageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, color: "var(--t-fg)" }}>{title}</h2>
        {desc && <p style={{ margin: "6px 0 0", color: "var(--t-muted)", fontSize: 14 }}>{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function AdminSection({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section style={adminStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: desc ? 8 : 16 }}>
        <h3 style={adminStyles.sectionTitle}>{title}</h3>
        {actions}
      </div>
      {desc && <p style={adminStyles.sectionDesc}>{desc}</p>}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={adminStyles.field}>
      <label style={adminStyles.label}>{label}</label>
      {children}
      {hint && <div style={adminStyles.hint}>{hint}</div>}
    </div>
  );
}

export function Badge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: ok ? "var(--t-success-soft)" : "var(--t-warn-soft)",
        color: ok ? "#4ade80" : "#fbbf24",
      }}
    >
      {label ?? (ok ? "OK" : "Pendiente")}
    </span>
  );
}

export function IdChip({ id }: { id: string }) {
  return (
    <code style={{ fontSize: 11, color: "var(--t-muted)", background: "var(--t-code-bg)", padding: "2px 6px", borderRadius: 4 }}>
      {id.slice(0, 8)}…
    </code>
  );
}

export function AdminToast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  if (!msg) return null;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        marginBottom: 16,
        padding: 12,
        borderRadius: 10,
        background: type === "ok" ? "var(--t-success-soft)" : "var(--t-danger-soft)",
        color: type === "ok" ? "#4ade80" : "#f87171",
        fontSize: 14,
      }}
    >
      {type === "ok" ? "✓" : "✕"} {msg}
    </div>
  );
}

export function AdminModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--t-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--t-card)",
          color: "var(--t-fg)",
          borderRadius: 14,
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: `0 20px 50px var(--t-shadow)`,
          border: "1px solid var(--t-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--t-border)", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "var(--t-fg)" }}>
            ×
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div style={{ padding: "12px 20px", borderTop: "1px solid var(--t-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p style={{ color: "var(--t-muted)", fontSize: 14, textAlign: "center", padding: 24 }}>{text}</p>;
}

export function LoadingState({ text = "Cargando…" }: { text?: string }) {
  return <p style={{ color: "var(--t-muted)", fontSize: 14, padding: 24 }}>{text}</p>;
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <p style={{ color: "#f87171", fontSize: 14, marginBottom: 12 }}>{text}</p>
      {onRetry && (
        <button type="button" style={adminStyles.btnSecondary} onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function AdminViewGate({
  loading,
  error,
  onRetry,
  children,
  loadingText,
}: {
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  children: ReactNode;
  loadingText?: string;
}) {
  if (loading) return <LoadingState text={loadingText} />;
  if (error) return <ErrorState text={error} onRetry={onRetry} />;
  return <>{children}</>;
}

export function ReloadButton({ onClick, label = "Actualizar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" style={adminStyles.btnSecondary} onClick={onClick}>
      {label}
    </button>
  );
}

export function ModalFooter({
  onCancel,
  onSave,
  saveLabel = "Guardar",
  saving,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <button type="button" style={adminStyles.btnSecondary} onClick={onCancel}>
        Cancelar
      </button>
      <button type="button" style={adminStyles.btnPrimary} onClick={onSave} disabled={disabled || saving}>
        {saving ? "Guardando…" : saveLabel}
      </button>
    </>
  );
}

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, fontSize: 14, cursor: "pointer", color: "var(--t-fg)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        {label}
        {hint && <div style={adminStyles.hint}>{hint}</div>}
      </span>
    </label>
  );
}
