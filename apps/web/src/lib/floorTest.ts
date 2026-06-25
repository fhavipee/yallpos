import { waiterKioskUrl } from "./waiterKiosk";

export type FloorTestInfo = {
  kioskUrl: string;
  email: string;
  password: string;
  exitPin: string;
  name: string;
};

export const DEFAULT_FLOOR_TEST: FloorTestInfo = {
  kioskUrl: waiterKioskUrl(),
  email: "mesero@restaurantedeyall.co",
  password: "mesero2025",
  exitPin: "2025",
  name: "Mesero Piloto",
};

export async function loadFloorTestInfo(): Promise<FloorTestInfo> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? window.location.origin}/v1/pilot/config`);
    if (!res.ok) return DEFAULT_FLOOR_TEST;
    const cfg = await res.json();
    return {
      kioskUrl: waiterKioskUrl(),
      email: cfg.waiterUser?.email ?? DEFAULT_FLOOR_TEST.email,
      password: cfg.waiterUser?.password ?? DEFAULT_FLOOR_TEST.password,
      name: cfg.waiterUser?.name ?? DEFAULT_FLOOR_TEST.name,
      exitPin: DEFAULT_FLOOR_TEST.exitPin,
    };
  } catch {
    return DEFAULT_FLOOR_TEST;
  }
}

export function floorTestClipboardText(info: FloorTestInfo): string {
  return [
    "YallPos — Prueba en piso (mesero)",
    `URL: ${info.kioskUrl}`,
    `Email: ${info.email}`,
    `Password: ${info.password}`,
    `PIN salida: ${info.exitPin}`,
    "",
    "Flujo: Mesas → abrir mesa → Comanda → producto → Enviar a cocina → Cobrar",
  ].join("\n");
}
