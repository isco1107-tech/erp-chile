-- N-17 (auditoría 2026-09-14): la unicidad de folio de compra por proveedor
-- no distinguía tipo de documento. Una Factura y una Nota de Crédito del
-- mismo proveedor con el mismo folio (numeraciones independientes del
-- proveedor, no relacionadas entre sí) chocaban contra
-- "PurchaseDocument_companyId_contactId_folio_key".
--
-- La nueva restricción (companyId, contactId, documentType, folio) es MÁS
-- LAXA que la anterior (companyId, contactId, folio): todo lo que era único
-- bajo la restricción vieja sigue siendo único bajo la nueva, así que ningún
-- dato existente puede violarla. Es seguro aplicar este cambio sin migrar
-- datos primero.

DROP INDEX "PurchaseDocument_companyId_contactId_folio_key";

CREATE UNIQUE INDEX "PurchaseDocument_companyId_contactId_documentType_folio_key" ON "PurchaseDocument"("companyId", "contactId", "documentType", "folio");
