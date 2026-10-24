-- Mermas con responsable (dentro de Inventario): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasShrinkageLiability" BOOLEAN NOT NULL DEFAULT false;

-- Quién responde por cada pérdida del kardex (una fila por salida).
CREATE TABLE IF NOT EXISTS "ShrinkageLiability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "supplierId" TEXT,
    "assignedById" TEXT,
    "assignedByName" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShrinkageLiability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShrinkageLiability_movementId_key" ON "ShrinkageLiability"("movementId");
CREATE INDEX IF NOT EXISTS "ShrinkageLiability_companyId_supplierId_idx" ON "ShrinkageLiability"("companyId", "supplierId");
CREATE INDEX IF NOT EXISTS "ShrinkageLiability_companyId_party_idx" ON "ShrinkageLiability"("companyId", "party");

DO $$ BEGIN
    ALTER TABLE "ShrinkageLiability" ADD CONSTRAINT "ShrinkageLiability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ShrinkageLiability" ADD CONSTRAINT "ShrinkageLiability_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ShrinkageLiability" ADD CONSTRAINT "ShrinkageLiability_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ajustes: responsable sugerido por motivo y avisos de vencimiento.
CREATE TABLE IF NOT EXISTS "ShrinkageSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaults" JSONB,
    "expiryAlerts" BOOLEAN NOT NULL DEFAULT true,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShrinkageSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShrinkageSettings_companyId_key" ON "ShrinkageSettings"("companyId");

DO $$ BEGIN
    ALTER TABLE "ShrinkageSettings" ADD CONSTRAINT "ShrinkageSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
