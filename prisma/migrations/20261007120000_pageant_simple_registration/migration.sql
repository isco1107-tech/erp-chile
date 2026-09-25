-- Postulación pública simplificada (nombre, RUT, edad, comuna, teléfono,
-- correo, Instagram y motivación) y contenido de la convocatoria.
-- Aditiva y re-ejecutable: quitar un NOT NULL no rompe filas existentes.
ALTER TABLE "Candidate" ALTER COLUMN "birthDate" DROP NOT NULL;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "declaredAge" INTEGER;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "registrationBenefits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "registrationClassesNote" TEXT;
