-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FollowUpReason" AS ENUM ('INACTIVE', 'POST_SALE', 'DETRACTOR', 'MANUAL');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'DONE', 'SKIPPED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProcedureCategory" AS ENUM ('OPERACION', 'CALIDAD', 'HIGIENE', 'VENTAS', 'ADMINISTRACION', 'INDUCCION');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProcedureStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InspectionKind" AS ENUM ('INCOMING', 'IN_PROCESS', 'FINISHED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InspectionStatus" AS ENUM ('PASSED', 'FAILED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TeamTaskStatus" AS ENUM ('TODO', 'DOING', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TeamTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TeamTaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DelegatedDecision" AS ENUM ('PURCHASE_APPROVAL', 'EXPENSE_APPROVAL', 'DISCOUNT', 'PRICE_CHANGE', 'REFUND', 'STOCK_ADJUSTMENT', 'SUPPLIER_PAYMENT', 'OTHER');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasCustomerCare" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasQuality" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasTeamTasks" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "acquisitionChannel" TEXT,
ADD COLUMN IF NOT EXISTS "acquisitionNote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerCareSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inactiveAfterDays" INTEGER NOT NULL DEFAULT 60,
    "deliveryLeadDays" INTEGER,
    "surveyIntro" TEXT,
    "followUpMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCareSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSurvey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "salesDocumentId" TEXT,
    "token" TEXT NOT NULL,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "csat" INTEGER,
    "nps" INTEGER,
    "deliveryOnTime" BOOLEAN,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerFollowUp" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reason" "FollowUpReason" NOT NULL DEFAULT 'MANUAL',
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "note" TEXT,
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "supplierType" TEXT NOT NULL DEFAULT 'PRODUCTOR',
    "suppliedProducts" TEXT,
    "certifications" TEXT,
    "isLocalProducer" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Procedure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ProcedureCategory" NOT NULL DEFAULT 'OPERACION',
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "reviewEveryDays" INTEGER,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcedureAck" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QualityTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InspectionKind" NOT NULL DEFAULT 'FINISHED',
    "parameters" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QualityInspection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT NOT NULL,
    "kind" "InspectionKind" NOT NULL,
    "productId" TEXT,
    "contactId" TEXT,
    "lotNumber" TEXT,
    "productionOrderId" TEXT,
    "parameters" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "status" "InspectionStatus" NOT NULL,
    "failedParameters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inspectorId" TEXT,
    "notes" TEXT,
    "correctiveAction" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeamTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TeamTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TeamTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT,
    "recurrence" "TeamTaskRecurrence" NOT NULL DEFAULT 'NONE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DelegationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "decision" "DelegatedDecision" NOT NULL,
    "title" TEXT NOT NULL,
    "delegateeId" TEXT,
    "delegateRole" "Role",
    "maxAmount" INTEGER,
    "maxPercent" INTEGER,
    "conditions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCareSettings_companyId_key" ON "CustomerCareSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSurvey_token_key" ON "CustomerSurvey"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSurvey_companyId_respondedAt_idx" ON "CustomerSurvey"("companyId", "respondedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSurvey_companyId_contactId_idx" ON "CustomerSurvey"("companyId", "contactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerFollowUp_companyId_status_dueDate_idx" ON "CustomerFollowUp"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerFollowUp_companyId_contactId_idx" ON "CustomerFollowUp"("companyId", "contactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSurvey_contactId_idx" ON "CustomerSurvey"("contactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerFollowUp_contactId_idx" ON "CustomerFollowUp"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProfile_contactId_key" ON "SupplierProfile"("contactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierProfile_companyId_isActive_idx" ON "SupplierProfile"("companyId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Procedure_companyId_status_category_idx" ON "Procedure"("companyId", "status", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcedureAck_companyId_userId_idx" ON "ProcedureAck"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProcedureAck_procedureId_userId_version_key" ON "ProcedureAck"("procedureId", "userId", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualityTemplate_companyId_isActive_idx" ON "QualityTemplate"("companyId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualityInspection_companyId_inspectedAt_idx" ON "QualityInspection"("companyId", "inspectedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualityInspection_companyId_contactId_idx" ON "QualityInspection"("companyId", "contactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualityInspection_companyId_lotNumber_idx" ON "QualityInspection"("companyId", "lotNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamTask_companyId_status_dueDate_idx" ON "TeamTask"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamTask_companyId_assigneeId_status_idx" ON "TeamTask"("companyId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DelegationRule_companyId_isActive_decision_idx" ON "DelegationRule"("companyId", "isActive", "decision");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerCareSettings" ADD CONSTRAINT "CustomerCareSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerSurvey" ADD CONSTRAINT "CustomerSurvey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerSurvey" ADD CONSTRAINT "CustomerSurvey_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProcedureAck" ADD CONSTRAINT "ProcedureAck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProcedureAck" ADD CONSTRAINT "ProcedureAck_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "QualityTemplate" ADD CONSTRAINT "QualityTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TeamTask" ADD CONSTRAINT "TeamTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DelegationRule" ADD CONSTRAINT "DelegationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

