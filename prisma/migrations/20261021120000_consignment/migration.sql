-- Productores y consignación (aditivo). Generado con prisma migrate diff y filtrado:
-- solo lo de este feature; el resto del diff (drift de la BD compartida) se omitió.
-- Guardas de reintento alineadas con las migraciones de producción existentes.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SupplyMode" AS ENUM ('OWN', 'CONSIGNMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ConsignmentLineKind" AS ENUM ('SALE', 'REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ConsignmentCommissionBase" AS ENUM ('NET', 'GROSS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ConsignmentSettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
-- Nuevo origen de asiento contable (devengo al productor). Aditivo.
ALTER TYPE "JournalSourceType" ADD VALUE IF NOT EXISTS 'CONSIGNMENT';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasConsignment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "commissionBpsOverride" INTEGER,
ADD COLUMN IF NOT EXISTS "producerId" TEXT,
ADD COLUMN IF NOT EXISTS "supplyMode" "SupplyMode" NOT NULL DEFAULT 'OWN';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Producer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "defaultCommissionBps" INTEGER NOT NULL DEFAULT 0,
    "commissionBase" "ConsignmentCommissionBase" NOT NULL DEFAULT 'NET',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "paymentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsignmentSettlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalSold" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" INTEGER NOT NULL DEFAULT 0,
    "totalDue" INTEGER NOT NULL DEFAULT 0,
    "producerNetAffected" INTEGER NOT NULL DEFAULT 0,
    "producerExempt" INTEGER NOT NULL DEFAULT 0,
    "producerIva" INTEGER NOT NULL DEFAULT 0,
    "totalPayable" INTEGER NOT NULL DEFAULT 0,
    "status" "ConsignmentSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "payableDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignmentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConsignmentSettlementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "salesDocumentItemId" TEXT,
    "kind" "ConsignmentLineKind" NOT NULL DEFAULT 'SALE',
    "reversesLineId" TEXT,
    "productId" TEXT NOT NULL,
    "soldNet" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "producerAmount" INTEGER NOT NULL,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "saleIva" INTEGER NOT NULL DEFAULT 0,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_companyId_producerId_idx" ON "Product"("companyId", "producerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Producer_companyId_isActive_idx" ON "Producer"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Producer_companyId_contactId_key" ON "Producer"("companyId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConsignmentSettlement_payableDocumentId_key" ON "ConsignmentSettlement"("payableDocumentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsignmentSettlement_companyId_producerId_status_idx" ON "ConsignmentSettlement"("companyId", "producerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsignmentSettlement_companyId_periodStart_idx" ON "ConsignmentSettlement"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsignmentSettlementLine_companyId_producerId_settlementId_idx" ON "ConsignmentSettlementLine"("companyId", "producerId", "settlementId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsignmentSettlementLine_companyId_documentDate_idx" ON "ConsignmentSettlementLine"("companyId", "documentDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConsignmentSettlementLine_companyId_reversesLineId_idx" ON "ConsignmentSettlementLine"("companyId", "reversesLineId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ConsignmentSettlementLine_salesDocumentItemId_kind_key" ON "ConsignmentSettlementLine"("salesDocumentItemId", "kind");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Producer" ADD CONSTRAINT "Producer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Producer" ADD CONSTRAINT "Producer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_payableDocumentId_fkey" FOREIGN KEY ("payableDocumentId") REFERENCES "PurchaseDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_salesDocumentItemId_fkey" FOREIGN KEY ("salesDocumentItemId") REFERENCES "SalesDocumentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_reversesLineId_fkey" FOREIGN KEY ("reversesLineId") REFERENCES "ConsignmentSettlementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConsignmentSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
