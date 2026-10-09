-- Aditiva: los sitios existentes conservan su diseño hasta activar el estudio.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "publicSiteDesign" JSONB;
