-- Protección de datos personales (Ley 21.719): consentimiento registrado,
-- solicitudes de derechos del titular, registro de incidentes y token del
-- portal público. Aditiva: columnas nullable o con default, tablas nuevas.

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "privacyConsentAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "privacyPolicyVersion" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "privacyGuardianProvided" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "privacyPortalToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySettings_privacyPortalToken_key" ON "CompanySettings"("privacyPortalToken");

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'OPPOSITION', 'PORTABILITY', 'BLOCKING');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PrivacyIncidentStatus" AS ENUM ('OPEN', 'CONTAINED', 'CLOSED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterRutClean" TEXT,
    "details" TEXT,
    "source" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedUntil" TIMESTAMP(3),
    "extensionReason" TEXT,
    "identityVerifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PrivacyIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "status" "PrivacyIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "affectsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "affectsMinors" BOOLEAN NOT NULL DEFAULT false,
    "affectsEconomicData" BOOLEAN NOT NULL DEFAULT false,
    "recordsAffected" INTEGER,
    "containmentActions" TEXT,
    "agencyNotifiedAt" TIMESTAMP(3),
    "subjectsNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataSubjectRequest_companyId_status_dueAt_idx" ON "DataSubjectRequest"("companyId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "DataSubjectRequest_companyId_requesterEmail_idx" ON "DataSubjectRequest"("companyId", "requesterEmail");
CREATE INDEX IF NOT EXISTS "PrivacyIncident_companyId_status_idx" ON "PrivacyIncident"("companyId", "status");

DO $$ BEGIN
  ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PrivacyIncident" ADD CONSTRAINT "PrivacyIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
