-- Trazabilidad: cada movimiento de bodega recuerda qué documento lo originó (venta, recepción,
-- producción, conteo…). Aditiva e idempotente: dos columnas nullable y un índice.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryMovement_companyId_sourceKind_sourceId_idx" ON "InventoryMovement"("companyId", "sourceKind", "sourceId");
