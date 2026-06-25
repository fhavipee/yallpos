-- Impuesto al consumo (Impoconsumo) — restaurantes Colombia
CREATE TYPE "ConsumptionTaxType" AS ENUM ('none', 'inc_8', 'inc_4', 'inc_16');

ALTER TABLE "Product" ADD COLUMN "consumptionTaxType" "ConsumptionTaxType" NOT NULL DEFAULT 'none';

ALTER TABLE "SalesInvoiceLine" ADD COLUMN "consumptionTaxType" "ConsumptionTaxType" NOT NULL DEFAULT 'none';
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "lineConsumptionTax" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "SalesInvoice" ADD COLUMN "consumptionTax" DECIMAL(65,30) NOT NULL DEFAULT 0;
