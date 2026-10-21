-- Archivo simple de facturas recibidas (proveedor, total e imagen/PDF).
-- Aditiva: tabla nueva, no toca datos existentes.
-- CreateTable
CREATE TABLE IF NOT EXISTS "ArchivedInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "contactId" TEXT,
    "invoiceNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchivedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArchivedInvoice_companyId_supplierKey_issueDate_idx" ON "ArchivedInvoice"("companyId", "supplierKey", "issueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArchivedInvoice_companyId_issueDate_idx" ON "ArchivedInvoice"("companyId", "issueDate");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ArchivedInvoice" ADD CONSTRAINT "ArchivedInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ArchivedInvoice" ADD CONSTRAINT "ArchivedInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ArchivedInvoice" ADD CONSTRAINT "ArchivedInvoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

