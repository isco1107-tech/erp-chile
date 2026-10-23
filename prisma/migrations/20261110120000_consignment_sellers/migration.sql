-- Sellers de consignación (aditiva e idempotente): la mercadería es del seller hasta que se
-- vende y se le liquida lo vendido menos la comisión. Columnas nuevas nullable o con default,
-- tablas nuevas; nada existente se modifica ni se borra.

DO $$ BEGIN
  CREATE TYPE "ConsignmentSettlementStatus" AS ENUM ('CONFIRMED', 'PAID', 'VOIDED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TYPE "InternalDocumentKind" ADD VALUE IF NOT EXISTS 'CONSIGNMENT_SETTLEMENT';

-- Contacto: el seller y su comisión por defecto (puntos base: 1500 = 15 %).
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "isConsignor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consignmentCommissionBps" INTEGER;

-- Producto: dueño (seller) y comisión propia opcional.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignorId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignmentCommissionBps" INTEGER;

-- Línea de venta: foto del seller y de la comisión al momento de vender.
ALTER TABLE "SalesDocumentItem" ADD COLUMN IF NOT EXISTS "consignorId" TEXT;
ALTER TABLE "SalesDocumentItem" ADD COLUMN IF NOT EXISTS "consignorCommissionBps" INTEGER;

CREATE TABLE IF NOT EXISTS "ConsignmentSettlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignorId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ConsignmentSettlementStatus" NOT NULL DEFAULT 'CONFIRMED',
    "units" DOUBLE PRECISION NOT NULL,
    "netSales" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT,
    "payoutAmount" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConsignmentSettlementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "salesDocumentItemId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "payoutAmount" INTEGER NOT NULL,

    CONSTRAINT "ConsignmentSettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsignmentSettlement_companyId_consignorId_createdAt_idx" ON "ConsignmentSettlement"("companyId", "consignorId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsignmentSettlement_companyId_number_key" ON "ConsignmentSettlement"("companyId", "number");
CREATE INDEX IF NOT EXISTS "ConsignmentSettlementLine_settlementId_idx" ON "ConsignmentSettlementLine"("settlementId");
CREATE INDEX IF NOT EXISTS "ConsignmentSettlementLine_companyId_salesDocumentItemId_idx" ON "ConsignmentSettlementLine"("companyId", "salesDocumentItemId");
CREATE INDEX IF NOT EXISTS "Product_companyId_consignorId_idx" ON "Product"("companyId", "consignorId");
CREATE INDEX IF NOT EXISTS "SalesDocumentItem_companyId_consignorId_idx" ON "SalesDocumentItem"("companyId", "consignorId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlement" ADD CONSTRAINT "ConsignmentSettlement_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentSettlementLine" ADD CONSTRAINT "ConsignmentSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConsignmentSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
