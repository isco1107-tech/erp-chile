-- Auditoría 2026-09-14, hallazgo N-15: los cobros de cuotas (PaymentPlan /
-- PaymentPlanInstallment, incluido el pago en línea vía Khipu), pagarés
-- (PromissoryNote) y auspicios (SponsorshipContract) no generaban un
-- `Payment` de tesorería, así que `getCashFlow` no los veía y la caja real
-- no cuadraba con lo cobrado. Estas columnas nullable dejan a `Payment`
-- vincularse al documento de origen que disparó el cobro.
--
-- 100% ADITIVA (ver CLAUDE.md §5): solo columnas nullable + FKs `SET NULL` +
-- índices nuevos sobre una tabla existente. Nada de NOT NULL ni DROP.

-- AlterTable
ALTER TABLE "Payment"
  ADD COLUMN "paymentPlanId" TEXT,
  ADD COLUMN "paymentPlanInstallmentId" TEXT,
  ADD COLUMN "promissoryNoteId" TEXT,
  ADD COLUMN "sponsorshipContractId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_companyId_paymentPlanId_idx" ON "Payment"("companyId", "paymentPlanId");

-- CreateIndex
CREATE INDEX "Payment_companyId_paymentPlanInstallmentId_idx" ON "Payment"("companyId", "paymentPlanInstallmentId");

-- CreateIndex
CREATE INDEX "Payment_companyId_promissoryNoteId_idx" ON "Payment"("companyId", "promissoryNoteId");

-- CreateIndex
CREATE INDEX "Payment_companyId_sponsorshipContractId_idx" ON "Payment"("companyId", "sponsorshipContractId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentPlanInstallmentId_fkey" FOREIGN KEY ("paymentPlanInstallmentId") REFERENCES "PaymentPlanInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_promissoryNoteId_fkey" FOREIGN KEY ("promissoryNoteId") REFERENCES "PromissoryNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sponsorshipContractId_fkey" FOREIGN KEY ("sponsorshipContractId") REFERENCES "SponsorshipContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
