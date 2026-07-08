import { BadRequestException } from "@nestjs/common";

/** Localizador físico entregado al cliente (mostrador). */
export const PHYSICAL_LOCATOR_MIN = 1;
export const PHYSICAL_LOCATOR_MAX = 999;

/** Consecutivo interno cuando no hay localizador físico. */
export const AUTO_ORDER_CODE_START = 1000;
export const AUTO_ORDER_CODE_MAX = 9999;

export function parsePickupCodeNumber(code: string | null | undefined): number | null {
  if (!code) return null;
  const n = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function isPhysicalLocatorCode(code: string | null | undefined): boolean {
  const n = parsePickupCodeNumber(code);
  return n != null && n >= PHYSICAL_LOCATOR_MIN && n <= PHYSICAL_LOCATOR_MAX;
}

export function isAutoOrderCode(code: string | null | undefined): boolean {
  const n = parsePickupCodeNumber(code);
  return n != null && n >= AUTO_ORDER_CODE_START;
}

export function normalizePhysicalLocatorCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    throw new BadRequestException("El localizador debe ser un número (1–999)");
  }
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < PHYSICAL_LOCATOR_MIN || n > PHYSICAL_LOCATOR_MAX) {
    throw new BadRequestException("El localizador físico debe estar entre 1 y 999");
  }
  if (n >= AUTO_ORDER_CODE_START) {
    throw new BadRequestException("Los números desde 1000 son consecutivos de pedido; use 1–999 para localizador");
  }
  return String(n).padStart(3, "0");
}

export function formatPickupReferenceLabel(code: string | null | undefined): string {
  if (!code) return "Sin número";
  if (isPhysicalLocatorCode(code)) {
    return `Localizador #${code.padStart(3, "0")}`;
  }
  return `Pedido #${code}`;
}
