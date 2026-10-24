-- Reposición predictiva (dentro de Métricas de retail): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasSmartReorder" BOOLEAN NOT NULL DEFAULT false;

-- Ajustes de la reposición: tiempo de entrega por defecto, días a cubrir y tiempos por proveedor.
ALTER TABLE "RetailSettings" ADD COLUMN IF NOT EXISTS "reorderLeadDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "RetailSettings" ADD COLUMN IF NOT EXISTS "reorderCoverDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "RetailSettings" ADD COLUMN IF NOT EXISTS "supplierLeadDays" JSONB;
