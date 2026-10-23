-- Proveedor, motivo, foto de respaldo y operario en cada movimiento de inventario, y
-- portal de inventario para proveedores (aditiva e idempotente).

-- Movimientos: quién los hizo, por qué, con qué foto de respaldo y de qué proveedor llegó.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

CREATE TABLE IF NOT EXISTS "ProductSupplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "lastReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierPortalAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "showMovement" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductSupplier_companyId_supplierId_idx" ON "ProductSupplier"("companyId", "supplierId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductSupplier_productId_supplierId_key" ON "ProductSupplier"("productId", "supplierId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalAccess_contactId_key" ON "SupplierPortalAccess"("contactId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPortalAccess_codeHash_key" ON "SupplierPortalAccess"("codeHash");
CREATE INDEX IF NOT EXISTS "SupplierPortalAccess_companyId_idx" ON "SupplierPortalAccess"("companyId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_companyId_warehouseId_createdAt_idx" ON "InventoryMovement"("companyId", "warehouseId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_companyId_supplierId_createdAt_idx" ON "InventoryMovement"("companyId", "supplierId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierPortalAccess" ADD CONSTRAINT "SupplierPortalAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierPortalAccess" ADD CONSTRAINT "SupplierPortalAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
