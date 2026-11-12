-- Trazabilidad por unidad: números de serie y su historia. Aditiva e idempotente
-- (la base es la de producción compartida): solo tablas y tipos nuevos.
DO $$ BEGIN
  CREATE TYPE "ProductSerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'LOST', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProductSerialEventKind" AS ENUM ('REGISTERED', 'TRANSFERRED', 'SOLD', 'LOST', 'RETURNED', 'REOPENED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductSerial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "ProductSerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "warehouseId" TEXT,
    "lotNumber" TEXT,
    "supplierId" TEXT,
    "salesDocumentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSerial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductSerialEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serialId" TEXT NOT NULL,
    "kind" "ProductSerialEventKind" NOT NULL,
    "fromStatus" "ProductSerialStatus",
    "toStatus" "ProductSerialStatus" NOT NULL,
    "warehouseId" TEXT,
    "userId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSerialEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSerial_companyId_productId_serial_key" ON "ProductSerial"("companyId", "productId", "serial");
CREATE INDEX IF NOT EXISTS "ProductSerial_companyId_status_idx" ON "ProductSerial"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ProductSerial_companyId_productId_status_idx" ON "ProductSerial"("companyId", "productId", "status");
CREATE INDEX IF NOT EXISTS "ProductSerial_companyId_warehouseId_status_idx" ON "ProductSerial"("companyId", "warehouseId", "status");
CREATE INDEX IF NOT EXISTS "ProductSerialEvent_companyId_serialId_createdAt_idx" ON "ProductSerialEvent"("companyId", "serialId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSerialEvent" ADD CONSTRAINT "ProductSerialEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSerialEvent" ADD CONSTRAINT "ProductSerialEvent_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ProductSerial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
