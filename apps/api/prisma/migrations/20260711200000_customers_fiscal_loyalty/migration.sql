-- Company default buyer (consumidor final)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultBuyerDocType" TEXT NOT NULL DEFAULT 'CC';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultBuyerDocNumber" TEXT NOT NULL DEFAULT '222222222222';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultBuyerName" TEXT NOT NULL DEFAULT 'Consumidor final';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultBuyerDv" TEXT;

-- Expand Customer for DIAN buyer + loyalty
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "dv" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'CO';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "taxRegime" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "fiscalResponsibilities" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isGeneric" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyTier" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
CREATE INDEX IF NOT EXISTS "Customer_companyId_name_idx" ON "Customer"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Customer_companyId_isGeneric_idx" ON "Customer"("companyId", "isGeneric");

-- Invoice ↔ customer + named buyer flag
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "requiresNamedBuyer" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesInvoice_customerId_fkey'
  ) THEN
    ALTER TABLE "SalesInvoice"
      ADD CONSTRAINT "SalesInvoice_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
