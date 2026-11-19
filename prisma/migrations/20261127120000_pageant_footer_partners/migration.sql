-- Logos del pie de página del micrositio del certamen (organizadores e instituciones
-- que apoyan), con su enlace. JSON validado con Zod al guardar y al leer; NULL = sin logos.
-- Aditiva e idempotente (la base es la de producción compartida): columna nullable.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "footerPartners" JSONB;
