import axios from "axios";
import { clearAuth, getStoredAuth } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : "");

export const api = axios.create({
  baseURL: API_BASE,
});

const stored = getStoredAuth();
if (stored) {
  api.defaults.headers.common["Authorization"] = `Bearer ${stored.token}`;
}

export function setBranchId(branchId: string) {
  api.defaults.headers.common["x-branch-id"] = branchId;
}

export function clearBranchId() {
  delete api.defaults.headers.common["x-branch-id"];
}

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
}

export function formatApiError(err: unknown, fallback = "Error inesperado"): string {
  const anyErr = err as { response?: { status?: number; data?: { message?: string | string[] } } };
  const msg = anyErr.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg;
  if (anyErr.response?.status === 403) return "No tienes permiso para esta acción";
  if (anyErr.response?.status === 401) return "Sesión expirada — inicia sesión de nuevo";
  return fallback;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) clearAuth();
    return Promise.reject(err);
  },
);

export function formatCOP(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}
