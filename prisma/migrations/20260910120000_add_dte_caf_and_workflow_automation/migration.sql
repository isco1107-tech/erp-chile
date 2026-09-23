-- CreateEnum
CREATE TYPE "CafStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SiiSubmissionStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'ACCEPTED_WITH_OBJECTIONS', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkflowTriggerEvent" AS ENUM ('SALE_ISSUED', 'SALE_CANCELLED', 'PURCHASE_PENDING_APPROVAL', 'STOCK_BELOW_MINIMUM', 'RECEIVABLE_OVERDUE', 'DTE_FOLIOS_LOW', 'CANDIDATE_REGISTERED', 'TICKET_PURCHASE_CONFIRMED', 'VOTE_ORDER_PAID', 'SPONSORSHIP_SIGNED');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('SEND_EMAIL', 'CREATE_NOTIFICATION', 'CALL_WEBHOOK');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('SUCCESS', 'PARTIAL_FAILURE', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowNotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "cafId" TEXT,
ADD COLUMN     "signedXml" TEXT,
ADD COLUMN     "siiStatus" "SiiSubmissionStatus",
ADD COLUMN     "siiStatusAt" TIMESTAMP(3),
ADD COLUMN     "siiStatusDetail" TEXT,
ADD COLUMN     "siiTrackId" TEXT,
ADD COLUMN     "tedXml" TEXT;

-- CreateTable
CREATE TABLE "DteCaf" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dteType" "DteType" NOT NULL,
    "siiCode" INTEGER NOT NULL,
    "rangeFrom" INTEGER NOT NULL,
    "rangeTo" INTEGER NOT NULL,
    "lastAssignedFolio" INTEGER NOT NULL DEFAULT 0,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "status" "CafStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedXml" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DteCaf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "WorkflowTriggerEvent" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signingSecret" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT,
    "trigger" "WorkflowTriggerEvent" NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL,
    "eventPayload" JSONB NOT NULL,
    "actionResults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowNotification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT,
    "severity" "WorkflowNotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DteCaf_companyId_dteType_status_idx" ON "DteCaf"("companyId", "dteType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DteCaf_companyId_dteType_rangeFrom_key" ON "DteCaf"("companyId", "dteType", "rangeFrom");

-- CreateIndex
CREATE INDEX "WorkflowRule_companyId_trigger_isActive_idx" ON "WorkflowRule"("companyId", "trigger", "isActive");

-- CreateIndex
CREATE INDEX "WorkflowExecution_companyId_ruleId_createdAt_idx" ON "WorkflowExecution"("companyId", "ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowNotification_companyId_readAt_createdAt_idx" ON "WorkflowNotification"("companyId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_cafId_fkey" FOREIGN KEY ("cafId") REFERENCES "DteCaf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DteCaf" ADD CONSTRAINT "DteCaf_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DteCaf" ADD CONSTRAINT "DteCaf_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRule" ADD CONSTRAINT "WorkflowRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRule" ADD CONSTRAINT "WorkflowRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNotification" ADD CONSTRAINT "WorkflowNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNotification" ADD CONSTRAINT "WorkflowNotification_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

