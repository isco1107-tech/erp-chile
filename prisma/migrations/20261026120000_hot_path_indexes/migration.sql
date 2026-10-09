-- Índices de rutas calientes (auditoría de estrés 2026-10-05, docs/auditoria-estres-ux-2026-10-05.md).
-- Solo aditivos e idempotentes (CLAUDE.md §5): IF NOT EXISTS.
-- Medido con 150.000 ventas / 300.000 líneas: sin ellos, cada include de
-- relación (items, pagos, stock) recorría la tabla completa de todas las empresas.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_companyId_createdAt_idx" ON "Contact"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryMovement_companyId_createdAt_idx" ON "InventoryMovement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_salesDocumentId_idx" ON "Payment"("salesDocumentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_purchaseDocumentId_idx" ON "Payment"("purchaseDocumentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseDocument_companyId_createdAt_idx" ON "PurchaseDocument"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseDocument_companyId_issueDate_idx" ON "PurchaseDocument"("companyId", "issueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseDocumentItem_documentId_idx" ON "PurchaseDocumentItem"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesDocument_companyId_createdAt_idx" ON "SalesDocument"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesDocument_companyId_issueDate_idx" ON "SalesDocument"("companyId", "issueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesDocumentItem_documentId_idx" ON "SalesDocumentItem"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesDocumentItem_productId_idx" ON "SalesDocumentItem"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Stock_productId_idx" ON "Stock"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TicketSale_ticketTypeId_idx" ON "TicketSale"("ticketTypeId");

