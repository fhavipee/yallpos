#!/usr/bin/env node
/**
 * YallPos Print Agent — puente local para impresoras térmicas USB/Red.
 *
 * Impresora caja (tiquetes, reporte X):
 *   PRINTER_IP=192.168.1.100 node index.js
 *
 * Segunda impresora cocina:
 *   PRINTER_IP=192.168.1.100 KITCHEN_PRINTER_IP=192.168.1.101 node index.js
 *
 * El POS web envía POST http://localhost:9101/print con:
 *   { base64: "...", target: "cash" | "kitchen" }
 */
const http = require("http");
const net = require("net");

const AGENT_PORT = Number(process.env.PRINT_AGENT_PORT || 9101);
const CASH_IP = process.env.PRINTER_IP || "127.0.0.1";
const CASH_PORT = Number(process.env.PRINTER_PORT || 9100);
const KITCHEN_IP = process.env.KITCHEN_PRINTER_IP || CASH_IP;
const KITCHEN_PORT = Number(process.env.KITCHEN_PRINTER_PORT || 9100);

function resolvePrinter({ target, printerIp, printerPort }) {
  if (printerIp) {
    return { ip: printerIp, port: printerPort ? Number(printerPort) : 9100 };
  }
  if (target === "kitchen") {
    return { ip: KITCHEN_IP, port: KITCHEN_PORT };
  }
  return { ip: CASH_IP, port: CASH_PORT };
}

function sendToPrinter(buffer, { target, printerIp, printerPort }) {
  const { ip, port } = resolvePrinter({ target, printerIp, printerPort });
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, ip, () => {
      socket.write(buffer, (err) => {
        socket.end();
        if (err) reject(err);
        else resolve({ ip, port, target: target || "cash" });
      });
    });
    socket.on("error", reject);
    socket.setTimeout(8000, () => {
      socket.destroy();
      reject(new Error(`Timeout impresora ${ip}:${port}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      cash: `${CASH_IP}:${CASH_PORT}`,
      kitchen: `${KITCHEN_IP}:${KITCHEN_PORT}`,
      dual: KITCHEN_IP !== CASH_IP || KITCHEN_PORT !== CASH_PORT,
    }));
  }

  if (req.method === "POST" && req.url === "/print") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { base64, target, printerIp, printerPort } = payload;
        if (!base64) throw new Error("Falta campo base64");
        const buf = Buffer.from(base64, "base64");
        const sent = await sendToPrinter(buf, { target, printerIp, printerPort });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, bytes: buf.length, ...sent }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(AGENT_PORT, () => {
  console.log(`🖨️  YallPos Print Agent en http://localhost:${AGENT_PORT}`);
  console.log(`   Caja:    ${CASH_IP}:${CASH_PORT}`);
  console.log(`   Cocina:  ${KITCHEN_IP}:${KITCHEN_PORT}${KITCHEN_IP === CASH_IP ? " (misma impresora)" : ""}`);
});
