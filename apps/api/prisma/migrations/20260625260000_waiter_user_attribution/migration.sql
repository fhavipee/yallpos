-- Mesero por staff o usuario (PIN) en mesa y ventas
ALTER TABLE "TableSession" ALTER COLUMN "waiterId" DROP NOT NULL;
ALTER TABLE "TableSession" ADD COLUMN "waiterUserId" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "waiterUserId" TEXT;
ALTER TABLE "Staff" ADD COLUMN "userId" TEXT;

CREATE INDEX "Staff_branchId_userId_idx" ON "Staff"("branchId", "userId");
