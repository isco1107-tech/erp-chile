-- Stock muerto (dentro de Métricas de retail): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasDeadStock" BOOLEAN NOT NULL DEFAULT false;

-- Ajustes de Métricas de retail (1:1 con la empresa).
CREATE TABLE IF NOT EXISTS "RetailSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deadStockDays" INTEGER NOT NULL DEFAULT 30,
    "deadStockAlerts" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RetailSettings_companyId_key" ON "RetailSettings"("companyId");

DO $$ BEGIN
    ALTER TABLE "RetailSettings" ADD CONSTRAINT "RetailSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Disparador de automatizaciones: producto que cumplió el umbral de stock muerto.
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE IF NOT EXISTS 'DEAD_STOCK_DETECTED';
