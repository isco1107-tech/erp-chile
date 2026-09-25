-- Remuneraciones · Ola 4: préstamos y anticipos descontados en la
-- liquidación, finiquitos, mutual de la empresa, nacionalidad del trabajador
-- y portal del trabajador. 100% aditiva: tablas nuevas y columnas nullable o
-- con default.
-- CreateEnum
CREATE TYPE "EmployeeLoanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeAdvanceStatus" AS ENUM ('PENDING', 'DEDUCTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'FINAL', 'CANCELLED');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "payrollMutualCode" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "portalTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN     "portalTokenHash" TEXT;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "deductionDetail" JSONB,
ADD COLUMN     "loanDeduction" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "installments" INTEGER NOT NULL,
    "installmentAmount" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "status" "EmployeeLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "EmployeeAdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSettlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminationDate" TIMESTAMP(3) NOT NULL,
    "cause" TEXT NOT NULL,
    "noticeGiven" BOOLEAN NOT NULL DEFAULT true,
    "monthlySalary" INTEGER NOT NULL,
    "yearsOfService" INTEGER NOT NULL DEFAULT 0,
    "severanceAmount" INTEGER NOT NULL DEFAULT 0,
    "noticeIndemnity" INTEGER NOT NULL DEFAULT 0,
    "vacationBusinessDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vacationCalendarDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vacationAmount" INTEGER NOT NULL DEFAULT 0,
    "pendingSalary" INTEGER NOT NULL DEFAULT 0,
    "otherEarnings" INTEGER NOT NULL DEFAULT 0,
    "loanBalance" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeLoan_companyId_employeeId_status_idx" ON "EmployeeLoan"("companyId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_companyId_year_month_status_idx" ON "EmployeeAdvance"("companyId", "year", "month", "status");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_companyId_employeeId_idx" ON "EmployeeAdvance"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSettlement_companyId_employeeId_idx" ON "EmployeeSettlement"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_portalTokenHash_key" ON "Employee"("portalTokenHash");

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSettlement" ADD CONSTRAINT "EmployeeSettlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSettlement" ADD CONSTRAINT "EmployeeSettlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

