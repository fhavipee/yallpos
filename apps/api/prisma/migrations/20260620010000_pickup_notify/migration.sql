-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN "pickupName" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "pickupPhone" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "pickupNotifiedAt" TIMESTAMP(3);
