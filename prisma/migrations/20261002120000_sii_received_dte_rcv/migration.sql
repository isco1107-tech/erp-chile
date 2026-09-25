-- CreateEnum
CREATE TYPE "ReceivedDteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CLAIMED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "RcvKind" AS ENUM ('PURCHASES', 'SALES');

-- CreateTable
CREATE TABLE "ReceivedDte" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "issuerRut" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuerGiro" TEXT,
    "siiCode" INTEGER NOT NULL,
    "folio" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "exemptAmount" INTEGER NOT NULL DEFAULT 0,
    "ivaAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL,
    "references" JSONB,
    "xml" TEXT NOT NULL,
    "tedStatus" TEXT NOT NULL,
    "status" "ReceivedDteStatus" NOT NULL DEFAULT 'PENDING',
    "statusNote" TEXT,
    "statusAt" TIMESTAMP(3),
    "statusById" TEXT,
    "purchaseDocumentId" TEXT,
    "fileName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivedDte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcvImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "RcvKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcvImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceivedDte_companyId_status_receivedAt_idx" ON "ReceivedDte"("companyId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivedDte_companyId_issuerRut_siiCode_folio_key" ON "ReceivedDte"("companyId", "issuerRut", "siiCode", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "RcvImport_companyId_kind_year_month_key" ON "RcvImport"("companyId", "kind", "year", "month");

-- AddForeignKey
ALTER TABLE "ReceivedDte" ADD CONSTRAINT "ReceivedDte_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedDte" ADD CONSTRAINT "ReceivedDte_purchaseDocumentId_fkey" FOREIGN KEY ("purchaseDocumentId") REFERENCES "PurchaseDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcvImport" ADD CONSTRAINT "RcvImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

