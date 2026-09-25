-- Tesorería · Ola 3: cuentas bancarias, cartolas y conciliación, cheques,
-- nóminas de pago a proveedores y cobranza automática. 100% aditiva: tablas
-- nuevas, columnas nullable o con default, e índices nuevos.
-- CreateEnum
CREATE TYPE "BankLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('RECEIVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PORTFOLIO', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentBatchStatus" AS ENUM ('DRAFT', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CollectionNoteKind" AS ENUM ('CALL', 'EMAIL', 'VISIT', 'WHATSAPP', 'PROMISE', 'NOTE');

-- AlterEnum
ALTER TYPE "InternalDocumentKind" ADD VALUE 'PAYMENT_BATCH';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "collectionReminderDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "collectionRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankAccountType" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "collectionRemindersPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentNoticeEmail" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "bankStatementLineId" TEXT;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "importedLines" INTEGER NOT NULL DEFAULT 0,
    "skippedLines" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "status" "BankLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "ignoredReason" TEXT,
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "number" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "drawerName" TEXT,
    "drawerRut" TEXT,
    "contactId" TEXT,
    "amount" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PORTFOLIO',
    "paymentId" TEXT,
    "bankAccountId" TEXT,
    "depositedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "status" "PaymentBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatchItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "purchaseDocumentId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "PaymentBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReminderLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesDocumentId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "sentTo" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "salesDocumentId" TEXT,
    "kind" "CollectionNoteKind" NOT NULL,
    "note" TEXT NOT NULL,
    "promiseDate" TIMESTAMP(3),
    "promiseAmount" INTEGER,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_companyId_isActive_idx" ON "BankAccount"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_companyId_bankCode_accountNumber_key" ON "BankAccount"("companyId", "bankCode", "accountNumber");

-- CreateIndex
CREATE INDEX "BankStatement_companyId_bankAccountId_idx" ON "BankStatement"("companyId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankStatementLine_companyId_bankAccountId_status_date_idx" ON "BankStatementLine"("companyId", "bankAccountId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_bankAccountId_fingerprint_key" ON "BankStatementLine"("bankAccountId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_paymentId_key" ON "Cheque"("paymentId");

-- CreateIndex
CREATE INDEX "Cheque_companyId_direction_status_dueDate_idx" ON "Cheque"("companyId", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentBatch_companyId_status_idx" ON "PaymentBatch"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_companyId_folio_key" ON "PaymentBatch"("companyId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchItem_paymentId_key" ON "PaymentBatchItem"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentBatchItem_companyId_batchId_idx" ON "PaymentBatchItem"("companyId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchItem_batchId_purchaseDocumentId_key" ON "PaymentBatchItem"("batchId", "purchaseDocumentId");

-- CreateIndex
CREATE INDEX "CollectionReminderLog_companyId_sentAt_idx" ON "CollectionReminderLog"("companyId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionReminderLog_salesDocumentId_stage_key" ON "CollectionReminderLog"("salesDocumentId", "stage");

-- CreateIndex
CREATE INDEX "CollectionNote_companyId_contactId_createdAt_idx" ON "CollectionNote"("companyId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_companyId_bankAccountId_idx" ON "Payment"("companyId", "bankAccountId");

-- CreateIndex
CREATE INDEX "Payment_bankStatementLineId_idx" ON "Payment"("bankStatementLineId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankStatementLineId_fkey" FOREIGN KEY ("bankStatementLineId") REFERENCES "BankStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_purchaseDocumentId_fkey" FOREIGN KEY ("purchaseDocumentId") REFERENCES "PurchaseDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderLog" ADD CONSTRAINT "CollectionReminderLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderLog" ADD CONSTRAINT "CollectionReminderLog_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReminderLog" ADD CONSTRAINT "CollectionReminderLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNote" ADD CONSTRAINT "CollectionNote_salesDocumentId_fkey" FOREIGN KEY ("salesDocumentId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

