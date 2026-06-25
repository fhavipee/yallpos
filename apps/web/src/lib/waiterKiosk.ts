export const WAITER_KIOSK_VIEW = "waiter";
export const DEFAULT_WAITER_EXIT_PIN = "2025";

export function isWaiterKioskView(): boolean {
  return new URLSearchParams(window.location.search).get("view") === WAITER_KIOSK_VIEW;
}

export function isWaiterUser(user?: { role?: string } | null): boolean {
  return user?.role === "waiter";
}

export function shouldUseWaiterKiosk(user?: { role?: string } | null): boolean {
  return isWaiterKioskView() || isWaiterUser(user);
}

export function waiterKioskUrl(origin = window.location.origin): string {
  return `${origin}/?view=${WAITER_KIOSK_VIEW}`;
}

export function exitWaiterKiosk() {
  const url = new URL(window.location.href);
  url.searchParams.delete("view");
  window.location.href = url.pathname + url.search;
}

export function ensureWaiterKioskUrl(user?: { role?: string } | null) {
  if (isWaiterUser(user) && !isWaiterKioskView()) {
    window.location.replace(waiterKioskUrl());
  }
}
