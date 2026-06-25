-- PIN operativo por usuario / personal de piso
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Staff" ADD COLUMN "pinHash" TEXT;
