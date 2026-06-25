import { api } from "./api";
import type { WaiterIdentity } from "./pin";

export type WaiterApiBody = {
  waiterStaffId?: string;
  waiterUserId?: string;
  /** @deprecated alias de waiterStaffId */
  waiterId?: string;
};

export function toWaiterApiBody(identity: WaiterIdentity | null | undefined): WaiterApiBody | null {
  if (!identity) return null;
  if (identity.kind === "staff") {
    return { waiterStaffId: identity.id, waiterId: identity.id };
  }
  return { waiterUserId: identity.id };
}

export async function assignTableWaiter(tableSessionId: string, identity: WaiterIdentity) {
  const body = toWaiterApiBody(identity);
  if (!body) return;
  await api.post(`/v1/restaurant/table-sessions/${tableSessionId}/assign-waiter`, body);
}

export function matchesSessionWaiter(
  session: { waiterId?: string | null; waiterUserId?: string | null },
  identity: WaiterIdentity,
): boolean {
  if (identity.kind === "staff") return session.waiterId === identity.id;
  return session.waiterUserId === identity.id;
}
