-- DropIndex
DROP INDEX "SalesDocument_companyId_contactId_paymentStatus_idx";

-- CreateIndex
CREATE INDEX "SalesDocument_companyId_contactId_status_paymentStatus_idx" ON "SalesDocument"("companyId", "contactId", "status", "paymentStatus");
