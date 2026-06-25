import type { WaiterIdentity } from "./pin";

const KEY = "yallpos_active_waiter";

export function getActiveWaiter(): WaiterIdentity | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WaiterIdentity;
  } catch {
    return null;
  }
}

export function setActiveWaiter(identity: WaiterIdentity) {
  localStorage.setItem(KEY, JSON.stringify(identity));
}

export function clearActiveWaiter() {
  localStorage.removeItem(KEY);
}
