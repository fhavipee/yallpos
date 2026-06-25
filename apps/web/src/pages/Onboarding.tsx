import { useState } from "react";
import { api } from "../lib/api";

type Step = "business" | "branch" | "fiscal" | "catalog" | "golive" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "business", label: "Negocio" },
  { key: "branch", label: "Sucursal" },
  { key: "fiscal", label: "DIAN" },
  { key: "catalog", label: "Catálogo" },
  { key: "golive", label: "¡A vender!" },
];

export default function Onboarding({ onComplete }: { onComplete?: (branchId: string) => void }) {
  const [step, setStep] = useState<Step>("business");
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [business, setBusiness] = useState({
    tenantName: "Restaurante de Yall", slug: "restaurante-yall", ownerName: "", email: "", password: "",
    companyName: "Restaurante de Yall", nit: "290329032903", dv: "", vertical: "restaurant" as const,
    phone: "", address: "", city: "Medellín",
  });
  const [branch, setBranch] = useState({ branchName: "Restaurante de Yall — Principal", branchType: "restaurant" as const, address: "" });
  const [fiscal, setFiscal] = useState({
    prefix: "YALL", fromNumber: 1, toNumber: 5000,
    validFrom: "2025-01-01", validTo: "2027-12-31",
  });
  const [openingCash, setOpeningCash] = useState("100000");

  async function run(stepFn: () => Promise<any>, next: Step) {
    setLoading(true);
    try {
      const res = await stepFn();
      setResult(res.data);
      const nextCtx = { ...ctx };
      if (res.data.companyId) nextCtx.companyId = res.data.companyId;
      if (res.data.branchId) nextCtx.branchId = res.data.branchId;
      if (res.data.userId) nextCtx.userId = res.data.userId;
      setCtx(nextCtx);
      if (next !== "done") setStep(next);
      else {
        setStep("done");
        if (nextCtx.branchId) onComplete?.(nextCtx.branchId);
      }
    } catch (e: any) {
      alert(e.response?.data?.message ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <h2>Configurar negocio piloto</h2>
      <p style={{ color: "var(--t-muted)", marginBottom: 24 }}>
        Wizard de 5 pasos para poner en marcha una panadería o restaurante en menos de 15 minutos.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{
            flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: 12,
            background: i <= stepIndex ? "#2563eb" : "var(--t-border)",
            color: i <= stepIndex ? "#fff" : "var(--t-muted)",
          }}>
            {s.label}
          </div>
        ))}
      </div>

      {step === "business" && (
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Nombre del negocio" value={business.companyName} onChange={(v) => setBusiness({ ...business, companyName: v, tenantName: v })} />
          <Field label="Slug (URL)" value={business.slug} onChange={(v) => setBusiness({ ...business, slug: v })} placeholder="mi-panaderia" />
          <Field label="NIT" value={business.nit} onChange={(v) => setBusiness({ ...business, nit: v })} />
          <Field label="Tu nombre" value={business.ownerName} onChange={(v) => setBusiness({ ...business, ownerName: v })} />
          <Field label="Email" value={business.email} onChange={(v) => setBusiness({ ...business, email: v })} />
          <Field label="Contraseña" type="password" value={business.password} onChange={(v) => setBusiness({ ...business, password: v })} />
          <label>
            Tipo de negocio
            <select value={business.vertical} onChange={(e) => setBusiness({ ...business, vertical: e.target.value as any })} style={inputStyle}>
              <option value="bakery">Panadería</option>
              <option value="restaurant">Restaurante</option>
              <option value="cafe">Cafetería</option>
            </select>
          </label>
          <button disabled={loading} onClick={() => run(() => api.post("/v1/onboarding/step/business", business), "branch")} style={btnPrimary}>
            Continuar →
          </button>
        </div>
      )}

      {step === "branch" && (
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Nombre sucursal" value={branch.branchName} onChange={(v) => setBranch({ ...branch, branchName: v })} placeholder="Sucursal principal" />
          <Field label="Dirección" value={branch.address} onChange={(v) => setBranch({ ...branch, address: v })} />
          <button disabled={loading} onClick={() => run(
            () => api.post("/v1/onboarding/step/branch", { ...branch, companyId: ctx.companyId, branchType: business.vertical }),
            "fiscal",
          )} style={btnPrimary}>Continuar →</button>
        </div>
      )}

      {step === "fiscal" && (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ fontSize: 14, color: "var(--t-muted)" }}>Resolución DIAN para Documento Equivalente POS</p>
          <Field label="Prefijo" value={fiscal.prefix} onChange={(v) => setFiscal({ ...fiscal, prefix: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Desde" value={String(fiscal.fromNumber)} onChange={(v) => setFiscal({ ...fiscal, fromNumber: Number(v) })} />
            <Field label="Hasta" value={String(fiscal.toNumber)} onChange={(v) => setFiscal({ ...fiscal, toNumber: Number(v) })} />
          </div>
          <button disabled={loading} onClick={() => run(
            () => api.post("/v1/onboarding/step/fiscal", { ...fiscal, companyId: ctx.companyId }),
            "catalog",
          )} style={btnPrimary}>Continuar →</button>
        </div>
      )}

      {step === "catalog" && (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ fontSize: 14 }}>Se cargará un catálogo inicial para <strong>{business.vertical}</strong> con precios de referencia (editables después).</p>
          <button disabled={loading} onClick={() => run(
            () => api.post("/v1/onboarding/step/catalog", { branchId: ctx.branchId, template: business.vertical }),
            "golive",
          )} style={btnPrimary}>Cargar catálogo →</button>
        </div>
      )}

      {step === "golive" && (
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Efectivo inicial en caja" value={openingCash} onChange={setOpeningCash} />
          <button disabled={loading} onClick={() => run(
            () => api.post("/v1/onboarding/step/golive", { branchId: ctx.branchId, openingCash: Number(openingCash), userId: ctx.userId }),
            "done",
          )} style={btnPrimary}>¡Abrir caja y empezar! 🚀</button>
        </div>
      )}

      {step === "done" && result && (
        <div style={{ padding: 20, background: "var(--t-success-soft)", borderRadius: 12, border: "1px solid #86efac" }}>
          <h3 style={{ margin: "0 0 8px", color: "var(--t-success-fg)" }}>✅ {result.message}</h3>
          <p style={{ fontSize: 14 }}>Sucursal configurada y lista para vender.</p>
          <button
            onClick={() => onComplete?.(ctx.branchId)}
            style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", fontWeight: 600, cursor: "pointer", marginTop: 12 }}
          >
            Ir al mostrador →
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", fontSize: 14 };
const btnPrimary: React.CSSProperties = { padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", fontWeight: 600, cursor: "pointer", marginTop: 8 };
