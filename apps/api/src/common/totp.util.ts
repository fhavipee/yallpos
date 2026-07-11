import { generateSecret, generateSync, verifySync } from "otplib";

/** Ventana ±2 periodos (≈±60s) por desfase de reloj del servidor o del teléfono */
const EPOCH_TOLERANCE = 2;

export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * URI estándar compatible con Google Authenticator / Authy / Microsoft Authenticator.
 * Incluye algorithm, digits y period explícitos.
 */
export function buildTotpKeyUri(params: {
  email: string;
  issuer?: string;
  secret: string;
}): string {
  const issuer = params.issuer ?? "YallPos";
  const label = `${issuer}:${params.email.trim()}`;
  const q = new URLSearchParams({
    secret: params.secret.replace(/\s+/g, "").toUpperCase(),
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${q.toString()}`;
}

export function verifyTotpCode(code: string, secret: string | null | undefined): boolean {
  const token = code.trim().replace(/\s+/g, "");
  const normalizedSecret = secret?.replace(/\s+/g, "").toUpperCase();
  if (!normalizedSecret || !/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({
      token,
      secret: normalizedSecret,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return Boolean(result && (result as { valid?: boolean }).valid === true);
  } catch {
    return false;
  }
}

/** Solo para tests / setup preview */
export function currentTotpCode(secret: string): string {
  return generateSync({ secret: secret.replace(/\s+/g, "").toUpperCase() });
}
