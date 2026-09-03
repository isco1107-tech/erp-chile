-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditLimit" INTEGER;

-- CreateIndex
CREATE INDEX "SalesDocument_companyId_contactId_paymentStatus_idx" ON "SalesDocument"("companyId", "contactId", "paymentStatus");
