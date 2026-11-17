-- Etiquetas de balanza en el POS (EAN-13 de peso o precio variable, prefijos 20–29).
-- El producto guarda su PLU de balanza (único por empresa, sin ceros a la izquierda)
-- y la empresa el formato de sus etiquetas (JSON validado con Zod; NULL = apagado).
-- Aditiva e idempotente (la base es la de producción compartida): columnas nullable.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "scaleCode" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "scaleLabelFormat" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_scaleCode_key" ON "Product"("companyId", "scaleCode");
