-- Dominio propio del sitio de la academia (aditiva e idempotente: dos columnas nullable).
ALTER TABLE "AcademySite" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
ALTER TABLE "AcademySite" ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "AcademySite_customDomain_key" ON "AcademySite"("customDomain");
