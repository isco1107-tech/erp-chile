-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxWarehouses" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "planName" TEXT NOT NULL DEFAULT 'Starter',
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "customRoleId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customRoleId" TEXT,
ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompanyFeatures" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hasInventory" BOOLEAN NOT NULL DEFAULT true,
    "hasPmpCosting" BOOLEAN NOT NULL DEFAULT true,
    "hasDteBilling" BOOLEAN NOT NULL DEFAULT false,
    "hasPurchases" BOOLEAN NOT NULL DEFAULT false,
    "hasTreasury" BOOLEAN NOT NULL DEFAULT false,
    "hasAdvancedReports" BOOLEAN NOT NULL DEFAULT false,
    "hasMultipleWarehouses" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFeatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFeatures_companyId_key" ON "CompanyFeatures"("companyId");

-- CreateIndex
CREATE INDEX "CustomRole_companyId_idx" ON "CustomRole"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_companyId_name_key" ON "CustomRole"("companyId", "name");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFeatures" ADD CONSTRAINT "CompanyFeatures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: las empresas que ya existían usaban el producto completo antes de que
-- hubiera planes. Los DEFAULT del modelo son el plan mínimo, así que sin esto la
-- migración les quitaría Compras, Tesorería y Reportes de un día para otro.
INSERT INTO "CompanyFeatures" (
  "id", "companyId", "hasInventory", "hasPmpCosting", "hasDteBilling",
  "hasPurchases", "hasTreasury", "hasAdvancedReports", "hasMultipleWarehouses",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, c."id", true, true, true, true, true, true, true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId") DO NOTHING;

UPDATE "Company"
SET "planName" = 'Enterprise', "maxUsers" = 25, "maxWarehouses" = 10
WHERE "createdAt" < CURRENT_TIMESTAMP;
