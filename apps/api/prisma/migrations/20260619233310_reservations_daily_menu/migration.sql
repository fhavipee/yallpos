-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pending', 'seated', 'cancelled', 'no_show');

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "guestsCount" INTEGER NOT NULL,
    "reservedFor" TIMESTAMP(3) NOT NULL,
    "tableId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "tableSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seatedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reservation_branchId_reservedFor_status_idx" ON "Reservation"("branchId", "reservedFor", "status");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
