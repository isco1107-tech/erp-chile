-- Bodega móvil: registro de idempotencia de la app del bodeguero y caché/libro de uso
-- de la identificación de productos por foto (aditiva e idempotente).
CREATE TABLE IF NOT EXISTS "WarehouseMobileOp" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientOpId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseMobileOp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductPhotoScan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "imageSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPhotoScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WarehouseMobileOp_companyId_createdAt_idx" ON "WarehouseMobileOp"("companyId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WarehouseMobileOp_companyId_clientOpId_key" ON "WarehouseMobileOp"("companyId", "clientOpId");
CREATE INDEX IF NOT EXISTS "ProductPhotoScan_companyId_imageSha256_idx" ON "ProductPhotoScan"("companyId", "imageSha256");
CREATE INDEX IF NOT EXISTS "ProductPhotoScan_companyId_createdAt_idx" ON "ProductPhotoScan"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductPhotoScan_createdAt_idx" ON "ProductPhotoScan"("createdAt");

DO $$ BEGIN
  ALTER TABLE "WarehouseMobileOp" ADD CONSTRAINT "WarehouseMobileOp_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductPhotoScan" ADD CONSTRAINT "ProductPhotoScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
