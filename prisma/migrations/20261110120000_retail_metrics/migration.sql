-- Métricas de retail: interruptor propio, apagado por defecto (se enciende desde la Supersuite).
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasRetailMetrics" BOOLEAN NOT NULL DEFAULT false;
