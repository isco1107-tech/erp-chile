-- Dominio predeterminado de la empresa: el que ya compró y con el que nacen sus
-- páginas nuevas (`<dirección>.<dominio>`). Aditiva e idempotente (la base es la de
-- producción compartida): columna nullable e índice único que ignora los NULL.
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "defaultDomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_defaultDomain_key" ON "CompanySettings"("defaultDomain");
