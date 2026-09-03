-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CostBehavior" AS ENUM ('FIXED', 'VARIABLE', 'NONE');

-- CreateEnum
CREATE TYPE "CashFlowCategory" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'NONE');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('SALES_DOCUMENT', 'PURCHASE_DOCUMENT', 'PAYMENT', 'INVENTORY_MOVEMENT', 'CASH_SHIFT', 'MANUAL', 'OPENING', 'CLOSING');

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasAccounting" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "AccountType" NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "isPostable" BOOLEAN NOT NULL DEFAULT true,
    "isCurrent" BOOLEAN,
    "costBehavior" "CostBehavior" NOT NULL DEFAULT 'NONE',
    "cashFlowCategory" "CashFlowCategory" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntrySequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalEntrySequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "JournalSourceType" NOT NULL,
    "sourceId" TEXT,
    "reversalOfId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "productId" TEXT,
    "costCenterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_companyId_type_idx" ON "Account"("companyId", "type");

-- CreateIndex
CREATE INDEX "Account_companyId_parentId_idx" ON "Account"("companyId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");

-- CreateIndex
CREATE INDEX "AccountMapping_companyId_idx" ON "AccountMapping"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_companyId_key_key" ON "AccountMapping"("companyId", "key");

-- CreateIndex
CREATE INDEX "AccountingPeriod_companyId_status_idx" ON "AccountingPeriod"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_companyId_year_month_key" ON "AccountingPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntrySequence_companyId_year_key" ON "JournalEntrySequence"("companyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_status_idx" ON "JournalEntry"("companyId", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_sourceType_sourceId_idx" ON "JournalEntry"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_date_idx" ON "JournalEntry"("companyId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_periodId_idx" ON "JournalEntry"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_year_entryNumber_key" ON "JournalEntry"("companyId", "year", "entryNumber");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_entryId_idx" ON "JournalLine"("companyId", "entryId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_accountId_idx" ON "JournalLine"("companyId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_customerId_idx" ON "JournalLine"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_supplierId_idx" ON "JournalLine"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_costCenterId_idx" ON "JournalLine"("companyId", "costCenterId");

-- CreateIndex
CREATE INDEX "CostCenter_companyId_idx" ON "CostCenter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_companyId_code_key" ON "CostCenter"("companyId", "code");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntrySequence" ADD CONSTRAINT "JournalEntrySequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Invariantes contables forzados en base de datos (Fase B.2 de PROMPT_ERP_V2.md)
--
-- Prisma no puede expresar cuadratura entre filas, inmutabilidad condicional
-- ni "solo cuentas hoja". Se escriben a mano y viven en el motor, no en la
-- capa de aplicación: un bug de programación no debe poder dejar un asiento
-- descuadrado, editado o contabilizado contra una cuenta agrupadora.
-- ============================================================================

-- 1. Signos: nunca ambos, nunca negativos, nunca los dos en cero.
ALTER TABLE "JournalLine" ADD CONSTRAINT "chk_journal_line_debit_credit"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0) <> ("credit" = 0));

-- 2. Cuadratura de un asiento POSTED: suma(debit) = suma(credit).
--    Deferred a fin de transacción: durante la creación del asiento (varias
--    líneas insertadas una a una, y recién al final el estado pasa a POSTED)
--    el chequeo solo debe evaluarse una vez, con el estado final ya resuelto.
CREATE OR REPLACE FUNCTION accounting_check_entry_balance() RETURNS trigger AS $$
DECLARE
  v_entry_id TEXT;
  v_status "JournalEntryStatus";
  v_debit BIGINT;
  v_credit BIGINT;
BEGIN
  v_entry_id := COALESCE(NEW."entryId", OLD."entryId");

  SELECT "status" INTO v_status FROM "JournalEntry" WHERE id = v_entry_id;
  IF v_status IS NULL OR v_status != 'POSTED' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0) INTO v_debit, v_credit
  FROM "JournalLine" WHERE "entryId" = v_entry_id;

  IF v_debit != v_credit THEN
    RAISE EXCEPTION 'Asiento contable % descuadrado: debe=% haber=%', v_entry_id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "trg_journal_line_balance"
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting_check_entry_balance();

-- Cubre el caso donde un UPDATE toca solo JournalEntry.status (por ejemplo
-- `postEntry` sin insertar líneas nuevas en la misma sentencia): sin esto, el
-- trigger de arriba nunca dispararía porque no hay evento sobre JournalLine.
CREATE OR REPLACE FUNCTION accounting_check_entry_balance_on_post() RETURNS trigger AS $$
DECLARE
  v_debit BIGINT;
  v_credit BIGINT;
BEGIN
  IF NEW."status" != 'POSTED' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0) INTO v_debit, v_credit
  FROM "JournalLine" WHERE "entryId" = NEW.id;

  IF v_debit = 0 AND v_credit = 0 THEN
    RAISE EXCEPTION 'El asiento contable % no tiene líneas: no se puede contabilizar vacío', NEW.id;
  END IF;
  IF v_debit != v_credit THEN
    RAISE EXCEPTION 'Asiento contable % descuadrado al contabilizar: debe=% haber=%', NEW.id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "trg_journal_entry_balance_on_post"
  AFTER INSERT OR UPDATE OF "status" ON "JournalEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting_check_entry_balance_on_post();

-- 3. Inmutabilidad de JournalEntry: un asiento POSTED no se edita ni se
--    borra. La única transición permitida es POSTED -> REVERSED, y ni
--    siquiera esa transición puede tocar los campos de negocio del asiento.
CREATE OR REPLACE FUNCTION accounting_protect_posted_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'No se puede eliminar el asiento contable % (estado %)', OLD.id, OLD."status";
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'El asiento contable % ya fue reversado y no se puede modificar', OLD.id;
  END IF;

  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" NOT IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'El asiento contable % ya está contabilizado: no puede volver a DRAFT', OLD.id;
    END IF;
    IF NEW."date" IS DISTINCT FROM OLD."date"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."entryNumber" IS DISTINCT FROM OLD."entryNumber"
       OR NEW."year" IS DISTINCT FROM OLD."year"
       OR NEW."periodId" IS DISTINCT FROM OLD."periodId"
       OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
       OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
       OR NEW."companyId" IS DISTINCT FROM OLD."companyId" THEN
      RAISE EXCEPTION 'El asiento contable % ya está contabilizado y no se puede editar', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_journal_entry_immutable"
  BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION accounting_protect_posted_entry();

-- Líneas de un asiento POSTED o REVERSED: tampoco se editan ni se borran.
CREATE OR REPLACE FUNCTION accounting_protect_posted_lines() RETURNS trigger AS $$
DECLARE
  v_status "JournalEntryStatus";
BEGIN
  SELECT "status" INTO v_status FROM "JournalEntry" WHERE id = OLD."entryId";
  IF v_status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'La línea % pertenece a un asiento contabilizado (%) y no se puede modificar ni eliminar', OLD.id, v_status;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_journal_line_immutable"
  BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION accounting_protect_posted_lines();

-- 4. Solo cuentas hoja reciben líneas de asiento. De paso, defensa en
--    profundidad de aislamiento multi-tenant: la cuenta debe ser de la misma
--    empresa que la línea.
CREATE OR REPLACE FUNCTION accounting_check_postable_account() RETURNS trigger AS $$
DECLARE
  v_postable BOOLEAN;
  v_company_id TEXT;
BEGIN
  SELECT "isPostable", "companyId" INTO v_postable, v_company_id FROM "Account" WHERE id = NEW."accountId";
  IF v_postable IS NULL THEN
    RAISE EXCEPTION 'Cuenta % no existe', NEW."accountId";
  END IF;
  IF NOT v_postable THEN
    RAISE EXCEPTION 'La cuenta % es agrupadora (no posteable): no puede recibir líneas de asiento', NEW."accountId";
  END IF;
  IF v_company_id != NEW."companyId" THEN
    RAISE EXCEPTION 'La cuenta % pertenece a otra empresa', NEW."accountId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_journal_line_postable"
  BEFORE INSERT OR UPDATE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION accounting_check_postable_account();
