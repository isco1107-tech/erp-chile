-- Backfill: DDL from "20260913120000_add_missing_indices_and_relations" was
-- recorded as applied in this database but never actually ran (drift
-- confirmed on 2026-09-21 via `prisma migrate diff --from-config-datasource
-- --to-schema prisma/schema.prisma --script` against the live Neon DB). That
-- migration file was left untouched on purpose -- editing SQL that is already
-- marked applied only hides the problem for anyone who replays history from
-- scratch. This migration re-applies exactly what was missing, guarded so it
-- is safe to run regardless of partial state.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentTask_approvedByUserId_idx" ON "AgentTask"("approvedByUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashMovement_userId_idx" ON "CashMovement"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TicketSale_companyId_ticketTypeId_idx" ON "TicketSale"("companyId", "ticketTypeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VoteOrder_companyId_candidateId_paymentStatus_idx" ON "VoteOrder"("companyId", "candidateId", "paymentStatus");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashMovement_userId_fkey') THEN
    ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentTask_approvedByUserId_fkey') THEN
    ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: integración API del SII por empresa (aditivo -- nullable / default).
-- siiApiKey/siiApiSecret llegan cifrados desde la aplicación (AES-256-GCM,
-- src/lib/sii/crypto.ts): nunca en texto plano en este esquema.
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "siiApiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "siiApiBaseUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "siiApiKey" TEXT,
  ADD COLUMN IF NOT EXISTS "siiApiSecret" TEXT;
