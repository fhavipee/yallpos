-- CreateTable
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT,
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffShift_branchId_clockInAt_idx" ON "StaffShift"("branchId", "clockInAt");

-- CreateIndex
CREATE INDEX "StaffShift_userId_clockOutAt_idx" ON "StaffShift"("userId", "clockOutAt");

-- CreateIndex
CREATE INDEX "StaffShift_branchId_userId_clockOutAt_idx" ON "StaffShift"("branchId", "userId", "clockOutAt");

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
