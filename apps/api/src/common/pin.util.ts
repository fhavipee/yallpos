import { createHash, randomBytes, timingSafeEqual } from "crypto";

const PIN_RE = /^\d{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_RE.test(pin);
}

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${s}:${pin}`).digest("hex");
  return { hash, salt: s };
}

export function formatPinHash(pin: string): string {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN_INVALID");
  }
  const { hash, salt } = hashPin(pin);
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !isValidPinFormat(pin)) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const { hash: computed } = hashPin(pin, salt);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function verifyPinPlaintext(pin: string, plaintext: string | null | undefined): boolean {
  if (!plaintext || !isValidPinFormat(pin)) return false;
  try {
    return timingSafeEqual(Buffer.from(pin), Buffer.from(plaintext.trim()));
  } catch {
    return false;
  }
}

export type KioskSettings = {
  adminPinHash?: string;
  waiterExitPin?: string;
};

export function kioskHasAdminPin(kiosk: KioskSettings | undefined): boolean {
  if (!kiosk) return false;
  return Boolean(kiosk.adminPinHash?.trim() || kiosk.waiterExitPin?.trim());
}

export function verifyAdminPin(pin: string, kiosk: KioskSettings | undefined): boolean {
  if (!kiosk) return false;
  if (kiosk.adminPinHash && verifyPin(pin, kiosk.adminPinHash)) return true;
  if (kiosk.waiterExitPin && verifyPinPlaintext(pin, kiosk.waiterExitPin)) return true;
  return false;
}

export function mergeKioskPinUpdate(
  current: KioskSettings | undefined,
  input: { adminPin?: string; waiterExitPin?: string },
): KioskSettings {
  const next: KioskSettings = { ...(current ?? {}) };
  const raw = (input.adminPin ?? input.waiterExitPin)?.trim();
  if (raw) {
    next.adminPinHash = formatPinHash(raw);
  }
  delete next.waiterExitPin;
  return next;
}

export function sanitizeKioskForClient(kiosk: KioskSettings | undefined) {
  if (!kiosk) return { hasAdminPin: false };
  const { adminPinHash: _a, waiterExitPin: _w, ...rest } = kiosk;
  return { ...rest, hasAdminPin: kioskHasAdminPin(kiosk) };
}
