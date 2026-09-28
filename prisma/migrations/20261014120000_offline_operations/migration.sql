-- Modo contingencia (POS y operaciones sin conexión, docs/adr/0002). Solo agrega.
-- CreateEnum
CREATE TYPE "OfflineOperationKind" AS ENUM ('POS_SALE', 'STOCK_MOVEMENT', 'PURCHASE', 'GOODS_RECEIPT');

-- CreateEnum
CREATE TYPE "OfflineOperationStatus" AS ENUM ('PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "OfflineOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "kind" "OfflineOperationKind" NOT NULL,
    "status" "OfflineOperationStatus" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineOperation_companyId_status_createdAt_idx" ON "OfflineOperation"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineOperation_userId_idx" ON "OfflineOperation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineOperation_companyId_idempotencyKey_key" ON "OfflineOperation"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

