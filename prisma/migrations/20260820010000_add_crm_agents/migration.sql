-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('CEO', 'CFO', 'COO', 'SALES');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DONE');

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasCrm" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTask_companyId_role_status_idx" ON "AgentTask"("companyId", "role", "status");

-- CreateIndex
CREATE INDEX "AgentRun_companyId_role_startedAt_idx" ON "AgentRun"("companyId", "role", "startedAt");

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
