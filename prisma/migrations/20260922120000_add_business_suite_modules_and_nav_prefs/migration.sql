-- Suite de módulos nuevos + menú configurable por empresa.
--
-- 100% ADITIVA (ver CLAUDE.md §5 — la base local es la de producción):
-- tablas nuevas, columnas nuevas con DEFAULT y valores de enum nuevos.
-- Ningún DROP, ningún NOT NULL sobre columnas existentes: el código que
-- hoy corre en producción sigue funcionando con este esquema aplicado.
--
--   * CompanyFeatures: hasIntelligence, hasSalesPipeline, hasPayroll,
--     hasFixedAssets, hasExpenseReports (todos false: el superadmin los
--     prende a propósito, mismo criterio que el resto de módulos).
--   * CompanySettings.disabledNavItems: ítems del menú apagados por la empresa.
--   * CRM (Opportunity, CrmActivity), Remuneraciones (Employee,
--     PayrollPeriod, Payslip, LeaveRequest), Activo fijo (FixedAsset),
--     Rendición de gastos (ExpenseReport, ExpenseItem).
--   * WorkflowTriggerEvent: 4 disparadores nuevos para el motor de
--     automatizaciones.

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'TASK', 'NOTE');

-- CreateEnum
CREATE TYPE "EmploymentContractType" AS ENUM ('INDEFINIDO', 'PLAZO_FIJO', 'POR_OBRA');

-- CreateEnum
CREATE TYPE "HealthInsuranceType" AS ENUM ('FONASA', 'ISAPRE');

-- CreateEnum
CREATE TYPE "AfpInstitution" AS ENUM ('CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO');

-- CreateEnum
CREATE TYPE "GratificationMode" AS ENUM ('ART_50', 'NONE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK_LEAVE', 'PERSONAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('LINEAL', 'ACELERADA', 'SIN_DEPRECIACION');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "ExpenseReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED');

-- CreateEnum
CREATE TYPE "ExpenseDocumentType" AS ENUM ('BOLETA', 'FACTURA', 'TICKET', 'SIN_DOCUMENTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'OPPORTUNITY_WON';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'EXPENSE_REPORT_SUBMITTED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'LEAVE_REQUESTED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'PAYROLL_CLOSED';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasExpenseReports" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasFixedAssets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasIntelligence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasPayroll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSalesPipeline" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "disabledNavItems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contactId" TEXT,
    "prospectName" TEXT,
    "prospectEmail" TEXT,
    "prospectPhone" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 10,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'LEAD',
    "source" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "lostReason" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "CrmActivityType" NOT NULL,
    "summary" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "rutClean" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "address" TEXT,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "contractType" "EmploymentContractType" NOT NULL DEFAULT 'INDEFINIDO',
    "weeklyHours" INTEGER NOT NULL DEFAULT 42,
    "baseSalary" INTEGER NOT NULL,
    "gratificationMode" "GratificationMode" NOT NULL DEFAULT 'ART_50',
    "mealAllowance" INTEGER NOT NULL DEFAULT 0,
    "transportAllowance" INTEGER NOT NULL DEFAULT 0,
    "afp" "AfpInstitution" NOT NULL,
    "healthInsurance" "HealthInsuranceType" NOT NULL DEFAULT 'FONASA',
    "isapreName" TEXT,
    "isaprePlanUf" DOUBLE PRECISION,
    "bankName" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "ufValue" DOUBLE PRECISION NOT NULL,
    "utmValue" INTEGER NOT NULL,
    "minimumWage" INTEGER NOT NULL,
    "taxableCapUf" DOUBLE PRECISION NOT NULL,
    "unemploymentCapUf" DOUBLE PRECISION NOT NULL,
    "sisRateBps" INTEGER NOT NULL,
    "mutualRateBps" INTEGER NOT NULL,
    "employerPensionRateBps" INTEGER NOT NULL,
    "afpCommissionBps" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workedDays" INTEGER NOT NULL DEFAULT 30,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonuses" INTEGER NOT NULL DEFAULT 0,
    "advances" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "baseSalary" INTEGER NOT NULL,
    "gratification" INTEGER NOT NULL,
    "overtimeAmount" INTEGER NOT NULL,
    "taxableIncome" INTEGER NOT NULL,
    "mealAllowance" INTEGER NOT NULL,
    "transportAllowance" INTEGER NOT NULL,
    "pensionAmount" INTEGER NOT NULL,
    "healthAmount" INTEGER NOT NULL,
    "unemploymentEmployee" INTEGER NOT NULL,
    "taxBase" INTEGER NOT NULL,
    "incomeTax" INTEGER NOT NULL,
    "totalDeductions" INTEGER NOT NULL,
    "netPay" INTEGER NOT NULL,
    "employerSis" INTEGER NOT NULL,
    "employerUnemployment" INTEGER NOT NULL,
    "employerMutual" INTEGER NOT NULL,
    "employerPension" INTEGER NOT NULL,
    "employerCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "businessDays" INTEGER NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "responsible" TEXT,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "depreciationStartDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" INTEGER NOT NULL,
    "residualValue" INTEGER NOT NULL DEFAULT 1,
    "usefulLifeMonths" INTEGER NOT NULL,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'LINEAL',
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" TIMESTAMP(3),
    "disposalAmount" INTEGER,
    "supplierContactId" TEXT,
    "invoiceReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "status" "ExpenseReportStatus" NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "reimbursedAt" TIMESTAMP(3),
    "reimbursementReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "documentType" "ExpenseDocumentType" NOT NULL DEFAULT 'BOLETA',
    "documentNumber" TEXT,
    "supplierName" TEXT,
    "supplierRut" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_companyId_stage_idx" ON "Opportunity"("companyId", "stage");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_ownerUserId_idx" ON "Opportunity"("companyId", "ownerUserId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_contactId_idx" ON "Opportunity"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "CrmActivity_companyId_opportunityId_idx" ON "CrmActivity"("companyId", "opportunityId");

-- CreateIndex
CREATE INDEX "CrmActivity_companyId_completedAt_dueAt_idx" ON "CrmActivity"("companyId", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_rutClean_key" ON "Employee"("companyId", "rutClean");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_year_month_key" ON "PayrollPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "Payslip_companyId_periodId_idx" ON "Payslip"("companyId", "periodId");

-- CreateIndex
CREATE INDEX "Payslip_companyId_employeeId_idx" ON "Payslip"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_periodId_employeeId_key" ON "Payslip"("periodId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_status_idx" ON "LeaveRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_employeeId_idx" ON "LeaveRequest"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "FixedAsset_companyId_status_idx" ON "FixedAsset"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_companyId_code_key" ON "FixedAsset"("companyId", "code");

-- CreateIndex
CREATE INDEX "ExpenseReport_companyId_status_idx" ON "ExpenseReport"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExpenseReport_companyId_submittedByUserId_idx" ON "ExpenseReport"("companyId", "submittedByUserId");

-- CreateIndex
CREATE INDEX "ExpenseItem_companyId_reportId_idx" ON "ExpenseItem"("companyId", "reportId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

