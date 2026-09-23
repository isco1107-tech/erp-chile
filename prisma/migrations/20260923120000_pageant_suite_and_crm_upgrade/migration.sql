-- Suite de certámenes + CRM comercial para productoras de eventos.
--
-- 100% ADITIVA (ver CLAUDE.md §5 — la base local es la de producción):
-- tablas nuevas, columnas nuevas nullable o con DEFAULT, un valor de enum
-- nuevo y un índice único sobre columnas nuevas (todas NULL al aplicar).
-- Ningún DROP, ningún NOT NULL sobre columnas existentes: el código que hoy
-- corre en producción sigue funcionando con este esquema aplicado.
--
--   * Project: fecha de gala, recinto y micrositio público (/certamen/{slug}).
--   * Candidate: número oficial, a quién representa, bio pública y visibilidad.
--   * StageTimelineItem: tipo de segmento, pies técnicos y hora real (modo show).
--   * WardrobeItem: origen, talla, color, valor, prueba y devolución.
--   * SponsorshipPackage: tarifario de auspicios por certamen (cupos, beneficios).
--   * Opportunity: tipo de negocio, prioridad, certamen, plan, canje, etiquetas,
--     persona de contacto y contrato de auspicio resultante.
--   * CrmPerson: personas de contacto comercial.
--   * WorkflowTriggerEvent: CRM_LEAD_RECEIVED (formulario "Quiero auspiciar").


-- CreateEnum
CREATE TYPE "StageSegmentType" AS ENUM ('OPENING', 'PRESENTATION', 'SWIMSUIT', 'EVENING_GOWN', 'NATIONAL_COSTUME', 'QUESTION', 'ARTISTIC', 'SPONSOR', 'BREAK', 'CROWNING', 'OTHER');

-- CreateEnum
CREATE TYPE "WardrobeSource" AS ENUM ('PRODUCTION', 'DESIGNER', 'SPONSOR', 'RENTAL', 'CANDIDATE_OWN');

-- CreateEnum
CREATE TYPE "CrmDealType" AS ENUM ('SPONSORSHIP', 'EVENT_PRODUCTION', 'CORPORATE_TICKETS', 'TALENT_BOOKING', 'LICENSING', 'MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'CRM_LEAD_RECEIVED';

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "candidateNumber" INTEGER,
ADD COLUMN     "publicBio" TEXT,
ADD COLUMN     "representing" TEXT,
ADD COLUMN     "showOnPublicSite" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "barterDescription" TEXT,
ADD COLUMN     "barterValuation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dealType" "CrmDealType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "isBarter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "personId" TEXT,
ADD COLUMN     "priority" "CrmPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "sponsorshipContractId" TEXT,
ADD COLUMN     "sponsorshipTier" "SponsorshipTier",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "galaDate" TIMESTAMP(3),
ADD COLUMN     "instagramHandle" TEXT,
ADD COLUMN     "publicAccent" TEXT NOT NULL DEFAULT 'gold',
ADD COLUMN     "publicContactEmail" TEXT,
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publicSiteEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicSlug" TEXT,
ADD COLUMN     "publicTagline" TEXT,
ADD COLUMN     "showCandidatesPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showResultsPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showSponsorsPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showVoteRankingPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sponsorLeadFormEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "venueAddress" TEXT,
ADD COLUMN     "venueName" TEXT;

-- AlterTable
ALTER TABLE "SponsorshipContract" ADD COLUMN     "packageId" TEXT;

-- AlterTable
ALTER TABLE "StageTimelineItem" ADD COLUMN     "actualEndedAt" TIMESTAMP(3),
ADD COLUMN     "actualStartedAt" TIMESTAMP(3),
ADD COLUMN     "audioCue" TEXT,
ADD COLUMN     "lightingCue" TEXT,
ADD COLUMN     "responsible" TEXT,
ADD COLUMN     "segmentType" "StageSegmentType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "videoCue" TEXT;

-- AlterTable
ALTER TABLE "WardrobeItem" ADD COLUMN     "color" TEXT,
ADD COLUMN     "fittingAt" TIMESTAMP(3),
ADD COLUMN     "returnDueAt" TIMESTAMP(3),
ADD COLUMN     "size" TEXT,
ADD COLUMN     "source" "WardrobeSource" NOT NULL DEFAULT 'PRODUCTION',
ADD COLUMN     "valuation" INTEGER;

-- CreateTable
CREATE TABLE "SponsorshipPackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tier" "SponsorshipTier" NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "maxSlots" INTEGER,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "showPricePublic" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPerson" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "organizationName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "linkedinUrl" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SponsorshipPackage_companyId_projectId_idx" ON "SponsorshipPackage"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_contactId_idx" ON "CrmPerson"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_fullName_idx" ON "CrmPerson"("companyId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_projectId_candidateNumber_key" ON "Candidate"("projectId", "candidateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sponsorshipContractId_key" ON "Opportunity"("sponsorshipContractId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_projectId_idx" ON "Opportunity"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_dealType_idx" ON "Opportunity"("companyId", "dealType");

-- CreateIndex
CREATE INDEX "Opportunity_personId_idx" ON "Opportunity"("personId");

-- CreateIndex
CREATE INDEX "Opportunity_packageId_idx" ON "Opportunity"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_publicSlug_key" ON "Project"("publicSlug");

-- CreateIndex
CREATE INDEX "SponsorshipContract_packageId_idx" ON "SponsorshipContract"("packageId");

-- AddForeignKey
ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SponsorshipPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPackage" ADD CONSTRAINT "SponsorshipPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPackage" ADD CONSTRAINT "SponsorshipPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SponsorshipPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sponsorshipContractId_fkey" FOREIGN KEY ("sponsorshipContractId") REFERENCES "SponsorshipContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

