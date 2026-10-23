-- Sellers de consignación (aditiva e idempotente): la mercadería es del seller hasta que se
-- vende y se le liquida lo vendido menos la comisión. Columnas nuevas nullable o con default,
-- tablas nuevas; nada existente se modifica ni se borra.

DO $$ BEGIN
  CREATE TYPE "SellerSettlementStatus" AS ENUM ('CONFIRMED', 'PAID', 'VOIDED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TYPE "InternalDocumentKind" ADD VALUE IF NOT EXISTS 'SELLER_SETTLEMENT';

-- Contacto: el seller y su comisión por defecto (puntos base: 1500 = 15 %).
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "isConsignor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "consignmentCommissionBps" INTEGER;

-- Producto: dueño (seller) y comisión propia opcional.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignorId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignmentCommissionBps" INTEGER;

-- Línea de venta: foto del seller y de la comisión al momento de vender.
ALTER TABLE "SalesDocumentItem" ADD COLUMN IF NOT EXISTS "consignorId" TEXT;
ALTER TABLE "SalesDocumentItem" ADD COLUMN IF NOT EXISTS "consignorCommissionBps" INTEGER;
-- Nota de crédito: base neta que se le revierte al seller (la proporción de lo que se le acreditó en la venta original).
ALTER TABLE "SalesDocumentItem" ADD COLUMN IF NOT EXISTS "consignorBaseNet" INTEGER;

CREATE TABLE IF NOT EXISTS "SellerSettlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignorId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "SellerSettlementStatus" NOT NULL DEFAULT 'CONFIRMED',
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
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SellerSettlementLine" (
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

    CONSTRAINT "SellerSettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SellerSettlement_companyId_consignorId_createdAt_idx" ON "SellerSettlement"("companyId", "consignorId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerSettlement_companyId_number_key" ON "SellerSettlement"("companyId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerSettlement_companyId_idempotencyKey_key" ON "SellerSettlement"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerSettlementLine_settlementId_salesDocumentItemId_key" ON "SellerSettlementLine"("settlementId", "salesDocumentItemId");
CREATE INDEX IF NOT EXISTS "Product_companyId_consignorId_idx" ON "Product"("companyId", "consignorId");
CREATE INDEX IF NOT EXISTS "SalesDocumentItem_companyId_consignorId_idx" ON "SalesDocumentItem"("companyId", "consignorId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SellerSettlement" ADD CONSTRAINT "SellerSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SellerSettlement" ADD CONSTRAINT "SellerSettlement_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SellerSettlementLine" ADD CONSTRAINT "SellerSettlementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SellerSettlementLine" ADD CONSTRAINT "SellerSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SellerSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
