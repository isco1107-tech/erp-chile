-- Conexión con Hermes: una llave por empresa (solo su SHA-256) y la bodega desde la que vende.
-- Aditiva e idempotente (la base es la de producción compartida).
CREATE TABLE IF NOT EXISTS "HermesLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "HermesLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HermesLink_companyId_key" ON "HermesLink"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "HermesLink_keyHash_key" ON "HermesLink"("keyHash");
CREATE INDEX IF NOT EXISTS "HermesLink_warehouseId_idx" ON "HermesLink"("warehouseId");

DO $$ BEGIN
  ALTER TABLE "HermesLink" ADD CONSTRAINT "HermesLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HermesLink" ADD CONSTRAINT "HermesLink_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
