-- Academia: ficha igual a la de candidatas y pagos que sobreviven a la alumna (aditiva e idempotente).
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "pantsSize" TEXT;
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "shirtSize" TEXT;
ALTER TABLE "AcademyStudent" ADD COLUMN IF NOT EXISTS "shoeSize" TEXT;

ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "pantsSize" TEXT;
ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "shirtSize" TEXT;
ALTER TABLE "AcademyApplication" ADD COLUMN IF NOT EXISTS "shoeSize" TEXT;

ALTER TABLE "AcademyMonthlyPayment" ADD COLUMN IF NOT EXISTS "studentName" TEXT;
ALTER TABLE "AcademyMonthlyPayment" ADD COLUMN IF NOT EXISTS "studentRut" TEXT;
ALTER TABLE "AcademyMonthlyPayment" ALTER COLUMN "studentId" DROP NOT NULL;

-- Los pagos ya registrados guardan la copia del nombre y RUT de su alumna.
UPDATE "AcademyMonthlyPayment" p
SET "studentName" = s."fullName", "studentRut" = s."rut"
FROM "AcademyStudent" s
WHERE p."studentId" = s."id" AND p."studentName" IS NULL;

-- Al eliminar la alumna el pago queda (antes se borraba en cascada).
ALTER TABLE "AcademyMonthlyPayment" DROP CONSTRAINT IF EXISTS "AcademyMonthlyPayment_studentId_fkey";
DO $$ BEGIN
  ALTER TABLE "AcademyMonthlyPayment" ADD CONSTRAINT "AcademyMonthlyPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AcademyStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
