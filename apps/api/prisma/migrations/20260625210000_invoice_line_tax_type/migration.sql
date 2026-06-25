-- Snapshot del tipo de impuesto en cada línea de venta
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "taxType" "TaxType" NOT NULL DEFAULT 'iva_19';
