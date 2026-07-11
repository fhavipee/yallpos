-- Enrich Payment for card terminal / transfer / QR reconciliation
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "authCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rrn" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "franchise" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "lastFour" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountType" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "installments" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "merchantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "entryMode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "externalTxnId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalPayload" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX IF NOT EXISTS "Payment_authCode_idx" ON "Payment"("authCode");
CREATE INDEX IF NOT EXISTS "Payment_externalTxnId_idx" ON "Payment"("externalTxnId");
