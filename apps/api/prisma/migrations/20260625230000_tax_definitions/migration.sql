-- Impuestos configurables por empresa (IVA + impoconsumo)
CREATE TYPE "TaxKind" AS ENUM ('iva', 'consumption');

CREATE TABLE "TaxDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "TaxKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxDefinition_companyId_code_key" ON "TaxDefinition"("companyId", "code");
CREATE INDEX "TaxDefinition_companyId_kind_isActive_idx" ON "TaxDefinition"("companyId", "kind", "isActive");

ALTER TABLE "TaxDefinition" ADD CONSTRAINT "TaxDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Product: enums → códigos de texto
ALTER TABLE "Product" RENAME COLUMN "taxType" TO "ivaTaxCode";
ALTER TABLE "Product" RENAME COLUMN "consumptionTaxType" TO "consumptionTaxCode";
ALTER TABLE "Product" ALTER COLUMN "ivaTaxCode" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "ivaTaxCode" TYPE TEXT USING "ivaTaxCode"::text;
ALTER TABLE "Product" ALTER COLUMN "ivaTaxCode" SET DEFAULT 'iva_19';
ALTER TABLE "Product" ALTER COLUMN "consumptionTaxCode" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "consumptionTaxCode" TYPE TEXT USING "consumptionTaxCode"::text;
ALTER TABLE "Product" ALTER COLUMN "consumptionTaxCode" SET DEFAULT 'none';

-- Líneas de venta: snapshot de códigos y tarifas
ALTER TABLE "SalesInvoiceLine" RENAME COLUMN "taxType" TO "ivaTaxCode";
ALTER TABLE "SalesInvoiceLine" RENAME COLUMN "consumptionTaxType" TO "consumptionTaxCode";
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "ivaTaxCode" DROP DEFAULT;
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "ivaTaxCode" TYPE TEXT USING "ivaTaxCode"::text;
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "ivaTaxCode" SET DEFAULT 'iva_19';
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "consumptionTaxCode" DROP DEFAULT;
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "consumptionTaxCode" TYPE TEXT USING "consumptionTaxCode"::text;
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "consumptionTaxCode" SET DEFAULT 'none';

ALTER TABLE "SalesInvoiceLine" ADD COLUMN "ivaRateSnapshot" DECIMAL(65,30);
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "consumptionRateSnapshot" DECIMAL(65,30);

DROP TYPE "TaxType";
DROP TYPE "ConsumptionTaxType";
