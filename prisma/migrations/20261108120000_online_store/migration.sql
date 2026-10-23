-- Tienda en línea dentro del constructor de sitios (aditiva e idempotente): módulo hasEcommerce,
-- configuración por sitio, productos publicados, pedidos, reservas de stock e historial.

DO $$ BEGIN
  CREATE TYPE "StoreOrderStatus" AS ENUM ('OPEN', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StorePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StoreFulfillmentStatus" AS ENUM ('UNFULFILLED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StoreDeliveryMethod" AS ENUM ('SHIPPING', 'PICKUP');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StorePaymentProvider" AS ENUM ('KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StoreDocumentType" AS ENUM ('BOLETA', 'FACTURA');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StoreReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TYPE "WorkflowTriggerEvent" ADD VALUE IF NOT EXISTS 'STORE_ORDER_PAID';

ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasEcommerce" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "WebSiteStore" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT,
    "notifyEmail" TEXT,
    "supportPhone" TEXT,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pickupAddress" TEXT,
    "pickupInstructions" TEXT,
    "shippingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shippingRates" JSONB NOT NULL DEFAULT '[]',
    "paymentMethods" JSONB NOT NULL DEFAULT '[]',
    "bankTransferInfo" TEXT,
    "transferHoldHours" INTEGER NOT NULL DEFAULT 48,
    "webpayCommerceCode" TEXT,
    "webpayApiSecret" TEXT,
    "webpayProduction" BOOLEAN NOT NULL DEFAULT false,
    "invoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "termsText" TEXT,
    "returnsText" TEXT,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "orderCounter" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebSiteStore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "compareAtPrice" INTEGER,
    "collection" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxPerOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'OPEN',
    "paymentStatus" "StorePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" "StoreFulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "accessToken" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerRut" TEXT,
    "documentType" "StoreDocumentType" NOT NULL DEFAULT 'BOLETA',
    "billing" JSONB,
    "deliveryMethod" "StoreDeliveryMethod" NOT NULL,
    "shippingAddress" JSONB,
    "shippingRateId" TEXT,
    "shippingRateName" TEXT,
    "customerNotes" TEXT,
    "subtotal" INTEGER NOT NULL,
    "shippingTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "exemptAmount" INTEGER NOT NULL DEFAULT 0,
    "ivaAmount" INTEGER NOT NULL,
    "paymentProvider" "StorePaymentProvider",
    "providerPaymentId" TEXT,
    "paymentUrl" TEXT,
    "paymentReference" TEXT,
    "paymentMethodCode" TEXT,
    "paymentExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "salesDocumentId" TEXT,
    "documentError" TEXT,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreOrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "quantity" INTEGER NOT NULL,
    "netUnit" INTEGER NOT NULL,
    "grossUnit" INTEGER NOT NULL,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "StoreOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreStockReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StoreReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreStockReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoreOrderEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebSiteStore_siteId_key" ON "WebSiteStore"("siteId");

CREATE INDEX IF NOT EXISTS "WebSiteStore_companyId_idx" ON "WebSiteStore"("companyId");

CREATE INDEX IF NOT EXISTS "StoreProduct_companyId_siteId_published_idx" ON "StoreProduct"("companyId", "siteId", "published");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreProduct_siteId_productId_key" ON "StoreProduct"("siteId", "productId");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreProduct_siteId_slug_key" ON "StoreProduct"("siteId", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreOrder_accessToken_key" ON "StoreOrder"("accessToken");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreOrder_salesDocumentId_key" ON "StoreOrder"("salesDocumentId");

CREATE INDEX IF NOT EXISTS "StoreOrder_companyId_status_createdAt_idx" ON "StoreOrder"("companyId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "StoreOrder_companyId_siteId_paymentStatus_idx" ON "StoreOrder"("companyId", "siteId", "paymentStatus");

CREATE INDEX IF NOT EXISTS "StoreOrder_companyId_fulfillmentStatus_idx" ON "StoreOrder"("companyId", "fulfillmentStatus");

CREATE INDEX IF NOT EXISTS "StoreOrder_companyId_customerEmail_idx" ON "StoreOrder"("companyId", "customerEmail");

CREATE INDEX IF NOT EXISTS "StoreOrder_paymentExpiresAt_idx" ON "StoreOrder"("paymentExpiresAt");

CREATE INDEX IF NOT EXISTS "StoreOrder_providerPaymentId_idx" ON "StoreOrder"("providerPaymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreOrder_siteId_number_key" ON "StoreOrder"("siteId", "number");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreOrder_siteId_idempotencyKey_key" ON "StoreOrder"("siteId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "StoreOrderItem_companyId_orderId_idx" ON "StoreOrderItem"("companyId", "orderId");

CREATE INDEX IF NOT EXISTS "StoreOrderItem_companyId_productId_idx" ON "StoreOrderItem"("companyId", "productId");

CREATE INDEX IF NOT EXISTS "StoreStockReservation_companyId_productId_warehouseId_statu_idx" ON "StoreStockReservation"("companyId", "productId", "warehouseId", "status");

CREATE INDEX IF NOT EXISTS "StoreStockReservation_orderId_idx" ON "StoreStockReservation"("orderId");

CREATE INDEX IF NOT EXISTS "StoreStockReservation_status_expiresAt_idx" ON "StoreStockReservation"("status", "expiresAt");

CREATE INDEX IF NOT EXISTS "StoreOrderEvent_orderId_createdAt_idx" ON "StoreOrderEvent"("orderId", "createdAt");

CREATE INDEX IF NOT EXISTS "StoreOrderEvent_companyId_createdAt_idx" ON "StoreOrderEvent"("companyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WebSiteStore" ADD CONSTRAINT "WebSiteStore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WebSiteStore" ADD CONSTRAINT "WebSiteStore_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WebSiteStore" ADD CONSTRAINT "WebSiteStore_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreStockReservation" ADD CONSTRAINT "StoreStockReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreStockReservation" ADD CONSTRAINT "StoreStockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrderEvent" ADD CONSTRAINT "StoreOrderEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreOrderEvent" ADD CONSTRAINT "StoreOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
