import { api } from "./api";

export type PinVerifyType = "admin" | "waiter";

export type WaiterIdentity = {
  kind: "staff" | "user";
  id: string;
  name: string;
  role?: string;
};

export async function verifyPin(pin: string, type: PinVerifyType): Promise<WaiterIdentity | null> {
  const res = await api.post("/v1/kiosk/verify-pin", { pin, type });
  if (type === "admin") return null;
  const data = res.data;
  if (!data?.ok || data.type !== "waiter") return null;
  return {
    kind: data.kind,
    id: data.id,
    name: data.name,
    role: data.role,
  };
}
