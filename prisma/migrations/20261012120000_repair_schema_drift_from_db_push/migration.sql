-- Reparación del historial de migraciones (OP-11), segunda parte.
--
-- Columnas, valores de enum e índices que están en schema.prisma (y en
-- producción, donde se aplicaron con `prisma db push`) pero que ninguna
-- migración creaba. Generado con `prisma migrate diff` desde una base nueva
-- con todas las migraciones aplicadas hacia el schema vigente.
--
-- Todo es idempotente (IF NOT EXISTS / IF EXISTS / duplicate_object): en
-- producción, donde ya existe, no hace nada. Solo agrega; lo único que quita
-- es la unicidad vieja de ProcessedWebhookEvent (provider, eventId), que el
-- schema reemplazó por (provider, companyId, eventId) — más laxa, así que
-- crear la nueva no puede fallar por datos existentes.


DO $$ BEGIN
  CREATE TYPE "CandidateRegistrationStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOWNLOAD';

ALTER TYPE "CandidateActivityType" ADD VALUE IF NOT EXISTS 'EVENTO';

ALTER TYPE "CandidateDocumentType" ADD VALUE IF NOT EXISTS 'PHOTO_FACE';

ALTER TYPE "CandidateDocumentType" ADD VALUE IF NOT EXISTS 'PHOTO_FULL_BODY';

ALTER TYPE "CandidateDocumentType" ADD VALUE IF NOT EXISTS 'MEDICAL_CERTIFICATE';

ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';

ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'CALLED_TO_CASTING';

ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "InternalDocumentKind" ADD VALUE IF NOT EXISTS 'CANDIDATE_APPLICATION';

ALTER TYPE "SponsorshipTier" ADD VALUE IF NOT EXISTS 'COPPER';

ALTER TYPE "SponsorshipTier" ADD VALUE IF NOT EXISTS 'BRONZE';

DROP INDEX IF EXISTS "ProcessedWebhookEvent_provider_eventId_key";

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "aceptaMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "causaSocial" TEXT,
ADD COLUMN IF NOT EXISTS "comuna" TEXT,
ADD COLUMN IF NOT EXISTS "condicionesMedicas" TEXT,
ADD COLUMN IF NOT EXISTS "direccion" TEXT,
ADD COLUMN IF NOT EXISTS "employerAddress" TEXT,
ADD COLUMN IF NOT EXISTS "employerName" TEXT,
ADD COLUMN IF NOT EXISTS "employerRut" TEXT,
ADD COLUMN IF NOT EXISTS "experiencia" TEXT,
ADD COLUMN IF NOT EXISTS "folio" TEXT,
ADD COLUMN IF NOT EXISTS "idiomas" TEXT,
ADD COLUMN IF NOT EXISTS "instagram" TEXT,
ADD COLUMN IF NOT EXISTS "ipOrigen" TEXT,
ADD COLUMN IF NOT EXISTS "motivacion" TEXT,
ADD COLUMN IF NOT EXISTS "motivoDescarte" TEXT,
ADD COLUMN IF NOT EXISTS "ocupacion" TEXT,
ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

ALTER TABLE "CandidateAttendance" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

ALTER TABLE "CandidateDocument" ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER,
ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
ADD COLUMN IF NOT EXISTS "originalFileName" TEXT,
ADD COLUMN IF NOT EXISTS "sha256Hash" TEXT;

ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasBudgets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasInstallmentPlans" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasMultiCompany" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasPromissoryNotes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasPublicVoting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasTicketing" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "bankTransferInfo" TEXT,
ADD COLUMN IF NOT EXISTS "n8nWebhookSecret" TEXT;

ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "budgetLineId" TEXT;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "candidateProgramFee" INTEGER,
ADD COLUMN IF NOT EXISTS "franchiseCost" INTEGER,
ADD COLUMN IF NOT EXISTS "maxCandidates" INTEGER,
ADD COLUMN IF NOT EXISTS "minCandidateAge" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN IF NOT EXISTS "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "registrationStatus" "CandidateRegistrationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "ticketSalesToken" TEXT,
ADD COLUMN IF NOT EXISTS "voteSalesToken" TEXT;

CREATE INDEX IF NOT EXISTS "Candidate_companyId_comuna_idx" ON "Candidate"("companyId", "comuna");

CREATE INDEX IF NOT EXISTS "Candidate_companyId_createdAt_idx" ON "Candidate"("companyId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_companyId_folio_key" ON "Candidate"("companyId", "folio");

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateAttendance_sessionId_candidateId_key" ON "CandidateAttendance"("sessionId", "candidateId");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_n8nWebhookSecret_key" ON "CompanySettings"("n8nWebhookSecret");

CREATE INDEX IF NOT EXISTS "ConversationParticipant_userId_hiddenAt_idx" ON "ConversationParticipant"("userId", "hiddenAt");

CREATE INDEX IF NOT EXISTS "Payment_companyId_budgetLineId_idx" ON "Payment"("companyId", "budgetLineId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedWebhookEvent_provider_companyId_eventId_key" ON "ProcessedWebhookEvent"("provider", "companyId", "eventId");

CREATE UNIQUE INDEX IF NOT EXISTS "Project_ticketSalesToken_key" ON "Project"("ticketSalesToken");

CREATE UNIQUE INDEX IF NOT EXISTS "Project_voteSalesToken_key" ON "Project"("voteSalesToken");

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateAttendance" ADD CONSTRAINT "CandidateAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CandidateSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
