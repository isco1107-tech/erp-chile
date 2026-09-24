-- Suite de integración del ERP: Tesorería única (cajas/bancos y todo movimiento
-- de dinero con su origen), contratos recurrentes, control de horas,
-- conciliación bancaria, API pública y cobro en línea de facturas.
--
-- 100% aditiva:
--   * tablas y enums nuevos;
--   * columnas nuevas nullable o con DEFAULT (CompanyFeatures, Payment,
--     PayrollPeriod, Payslip, TaxPeriod);
--   * valores nuevos de enum (JournalSourceType, WorkflowTriggerEvent);
--   * Payment.contactId pasa a admitir NULL (se relaja una restricción; el
--     código anterior nunca escribe NULL, así que sigue funcionando igual).
--     Su FK conserva ON DELETE RESTRICT.
-- Ningún DROP de columna ni de tabla, ningún NOT NULL sobre datos existentes.

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('FEE_DOCUMENT', 'EXPENSE_REPORT', 'PAYROLL_SALARIES', 'PAYROLL_CONTRIBUTIONS', 'INSTALLMENT', 'TICKET_SALE', 'VOTE_ORDER', 'SPONSORSHIP', 'PROMISSORY_NOTE', 'SERVICE_CONTRACT', 'BANK_STATEMENT', 'INVOICE_PAYMENT_LINK');

-- CreateEnum
CREATE TYPE "TreasuryAccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "BankStatementLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ServiceContractBillingStatus" AS ENUM ('GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'BILLED');

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'PAYROLL';
ALTER TYPE "JournalSourceType" ADD VALUE 'FEE_DOCUMENT';
ALTER TYPE "JournalSourceType" ADD VALUE 'EXPENSE_REPORT';

-- AlterEnum
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'PAYMENT_MADE';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'RECURRING_INVOICES_READY';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'RECURRING_BILLING_FAILED';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasBankReconciliation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasPublicApi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasServiceContracts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasTimesheets" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "description" TEXT,
ADD COLUMN     "source" "PaymentSource",
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "treasuryAccountId" TEXT,
ALTER COLUMN "contactId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "contributionsPaidAt" TIMESTAMP(3),
ADD COLUMN     "salariesPaidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "employeeSnapshot" JSONB;

-- AlterTable
ALTER TABLE "TaxPeriod" ADD COLUMN     "employeeIncomeTaxAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TreasuryAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TreasuryAccountType" NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ledgerAccountId" TEXT,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "paymentId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "dteType" "DteType" NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CREDITO_30',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "frequency" "BillingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "autoIssue" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContractLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContractBilling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "billingDate" TIMESTAMP(3) NOT NULL,
    "status" "ServiceContractBillingStatus" NOT NULL,
    "salesDocumentId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceContractBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "serviceContractId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRate" INTEGER NOT NULL DEFAULT 0,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
    "salesDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePaymentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesDocumentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "paymentUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "accessToken" TEXT NOT NULL,
    "paymentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryAccount_companyId_isActive_idx" ON "TreasuryAccount"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_companyId_name_key" ON "TreasuryAccount"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_paymentId_key" ON "BankStatementLine"("paymentId");

-- CreateIndex
CREATE INDEX "BankStatementLine_companyId_treasuryAccountId_status_date_idx" ON "BankStatementLine"("companyId", "treasuryAccountId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_companyId_treasuryAccountId_fingerprint_key" ON "BankStatementLine"("companyId", "treasuryAccountId", "fingerprint");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_status_nextBillingDate_idx" ON "ServiceContract"("companyId", "status", "nextBillingDate");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_contactId_idx" ON "ServiceContract"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "ServiceContractLine_companyId_contractId_idx" ON "ServiceContractLine"("companyId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContractBilling_salesDocumentId_key" ON "ServiceContractBilling"("salesDocumentId");

-- CreateIndex
CREATE INDEX "ServiceContractBilling_companyId_createdAt_idx" ON "ServiceContractBilling"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContractBilling_contractId_periodKey_key" ON "ServiceContractBilling"("contractId", "periodKey");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_date_idx" ON "TimeEntry"("companyId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_userId_date_idx" ON "TimeEntry"("companyId", "userId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_contactId_status_idx" ON "TimeEntry"("companyId", "contactId", "status");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_projectId_idx" ON "TimeEntry"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentLink_accessToken_key" ON "InvoicePaymentLink"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentLink_paymentId_key" ON "InvoicePaymentLink"("paymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentLink_companyId_salesDocumentId_idx" ON "InvoicePaymentLink"("companyId", "salesDocumentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentLink_companyId_status_idx" ON "InvoicePaymentLink"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentLink_provider_providerPaymentId_key" ON "InvoicePaymentLink"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_companyId_source_sourceId_idx" ON "Payment"("companyId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "Payment_companyId_treasuryAccountId_paymentDate_idx" ON "Payment"("companyId", "treasuryAccountId", "paymentDate");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractBilling" ADD CONSTRAINT "ServiceContractBilling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractBilling" ADD CONSTRAINT "ServiceContractBilling_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractBilling" ADD CONSTRAINT "ServiceContractBilling_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_serviceContractId_fkey" FOREIGN KEY ("serviceContractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentLink" ADD CONSTRAINT "InvoicePaymentLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentLink" ADD CONSTRAINT "InvoicePaymentLink_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
