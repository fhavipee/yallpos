import { generateSecret, generateSync, generateURI, verifySync } from "otplib";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildTotpKeyUri(params: {
  email: string;
  issuer?: string;
  secret: string;
}): string {
  return generateURI({
    issuer: params.issuer ?? "YallPos",
    label: params.email,
    secret: params.secret,
  });
}

export function verifyTotpCode(code: string, secret: string | null | undefined): boolean {
  if (!secret || !/^\d{6}$/.test(code.trim())) return false;
  try {
    const result = verifySync({ token: code.trim(), secret });
    return Boolean(result && (result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
}

/** Solo para tests / setup preview */
export function currentTotpCode(secret: string): string {
  return generateSync({ secret });
}
