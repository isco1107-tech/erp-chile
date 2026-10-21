-- Aditiva: no modifica movimientos ni saldos existentes.
CREATE TABLE "WarehouseOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "movementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WarehouseOperation_status_check" CHECK ("status" IN ('REVIEW','APPLIED','CONFLICT','REJECTED'))
);
CREATE UNIQUE INDEX "WarehouseOperation_companyId_operationId_key" ON "WarehouseOperation"("companyId", "operationId");
CREATE INDEX "WarehouseOperation_companyId_receiptId_idx" ON "WarehouseOperation"("companyId", "receiptId");
CREATE INDEX "WarehouseOperation_companyId_status_createdAt_idx" ON "WarehouseOperation"("companyId", "status", "createdAt");
CREATE INDEX "WarehouseOperation_companyId_createdById_createdAt_idx" ON "WarehouseOperation"("companyId", "createdById", "createdAt");
ALTER TABLE "WarehouseOperation" ADD CONSTRAINT "WarehouseOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
