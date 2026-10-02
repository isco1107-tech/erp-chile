-- Archivar productos (en vez de borrarlos cuando ya tienen historial).
-- Aditiva e idempotente: columna con default, no toca filas existentes.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
