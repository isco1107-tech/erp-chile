-- Pago en línea de cuotas/mensualidades (portal /pagar/[token] + Khipu).
-- 100% aditiva: tablas nuevas, columnas nullable y un valor de enum nuevo.
-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "InternalDocumentKind" ADD VALUE 'INSTALLMENT_RECEIPT';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "installmentPortalToken" TEXT,
ADD COLUMN     "khipuApiCredential" TEXT;

-- CreateTable
CREATE TABLE "InstallmentPaymentOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentPlanId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "paymentUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payerName" TEXT NOT NULL,
    "payerEmail" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateRutClean" TEXT NOT NULL,
    "projectName" TEXT,
    "receiptNumber" INTEGER,
    "accessToken" TEXT NOT NULL,
    "providerReceiptUrl" TEXT,
    "payerBank" TEXT,
    "excessAmount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPaymentOrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "InstallmentPaymentOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPaymentOrder_accessToken_key" ON "InstallmentPaymentOrder"("accessToken");

-- CreateIndex
CREATE INDEX "InstallmentPaymentOrder_companyId_paymentPlanId_idx" ON "InstallmentPaymentOrder"("companyId", "paymentPlanId");

-- CreateIndex
CREATE INDEX "InstallmentPaymentOrder_companyId_status_idx" ON "InstallmentPaymentOrder"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPaymentOrder_provider_providerPaymentId_key" ON "InstallmentPaymentOrder"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPaymentOrder_companyId_receiptNumber_key" ON "InstallmentPaymentOrder"("companyId", "receiptNumber");

-- CreateIndex
CREATE INDEX "InstallmentPaymentOrderItem_companyId_installmentId_idx" ON "InstallmentPaymentOrderItem"("companyId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPaymentOrderItem_orderId_installmentId_key" ON "InstallmentPaymentOrderItem"("orderId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_installmentPortalToken_key" ON "CompanySettings"("installmentPortalToken");

-- AddForeignKey
ALTER TABLE "InstallmentPaymentOrder" ADD CONSTRAINT "InstallmentPaymentOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPaymentOrder" ADD CONSTRAINT "InstallmentPaymentOrder_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPaymentOrderItem" ADD CONSTRAINT "InstallmentPaymentOrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPaymentOrderItem" ADD CONSTRAINT "InstallmentPaymentOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "InstallmentPaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPaymentOrderItem" ADD CONSTRAINT "InstallmentPaymentOrderItem_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PaymentPlanInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

