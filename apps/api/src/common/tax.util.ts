export type LineTaxAmounts = {
  lineSubtotal: number;
  lineConsumptionTax: number;
  lineTax: number;
  lineTotal: number;
};

/** Precio de menú con impuestos incluidos (Colombia): INC sobre base, IVA sobre base+INC. */
export function calcLineAmountsFromRates(
  grossAmount: number,
  ivaRate: number,
  consumptionRate: number,
): LineTaxAmounts {
  const lineTotal = roundCop(grossAmount);

  if (ivaRate <= 0 && consumptionRate <= 0) {
    return { lineSubtotal: lineTotal, lineConsumptionTax: 0, lineTax: 0, lineTotal };
  }

  const divisor = (1 + consumptionRate) * (1 + ivaRate);
  const lineSubtotal = roundCop(lineTotal / divisor);
  const lineConsumptionTax = consumptionRate > 0 ? roundCop(lineSubtotal * consumptionRate) : 0;
  const lineTax = lineTotal - lineSubtotal - lineConsumptionTax;

  return { lineSubtotal, lineConsumptionTax, lineTax, lineTotal };
}

export type TaxBreakdownEntry = {
  label: string;
  base: number;
  tax: number;
};

export function aggregateTaxBreakdown(
  lines: {
    consumptionTaxCode: string;
    ivaTaxCode: string;
    lineSubtotal: number | string | { toString(): string };
    lineTax: number | string | { toString(): string };
    lineConsumptionTax: number | string | { toString(): string };
  }[],
  labelFor: (code: string, kind: "iva" | "consumption") => string,
): TaxBreakdownEntry[] {
  const incMap = new Map<string, { base: number; tax: number }>();
  const ivaMap = new Map<string, { base: number; tax: number }>();

  for (const line of lines) {
    const base = Number(line.lineSubtotal);
    const iva = Number(line.lineTax);
    const inc = Number(line.lineConsumptionTax);

    if (inc > 0) {
      const current = incMap.get(line.consumptionTaxCode) ?? { base: 0, tax: 0 };
      current.base += base;
      current.tax += inc;
      incMap.set(line.consumptionTaxCode, current);
    }

    if (iva > 0) {
      const current = ivaMap.get(line.ivaTaxCode) ?? { base: 0, tax: 0 };
      current.base += base;
      current.tax += iva;
      ivaMap.set(line.ivaTaxCode, current);
    }
  }

  const rows: TaxBreakdownEntry[] = [];

  for (const [code, amounts] of incMap.entries()) {
    if (amounts.tax > 0) {
      rows.push({
        label: labelFor(code, "consumption"),
        base: roundCop(amounts.base),
        tax: roundCop(amounts.tax),
      });
    }
  }

  for (const [code, amounts] of ivaMap.entries()) {
    if (amounts.tax > 0) {
      rows.push({
        label: labelFor(code, "iva"),
        base: roundCop(amounts.base),
        tax: roundCop(amounts.tax),
      });
    }
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function roundCop(amount: number): number {
  return Math.round(amount);
}
