#!/usr/bin/env node
/**
 * Simula impresoras térmicas ESC/POS en TCP (desarrollo sin hardware).
 *
 *   node scripts/mock-printers.js
 *
 * Escucha:
 *   :9100 — caja (tiquetes, reporte X)
 *   :9102 — cocina (comandas)
 */
const net = require("net");

const PORTS = [
  { port: Number(process.env.MOCK_CASH_PORT || 9100), label: "caja" },
  { port: Number(process.env.MOCK_KITCHEN_PORT || 9102), label: "cocina" },
];

let totalBytes = 0;
let totalJobs = 0;

function startMockPrinter(port, label) {
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (buf) => chunks.push(buf));
    socket.on("end", () => {
      const bytes = Buffer.concat(chunks).length;
      totalBytes += bytes;
      totalJobs += 1;
      const time = new Date().toLocaleTimeString("es-CO");
      console.log(`[${time}] 🖨️  ${label} :${port} — ${bytes} bytes (job #${totalJobs})`);
    });
    socket.on("error", () => {});
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Mock impresora ${label} → 127.0.0.1:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Puerto ${port} (${label}) en uso — ¿ya corre mock-printers?`);
    } else {
      console.error(err.message);
    }
  });
}

console.log("YallPos — Mock impresoras térmicas (Ctrl+C para salir)\n");
for (const { port, label } of PORTS) {
  startMockPrinter(port, label);
}
