-- Academia de modelaje: ficha de alumnas, asistencia y mensualidad (aditiva e idempotente).
DO $$ BEGIN
  CREATE TYPE "AcademyAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasAcademy" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AcademyGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT,
    "monthlyFee" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyStudent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT,
    "rut" TEXT NOT NULL,
    "rutClean" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "photoConsent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademyStudent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AcademyAttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyMonthlyPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "AcademyMonthlyPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AcademyGroup_companyId_isActive_idx" ON "AcademyGroup"("companyId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyStudent_companyId_rutClean_key" ON "AcademyStudent"("companyId", "rutClean");
CREATE INDEX IF NOT EXISTS "AcademyStudent_companyId_isActive_idx" ON "AcademyStudent"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "AcademyStudent_companyId_groupId_idx" ON "AcademyStudent"("companyId", "groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyAttendance_studentId_date_key" ON "AcademyAttendance"("studentId", "date");
CREATE INDEX IF NOT EXISTS "AcademyAttendance_companyId_date_idx" ON "AcademyAttendance"("companyId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyMonthlyPayment_studentId_period_key" ON "AcademyMonthlyPayment"("studentId", "period");
CREATE INDEX IF NOT EXISTS "AcademyMonthlyPayment_companyId_period_idx" ON "AcademyMonthlyPayment"("companyId", "period");

DO $$ BEGIN
  ALTER TABLE "AcademyGroup" ADD CONSTRAINT "AcademyGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyStudent" ADD CONSTRAINT "AcademyStudent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyStudent" ADD CONSTRAINT "AcademyStudent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyAttendance" ADD CONSTRAINT "AcademyAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyAttendance" ADD CONSTRAINT "AcademyAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AcademyStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyMonthlyPayment" ADD CONSTRAINT "AcademyMonthlyPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyMonthlyPayment" ADD CONSTRAINT "AcademyMonthlyPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AcademyStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
