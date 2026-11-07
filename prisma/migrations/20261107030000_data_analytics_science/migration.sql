-- Módulos independientes y apagados por defecto; ninguna empresa se activa automáticamente.
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasDataAnalytics" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasDataScience" BOOLEAN NOT NULL DEFAULT false;
