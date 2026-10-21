-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProductionOrderStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ServiceTicketStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalDocumentKind" ADD VALUE IF NOT EXISTS 'PRODUCTION_ORDER';
ALTER TYPE "InternalDocumentKind" ADD VALUE IF NOT EXISTS 'SERVICE_TICKET';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowTriggerEvent" ADD VALUE IF NOT EXISTS 'PRODUCTION_ORDER_COMPLETED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE IF NOT EXISTS 'SERVICE_TICKET_STATUS_CHANGED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE IF NOT EXISTS 'SERVICE_ESTIMATE_DECIDED';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS     "hasProduction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "hasServiceDesk" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BillOfMaterials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillOfMaterials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BomComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BomComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductionOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "bomId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "additionalCost" INTEGER NOT NULL DEFAULT 0,
    "additionalCostNote" TEXT,
    "totalCost" INTEGER,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductionOrderComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "consumedQuantity" DOUBLE PRECISION,
    "totalCost" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionOrderComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "contactId" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "accessories" TEXT,
    "reportedIssue" TEXT NOT NULL,
    "diagnosis" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "ServiceTicketStatus" NOT NULL DEFAULT 'RECEIVED',
    "technicianId" TEXT,
    "promisedDate" TIMESTAMP(3),
    "warranty" BOOLEAN NOT NULL DEFAULT false,
    "estimateDecision" TEXT,
    "estimateDecidedAt" TIMESTAMP(3),
    "estimateDecidedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "salesOrderId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "receivedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceTicketLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceTicketLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceTicketEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "ServiceTicketStatus",
    "note" TEXT,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BillOfMaterials_companyId_productId_idx" ON "BillOfMaterials"("companyId", "productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BomComponent_companyId_bomId_idx" ON "BomComponent"("companyId", "bomId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductionOrder_companyId_status_idx" ON "ProductionOrder"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionOrder_companyId_folio_key" ON "ProductionOrder"("companyId", "folio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductionOrderComponent_companyId_orderId_idx" ON "ProductionOrderComponent"("companyId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceTicket_trackingToken_key" ON "ServiceTicket"("trackingToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceTicket_companyId_status_idx" ON "ServiceTicket"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceTicket_companyId_folio_key" ON "ServiceTicket"("companyId", "folio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceTicketLine_companyId_ticketId_idx" ON "ServiceTicketLine"("companyId", "ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceTicketEvent_companyId_ticketId_createdAt_idx" ON "ServiceTicketEvent"("companyId", "ticketId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BillOfMaterials" ADD CONSTRAINT "BillOfMaterials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BillOfMaterials" ADD CONSTRAINT "BillOfMaterials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrderComponent" ADD CONSTRAINT "ProductionOrderComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrderComponent" ADD CONSTRAINT "ProductionOrderComponent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductionOrderComponent" ADD CONSTRAINT "ProductionOrderComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicketLine" ADD CONSTRAINT "ServiceTicketLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicketLine" ADD CONSTRAINT "ServiceTicketLine_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicketLine" ADD CONSTRAINT "ServiceTicketLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicketEvent" ADD CONSTRAINT "ServiceTicketEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ServiceTicketEvent" ADD CONSTRAINT "ServiceTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

