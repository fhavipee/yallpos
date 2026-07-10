-- Impresora térmica por estación KDS (sushi-bar, lobby bar, cocina, etc.)
ALTER TABLE "KdsStation" ADD COLUMN IF NOT EXISTS "printerIp" TEXT;
ALTER TABLE "KdsStation" ADD COLUMN IF NOT EXISTS "printerPort" INTEGER NOT NULL DEFAULT 9100;
ALTER TABLE "KdsStation" ADD COLUMN IF NOT EXISTS "printerName" TEXT;
