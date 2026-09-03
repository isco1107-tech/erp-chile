-- CreateEnum
CREATE TYPE "SponsorshipDeliverableType" AS ENUM ('MENCION', 'BACKSTAGE', 'PAUTA', 'OTRO');

-- CreateEnum
CREATE TYPE "CandidateActivityType" AS ENUM ('PASARELA', 'ORATORIA', 'ENSAYO', 'TALLER', 'OTRO');

-- CreateEnum
CREATE TYPE "CandidateDocumentStatus" AS ENUM ('PENDING', 'SIGNED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StageItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WardrobeStatus" AS ENUM ('PENDING', 'READY', 'ISSUED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AccreditationLevel" AS ENUM ('GENERAL', 'BACKSTAGE', 'VIP', 'STAFF');

-- CreateEnum
CREATE TYPE "ScoreSheetStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "DteType" ADD VALUE 'BOLETA_EXENTA_41';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasJudging" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasLiveProduction" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "SponsorshipDeliverable" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "type" "SponsorshipDeliverableType" NOT NULL DEFAULT 'OTRO';

-- CreateTable
CREATE TABLE "CandidateAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "activityType" "CandidateActivityType" NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "CandidateDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTimelineItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "blockOrder" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "StageItemStatus" NOT NULL DEFAULT 'PENDING',
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageTimelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WardrobeItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designer" TEXT,
    "stageTimelineItemId" TEXT,
    "candidateId" TEXT,
    "status" "WardrobeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAccreditation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization" TEXT,
    "accessLevel" "AccreditationLevel" NOT NULL DEFAULT 'GENERAL',
    "badgeCode" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgingCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weightBps" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 10,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "judgeName" TEXT NOT NULL,
    "judgeEmail" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSheet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "judgeAssignmentId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "ScoreSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateAttendance_companyId_candidateId_idx" ON "CandidateAttendance"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateDocument_companyId_candidateId_idx" ON "CandidateDocument"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "StageTimelineItem_companyId_projectId_idx" ON "StageTimelineItem"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTimelineItem_projectId_blockOrder_key" ON "StageTimelineItem"("projectId", "blockOrder");

-- CreateIndex
CREATE INDEX "WardrobeItem_companyId_projectId_idx" ON "WardrobeItem"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "WardrobeItem_companyId_stageTimelineItemId_idx" ON "WardrobeItem"("companyId", "stageTimelineItemId");

-- CreateIndex
CREATE INDEX "StaffAccreditation_companyId_projectId_idx" ON "StaffAccreditation"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccreditation_companyId_badgeCode_key" ON "StaffAccreditation"("companyId", "badgeCode");

-- CreateIndex
CREATE INDEX "JudgingCategory_companyId_projectId_idx" ON "JudgingCategory"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgingCategory_projectId_name_key" ON "JudgingCategory"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssignment_accessToken_key" ON "JudgeAssignment"("accessToken");

-- CreateIndex
CREATE INDEX "JudgeAssignment_companyId_projectId_idx" ON "JudgeAssignment"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "ScoreSheet_companyId_candidateId_idx" ON "ScoreSheet"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "ScoreSheet_companyId_categoryId_idx" ON "ScoreSheet"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreSheet_judgeAssignmentId_candidateId_categoryId_key" ON "ScoreSheet"("judgeAssignmentId", "candidateId", "categoryId");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_companyId_provider_idx" ON "ProcessedWebhookEvent"("companyId", "provider");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_createdAt_idx" ON "ProcessedWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhookEvent_provider_eventId_key" ON "ProcessedWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDocument_companyId_idempotencyKey_key" ON "SalesDocument"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CandidateAttendance" ADD CONSTRAINT "CandidateAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAttendance" ADD CONSTRAINT "CandidateAttendance_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTimelineItem" ADD CONSTRAINT "StageTimelineItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTimelineItem" ADD CONSTRAINT "StageTimelineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTimelineItem" ADD CONSTRAINT "StageTimelineItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_stageTimelineItemId_fkey" FOREIGN KEY ("stageTimelineItemId") REFERENCES "StageTimelineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardrobeItem" ADD CONSTRAINT "WardrobeItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccreditation" ADD CONSTRAINT "StaffAccreditation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccreditation" ADD CONSTRAINT "StaffAccreditation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgingCategory" ADD CONSTRAINT "JudgingCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgingCategory" ADD CONSTRAINT "JudgingCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssignment" ADD CONSTRAINT "JudgeAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_judgeAssignmentId_fkey" FOREIGN KEY ("judgeAssignmentId") REFERENCES "JudgeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "JudgingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
