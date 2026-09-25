-- Micrositio: dominio propio por certamen (ej. missuniversotemuco.cl).
-- Aditiva y re-ejecutable: dos columnas nullable y un índice único.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Project_customDomain_key" ON "Project"("customDomain");
