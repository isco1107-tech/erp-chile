-- Productores y consignación (aditivo). Generado con prisma migrate diff y filtrado:
-- solo lo de este feature; el resto del diff (drift de la BD compartida) se omitió. NO aplicado.

-- CreateEnum
CREATE TYPE "SupplyMode" AS ENUM ('OWN', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "ConsignmentLineKind" AS ENUM ('SALE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ConsignmentCommissionBase" AS ENUM ('NET', 'GROSS');

-- CreateEnum
CREATE TYPE "ConsignmentSettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');

-- AlterEnum
-- Nuevo origen de asiento contable (devengo al productor). Aditivo.
ALTER TYPE "JournalSourceType" ADD VALUE 'CONSIGNMENT';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasConsignment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "commissionBpsOverride" INTEGER,
ADD COLUMN     "producerId" TEXT,
ADD COLUMN     "supplyMode" "SupplyMode" NOT NULL DEFAULT 'OWN';

-- CreateTable
CREATE TABLE "Producer" (
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
CREATE TABLE "ConsignmentSettlement" (
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
CREATE TABLE "ConsignmentSettlementLine" (
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
CREATE INDEX "Product_companyId_producerId_idx" ON "Product"("companyId", "producerId");

-- CreateIndex
CREATE INDEX "Producer_companyId_isActive_idx" ON "Producer"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Producer_companyId_contactId_key" ON "Producer"("companyId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentSettlement_payableDocumentId_key" ON "ConsignmentSettlement"("payableDocumentId");

-- CreateIndex
CREATE INDEX "ConsignmentSettlement_companyId_producerId_status_idx" ON "ConsignmentSettlement"("companyId", "producerId", "status");

-- CreateIndex
CREATE INDEX "ConsignmentSettlement_companyId_periodStart_idx" ON "ConsignmentSettlement"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX "ConsignmentSettlementLine_companyId_producerId_settlementId_idx" ON "ConsignmentSettlementLine"("companyId", "producerId", "settlementId");

-- CreateIndex
CREATE INDEX "ConsignmentSettlementLine_companyId_documentDate_idx" ON "ConsignmentSettlementLine"("companyId", "documentDate");

-- CreateIndex
CREATE INDEX "ConsignmentSettlementLine_companyId_reversesLineId_idx" ON "ConsignmentSettlementLine"("companyId", "reversesLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentSettlementLine_salesDocumentItemId_kind_key" ON "ConsignmentSettlementLine"("salesDocumentItemId", "kind");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_payableDocumentId_fkey" FOREIGN KEY ("payableDocumentId") REFERENCES "PurchaseDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_salesDocumentItemId_fkey" FOREIGN KEY ("salesDocumentItemId") REFERENCES "SalesDocumentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_reversesLineId_fkey" FOREIGN KEY ("reversesLineId") REFERENCES "ConsignmentSettlementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConsignmentSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
