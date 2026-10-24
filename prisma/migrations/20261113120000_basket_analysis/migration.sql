-- Canasta cruzada (dentro de Métricas de retail): interruptor propio, apagado por defecto.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasBasketAnalysis" BOOLEAN NOT NULL DEFAULT false;
