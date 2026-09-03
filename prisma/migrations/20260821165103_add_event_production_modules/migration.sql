-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SponsorshipTier" AS ENUM ('TITULAR_MAIN_SPONSOR', 'GOLD', 'SILVER', 'OFFICIAL_SPONSOR', 'MEDIA_PARTNER', 'CANJE_BARTER');

-- CreateEnum
CREATE TYPE "SponsorshipStatus" AS ENUM ('PROPOSAL', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('APPLICANT', 'OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasCandidates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasEventProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasFeeDocuments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSponsorships" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseDocument" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "TaxPeriod" ADD COLUMN     "honorariumRetentionAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetedIncome" INTEGER NOT NULL DEFAULT 0,
    "budgetedExpense" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tier" "SponsorshipTier" NOT NULL,
    "isBarter" BOOLEAN NOT NULL DEFAULT false,
    "cashAmount" INTEGER NOT NULL DEFAULT 0,
    "barterValuation" INTEGER NOT NULL DEFAULT 0,
    "barterDescription" TEXT,
    "status" "SponsorshipStatus" NOT NULL DEFAULT 'PROPOSAL',
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipDeliverable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "proofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ISSUED',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceDescription" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "retentionRateBps" INTEGER NOT NULL,
    "retentionAmount" INTEGER NOT NULL,
    "netToPay" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "rutClean" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "stageName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "dressSize" TEXT,
    "shoeSize" TEXT,
    "heightCm" INTEGER,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'APPLICANT',
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_companyId_status_idx" ON "Project"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- CreateIndex
CREATE INDEX "SponsorshipContract_companyId_projectId_idx" ON "SponsorshipContract"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SponsorshipContract_companyId_contactId_idx" ON "SponsorshipContract"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "SponsorshipContract_companyId_status_idx" ON "SponsorshipContract"("companyId", "status");

-- CreateIndex
CREATE INDEX "SponsorshipContract_companyId_paymentStatus_idx" ON "SponsorshipContract"("companyId", "paymentStatus");

-- CreateIndex
CREATE INDEX "SponsorshipDeliverable_companyId_contractId_idx" ON "SponsorshipDeliverable"("companyId", "contractId");

-- CreateIndex
CREATE INDEX "FeeDocument_companyId_projectId_idx" ON "FeeDocument"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "FeeDocument_companyId_status_idx" ON "FeeDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeeDocument_companyId_paymentStatus_idx" ON "FeeDocument"("companyId", "paymentStatus");

-- CreateIndex
CREATE INDEX "FeeDocument_companyId_issueDate_idx" ON "FeeDocument"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeeDocument_companyId_contactId_folioNumber_key" ON "FeeDocument"("companyId", "contactId", "folioNumber");

-- CreateIndex
CREATE INDEX "Candidate_companyId_projectId_status_idx" ON "Candidate"("companyId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_companyId_projectId_rutClean_key" ON "Candidate"("companyId", "projectId", "rutClean");

-- CreateIndex
CREATE INDEX "Payment_companyId_projectId_idx" ON "Payment"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "PurchaseDocument_companyId_projectId_idx" ON "PurchaseDocument"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SalesDocument_companyId_projectId_idx" ON "SalesDocument"("companyId", "projectId");

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipDeliverable" ADD CONSTRAINT "SponsorshipDeliverable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipDeliverable" ADD CONSTRAINT "SponsorshipDeliverable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SponsorshipContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDocument" ADD CONSTRAINT "FeeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDocument" ADD CONSTRAINT "FeeDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDocument" ADD CONSTRAINT "FeeDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
