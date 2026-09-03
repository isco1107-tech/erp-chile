-- CreateEnum
CREATE TYPE "PurchaseApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "purchaseApprovalThreshold" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseDocument" ADD COLUMN     "approvalNotes" TEXT,
ADD COLUMN     "approvalStatus" "PurchaseApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseDocument_companyId_approvalStatus_idx" ON "PurchaseDocument"("companyId", "approvalStatus");

-- AddForeignKey
ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
