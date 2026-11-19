-- Tipografía del micrositio del certamen por familia y por bloque de texto
-- (JSON validado con Zod al guardar y al leer; NULL = la tipografía de fábrica).
-- Aditiva e idempotente (la base es la de producción compartida): columna nullable.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "publicTypography" JSONB;
