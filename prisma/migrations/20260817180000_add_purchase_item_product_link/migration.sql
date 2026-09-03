-- Enlaza las líneas de factura de compra con producto y bodega, para que una
-- compra pueda recalcular el PMP y dar entrada a stock. Ambas columnas son
-- NULLable: una factura de compra también contiene servicios, fletes y gastos
-- que no son inventario, y esas líneas siguen siendo puro gasto.

ALTER TABLE "PurchaseDocumentItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "PurchaseDocumentItem" ADD COLUMN "warehouseId" TEXT;

CREATE INDEX "PurchaseDocumentItem_companyId_productId_idx" ON "PurchaseDocumentItem"("companyId", "productId");

ALTER TABLE "PurchaseDocumentItem"
  ADD CONSTRAINT "PurchaseDocumentItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseDocumentItem"
  ADD CONSTRAINT "PurchaseDocumentItem_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deja trazabilidad de quién exporta el libro Excel: contiene costos, márgenes
-- y PMP de toda la empresa.
ALTER TYPE "AuditAction" ADD VALUE 'EXPORT';
