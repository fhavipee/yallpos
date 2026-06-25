type ServiceTimeRow = {
  tableLabel: string;
  waiterName: string;
  readyAt: Date | string;
  servedAt: Date | string;
  waitMinutes: number;
  itemsSummary?: string;
};

type ExportData = {
  date: string;
  branchName: string;
  summary: {
    servedCount: number;
    avgWaitMinutes: number;
    minWaitMinutes: number;
    maxWaitMinutes: number;
  };
  byWaiter: { waiterName: string; count: number; avgWaitMinutes: number }[];
  rows: ServiceTimeRow[];
};

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatTime(value: Date | string) {
  return new Date(value).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function buildTableServiceTimesCsv(data: ExportData): string {
  const lines: string[] = [];
  lines.push("\uFEFFReporte tiempos mesa — cocina lista a servida");
  lines.push(`Sucursal,${csvCell(data.branchName)}`);
  lines.push(`Fecha,${csvCell(data.date)}`);
  lines.push("");
  lines.push("Resumen");
  lines.push(`Entregas,${data.summary.servedCount}`);
  lines.push(`Promedio (min),${data.summary.avgWaitMinutes}`);
  lines.push(`Minimo (min),${data.summary.minWaitMinutes}`);
  lines.push(`Maximo (min),${data.summary.maxWaitMinutes}`);
  lines.push("");
  lines.push("Por mesero");
  lines.push("Mesero,Entregas,Promedio min");
  for (const w of data.byWaiter) {
    lines.push([csvCell(w.waiterName), w.count, w.avgWaitMinutes].join(","));
  }
  lines.push("");
  lines.push("Detalle");
  lines.push("Mesa,Mesero,Lista,Servida,Minutos,Items");
  for (const row of data.rows) {
    lines.push([
      csvCell(row.tableLabel),
      csvCell(row.waiterName),
      csvCell(formatTime(row.readyAt)),
      csvCell(formatTime(row.servedAt)),
      row.waitMinutes,
      csvCell(row.itemsSummary ?? ""),
    ].join(","));
  }
  return lines.join("\r\n");
}

export function buildTableServiceTimesHtml(data: ExportData): string {
  const waiterRows = data.byWaiter
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.waiterName)}</td><td>${w.count}</td><td>${w.avgWaitMinutes} min</td></tr>`,
    )
    .join("");

  const detailRows = data.rows
    .map(
      (row) =>
        `<tr>
          <td>${escapeHtml(row.tableLabel)}</td>
          <td>${escapeHtml(row.waiterName)}</td>
          <td>${formatTime(row.readyAt)}</td>
          <td>${formatTime(row.servedAt)}</td>
          <td style="font-weight:600;color:${row.waitMinutes >= 10 ? "#b91c1c" : "#1d4ed8"}">${row.waitMinutes} min</td>
          <td>${escapeHtml(row.itemsSummary ?? "")}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Tiempos mesa ${escapeHtml(data.date)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { color: #64748b; margin: 0 0 20px; font-size: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi label { display: block; font-size: 11px; color: #64748b; margin-bottom: 4px; }
    .kpi strong { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    h2 { font-size: 15px; margin: 0 0 10px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Tiempos mesa — cocina lista → servida</h1>
  <p>${escapeHtml(data.branchName)} · ${escapeHtml(data.date)}</p>
  <div class="kpis">
    <div class="kpi"><label>Entregas</label><strong>${data.summary.servedCount}</strong></div>
    <div class="kpi"><label>Promedio</label><strong>${data.summary.avgWaitMinutes} min</strong></div>
    <div class="kpi"><label>Mínimo</label><strong>${data.summary.minWaitMinutes} min</strong></div>
    <div class="kpi"><label>Máximo</label><strong>${data.summary.maxWaitMinutes} min</strong></div>
  </div>
  <h2>Por mesero</h2>
  <table>
    <thead><tr><th>Mesero</th><th>Entregas</th><th>Promedio</th></tr></thead>
    <tbody>${waiterRows || "<tr><td colspan='3'>Sin datos</td></tr>"}</tbody>
  </table>
  <h2>Detalle</h2>
  <table>
    <thead><tr><th>Mesa</th><th>Mesero</th><th>Lista</th><th>Servida</th><th>Espera</th><th>Items</th></tr></thead>
    <tbody>${detailRows || "<tr><td colspan='6'>Sin entregas</td></tr>"}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type WeeklyShiftRow = {
  shift: string;
  shiftLabel: string;
  servedCount: number;
  avgWaitMinutes: number;
};

type WeeklyDayRow = {
  date: string;
  servedCount: number;
  avgWaitMinutes: number;
  byShift: WeeklyShiftRow[];
};

export type WeeklyExportData = {
  weekStart: string;
  weekEnd: string;
  branchName: string;
  summary: {
    servedCount: number;
    avgWaitMinutes: number;
    minWaitMinutes: number;
    maxWaitMinutes: number;
  };
  byShift: WeeklyShiftRow[];
  byDay: WeeklyDayRow[];
};

export function buildTableServiceTimesWeeklyCsv(data: WeeklyExportData): string {
  const lines: string[] = [];
  lines.push("\uFEFFReporte semanal tiempos mesa — cocina lista a servida");
  lines.push(`Sucursal,${csvCell(data.branchName)}`);
  lines.push(`Semana,${csvCell(`${data.weekStart} a ${data.weekEnd}`)}`);
  lines.push("");
  lines.push("Resumen semanal");
  lines.push(`Entregas,${data.summary.servedCount}`);
  lines.push(`Promedio (min),${data.summary.avgWaitMinutes}`);
  lines.push(`Minimo (min),${data.summary.minWaitMinutes}`);
  lines.push(`Maximo (min),${data.summary.maxWaitMinutes}`);
  lines.push("");
  lines.push("Por turno");
  lines.push("Turno,Entregas,Promedio min");
  for (const row of data.byShift) {
    lines.push([csvCell(row.shiftLabel), row.servedCount, row.avgWaitMinutes].join(","));
  }
  lines.push("");
  lines.push("Por dia y turno");
  lines.push("Fecha,Turno,Entregas,Promedio min");
  for (const day of data.byDay) {
    for (const shift of day.byShift) {
      lines.push([csvCell(day.date), csvCell(shift.shiftLabel), shift.servedCount, shift.avgWaitMinutes].join(","));
    }
  }
  return lines.join("\r\n");
}

export function buildTableServiceTimesWeeklyHtml(data: WeeklyExportData): string {
  const shiftRows = data.byShift
    .map((row) => `<tr><td>${escapeHtml(row.shiftLabel)}</td><td>${row.servedCount}</td><td>${row.avgWaitMinutes} min</td></tr>`)
    .join("");
  const dayRows = data.byDay
    .flatMap((day) =>
      day.byShift.map(
        (shift) =>
          `<tr><td>${escapeHtml(day.date)}</td><td>${escapeHtml(shift.shiftLabel)}</td><td>${shift.servedCount}</td><td>${shift.avgWaitMinutes} min</td></tr>`,
      ),
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Tiempos mesa semanal ${escapeHtml(data.weekStart)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { color: #64748b; margin: 0 0 20px; font-size: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi label { display: block; font-size: 11px; color: #64748b; margin-bottom: 4px; }
    .kpi strong { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    h2 { font-size: 15px; margin: 0 0 10px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Tiempos mesa — reporte semanal por turno</h1>
  <p>${escapeHtml(data.branchName)} · ${escapeHtml(data.weekStart)} — ${escapeHtml(data.weekEnd)}</p>
  <div class="kpis">
    <div class="kpi"><label>Entregas</label><strong>${data.summary.servedCount}</strong></div>
    <div class="kpi"><label>Promedio</label><strong>${data.summary.avgWaitMinutes} min</strong></div>
    <div class="kpi"><label>Mínimo</label><strong>${data.summary.minWaitMinutes} min</strong></div>
    <div class="kpi"><label>Máximo</label><strong>${data.summary.maxWaitMinutes} min</strong></div>
  </div>
  <h2>Por turno</h2>
  <table>
    <thead><tr><th>Turno</th><th>Entregas</th><th>Promedio</th></tr></thead>
    <tbody>${shiftRows || "<tr><td colspan='3'>Sin datos</td></tr>"}</tbody>
  </table>
  <h2>Por día y turno</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Turno</th><th>Entregas</th><th>Promedio</th></tr></thead>
    <tbody>${dayRows || "<tr><td colspan='4'>Sin datos</td></tr>"}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
