import { useState } from "react";
import { api, setAuthToken } from "../lib/api";
import { saveAuth, type AuthUser } from "../lib/auth";
import { ensureWaiterKioskUrl } from "../lib/waiterKiosk";

type Props = { onLogin: (user: AuthUser) => void };

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("admin@restaurantedeyall.co");
  const [password, setPassword] = useState("yall2025");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/v1/auth/login", { email, password });
      saveAuth(res.data.token, res.data.user);
      setAuthToken(res.data.token);
      ensureWaiterKioskUrl(res.data.user);
      onLogin(res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="yall-login-shell">
      <form onSubmit={submit} className="yall-login-form">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#2563eb" }}>YallPos</div>
          <div style={{ color: "var(--t-muted)", fontSize: 14 }}>POS para restaurantes y panaderías</div>
        </div>

        {error && (
          <div style={{ background: "var(--t-danger-soft)", color: "var(--t-danger-fg)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 14, border: "1px solid var(--t-danger-border)" }}>
            {error}
          </div>
        )}

        <label style={labelStyle}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
        </label>

        <button type="submit" disabled={loading} className="yall-touch-btn" style={{
          width: "100%", padding: 14, marginTop: 8, borderRadius: 10, border: "none",
          background: "var(--t-primary)", color: "var(--t-primary-fg)", fontWeight: 700, fontSize: 16, cursor: "pointer",
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? "Entrando…" : "Iniciar sesión"}
        </button>

        <p style={{ fontSize: 12, color: "var(--t-muted)", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
          Admin: admin@restaurantedeyall.co / yall2025<br />
          Mesero (solo Mesas + Comanda): mesero@restaurantedeyall.co / mesero2025
        </p>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, marginBottom: 12, color: "var(--t-fg)" };
const inputStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)",
  background: "var(--t-input-bg)", color: "var(--t-input-fg)",
};
