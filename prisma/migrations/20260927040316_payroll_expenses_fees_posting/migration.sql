-- Auditoría 2026-09-27, hallazgo C-1: cerrar remuneraciones, reembolsar una
-- rendición de gastos y pagar una boleta de honorarios no generaban ningún
-- movimiento en Tesorería ni asiento contable. Aditiva: dos valores de enum
-- y una columna nullable con su FK (para trazar el Payment de una boleta
-- pagada). Los mapeos de cuenta nuevos se resuelven en código, sin tocar el
-- plan de cuentas de nadie — ver `resolveOrCreateMappedAccount` en
-- chart-of-accounts.ts.

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'PAYROLL_PERIOD';
ALTER TYPE "JournalSourceType" ADD VALUE 'EXPENSE_REPORT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "feeDocumentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_feeDocumentId_idx" ON "Payment"("feeDocumentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_feeDocumentId_fkey" FOREIGN KEY ("feeDocumentId") REFERENCES "FeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
