-- CreateEnum
CREATE TYPE "IndustryType" AS ENUM ('SERVICES', 'COMMERCE', 'DISTRIBUTION', 'RETAIL', 'LIGHT_MANUFACTURING');

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "industryType" "IndustryType" NOT NULL DEFAULT 'COMMERCE',
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "ppmRateBasisPoints" INTEGER NOT NULL DEFAULT 100,
    "honorariumRetentionBps" INTEGER NOT NULL DEFAULT 1375,
    "fiscalYear" INTEGER NOT NULL DEFAULT 2026,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "debitVat" INTEGER NOT NULL DEFAULT 0,
    "creditVat" INTEGER NOT NULL DEFAULT 0,
    "previousRemanent" INTEGER NOT NULL DEFAULT 0,
    "remanentCredit" INTEGER NOT NULL DEFAULT 0,
    "ppmAmount" INTEGER NOT NULL DEFAULT 0,
    "determinedTax" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");
CREATE UNIQUE INDEX "TaxPeriod_companyId_year_month_key" ON "TaxPeriod"("companyId", "year", "month");
CREATE INDEX "TaxPeriod_companyId_year_month_idx" ON "TaxPeriod"("companyId", "year", "month");
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CompanySettings" ("id", "companyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Company"
ON CONFLICT ("companyId") DO NOTHING;