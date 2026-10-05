-- Inscripción pública a la academia: token por empresa y preinscripciones (aditiva e idempotente).
DO $$ BEGIN
  CREATE TYPE "AcademyApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "academyEnrollmentToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_academyEnrollmentToken_key" ON "CompanySettings"("academyEnrollmentToken");

CREATE TABLE IF NOT EXISTS "AcademyApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "AcademyApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "rutClean" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "photoConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "preferredGroupId" TEXT,
    "message" TEXT,
    "studentId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AcademyApplication_companyId_status_createdAt_idx" ON "AcademyApplication"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AcademyApplication_companyId_rutClean_idx" ON "AcademyApplication"("companyId", "rutClean");

DO $$ BEGIN
  ALTER TABLE "AcademyApplication" ADD CONSTRAINT "AcademyApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
