ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CashMovement_companyId_idempotencyKey_key" ON "CashMovement"("companyId", "idempotencyKey");
