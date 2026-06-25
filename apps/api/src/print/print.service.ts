import { Injectable, Logger } from "@nestjs/common";
import * as net from "net";
import { ReceiptService } from "./receipt.service";
import { buildEscPosReceipt } from "./escpos.encoder";

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(private receipts: ReceiptService) {}

  /** Envía bytes ESC/POS directo a impresora de red (puerto 9100) */
  async printToNetworkPrinter(branchId: string, invoiceId: string, printerIp?: string): Promise<{ ok: boolean; method: string }> {
    const ip = printerIp ?? process.env.FISCAL_PRINTER_IP ?? process.env.PRINTER_IP;
    if (!ip) {
      return { ok: false, method: "no_printer_configured" };
    }

    const data = await this.receipts.getReceiptData(branchId, invoiceId);
    const buf = buildEscPosReceipt(data);

    await this.sendTcp(ip, 9100, buf);
    await this.receipts.incrementPrintCount(invoiceId);
    this.logger.log(`Tiquete impreso en ${ip}:9100 (${buf.length} bytes)`);
    return { ok: true, method: `network:${ip}:9100` };
  }

  private sendTcp(host: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, host, () => {
        socket.write(data, (err) => {
          socket.end();
          if (err) reject(err);
          else resolve();
        });
      });
      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error(`Timeout conectando a impresora ${host}:${port}`));
      });
    });
  }
}
