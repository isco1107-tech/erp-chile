-- CreateEnum
CREATE TYPE "DteType" AS ENUM ('COTIZACION', 'FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'GUIA_DESPACHO_52', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FolioSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dteType" "DteType" NOT NULL,
    "currentFolio" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FolioSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "dteType" "DteType" NOT NULL,
    "folio" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "exemptAmount" INTEGER NOT NULL DEFAULT 0,
    "ivaAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "referenceFolio" INTEGER,
    "referenceType" "DteType",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDocumentItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "unitCostPMP" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SalesDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FolioSequence_companyId_dteType_key" ON "FolioSequence"("companyId", "dteType");

-- CreateIndex
CREATE INDEX "SalesDocument_companyId_status_idx" ON "SalesDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "SalesDocument_companyId_dteType_idx" ON "SalesDocument"("companyId", "dteType");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDocument_companyId_dteType_folio_key" ON "SalesDocument"("companyId", "dteType", "folio");

-- CreateIndex
CREATE INDEX "SalesDocumentItem_companyId_documentId_idx" ON "SalesDocumentItem"("companyId", "documentId");

-- AddForeignKey
ALTER TABLE "FolioSequence" ADD CONSTRAINT "FolioSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
