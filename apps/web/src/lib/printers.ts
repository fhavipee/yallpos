import { api } from "./api";

export type PrinterConfig = {
  cashPrinterIp: string;
  cashPrinterPort: string;
  kitchenPrinterIp: string;
  kitchenPrinterPort: string;
};

const STORAGE_KEY = "yallpos.printers";

const defaults: PrinterConfig = {
  cashPrinterIp: "",
  cashPrinterPort: "9100",
  kitchenPrinterIp: "",
  kitchenPrinterPort: "9100",
};

export function loadPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function savePrinterConfig(config: PrinterConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function fetchPrinterConfig(branchId: string): Promise<PrinterConfig> {
  try {
    const res = await api.get("/v1/settings/branch");
    const remote = res.data?.printers as Partial<PrinterConfig> | undefined;
    if (remote) {
      const merged = { ...defaults, ...remote };
      savePrinterConfig(merged);
      return merged;
    }
  } catch {
    // usar cache local
  }
  return loadPrinterConfig();
}

export async function persistPrinterConfig(branchId: string, config: PrinterConfig) {
  savePrinterConfig(config);
  await api.patch("/v1/settings/branch", { printers: config });
}

export function printerPayload(target: "cash" | "kitchen", config?: PrinterConfig) {
  const cfg = config ?? loadPrinterConfig();
  const ip = target === "kitchen" ? cfg.kitchenPrinterIp : cfg.cashPrinterIp;
  const port = target === "kitchen" ? cfg.kitchenPrinterPort : cfg.cashPrinterPort;
  return {
    target,
    ...(ip ? { printerIp: ip, printerPort: Number(port) || 9100 } : {}),
  };
}
