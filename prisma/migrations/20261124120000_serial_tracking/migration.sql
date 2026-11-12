-- Series automáticas y garantía: el producto puede exigir serie en la recepción y la venta,
-- y la serie recuerda en qué recepción entró y hasta cuándo dura su garantía.
-- Aditiva e idempotente (la base es la de producción compartida): columnas nullable o con default.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tracksSerials" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER;
ALTER TABLE "ProductSerial" ADD COLUMN IF NOT EXISTS "goodsReceiptId" TEXT;
ALTER TABLE "ProductSerial" ADD COLUMN IF NOT EXISTS "warrantyUntil" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ProductSerial_companyId_goodsReceiptId_idx" ON "ProductSerial"("companyId", "goodsReceiptId");
CREATE INDEX IF NOT EXISTS "ProductSerial_companyId_salesDocumentId_idx" ON "ProductSerial"("companyId", "salesDocumentId");
