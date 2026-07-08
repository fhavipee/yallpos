export const PHYSICAL_LOCATOR_MAX = 999;
export const AUTO_ORDER_CODE_START = 1000;

export function parsePickupCodeNumber(code?: string | null): number | null {
  if (!code) return null;
  const n = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function isPhysicalLocator(code?: string | null): boolean {
  const n = parsePickupCodeNumber(code);
  return n != null && n >= 1 && n <= PHYSICAL_LOCATOR_MAX;
}

export function isAutoOrderCode(code?: string | null): boolean {
  const n = parsePickupCodeNumber(code);
  return n != null && n >= AUTO_ORDER_CODE_START;
}

export function formatPickupDisplay(code?: string | null): string {
  if (!code) return "—";
  if (isPhysicalLocator(code)) return `#${code.padStart(3, "0")}`;
  return `#${code}`;
}

export function formatPickupLabel(code?: string | null): string {
  if (!code) return "Sin número";
  if (isPhysicalLocator(code)) return `Localizador #${code.padStart(3, "0")}`;
  return `Pedido #${code}`;
}

/** Para TTS: separar dígitos solo en localizadores cortos. */
export function formatPickupSpeech(code?: string | null): string {
  if (!code) return "sin numero";
  if (isPhysicalLocator(code)) return code.padStart(3, "0").split("").join(" ");
  return code.split("").join(" ");
}
