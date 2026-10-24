-- Mapa de calor de rotación (dentro de Métricas de retail): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasRetailHeatmap" BOOLEAN NOT NULL DEFAULT false;
