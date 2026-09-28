-- Reparación del historial de migraciones (OP-11).
--
-- Estas 10 tablas y 4 enums existen en producción pero ninguna migración los
-- creaba (se crearon con `prisma db push`). Sin esto, una base nueva (CI,
-- staging, el entorno separado de OP-01) no se puede levantar con
-- `prisma migrate deploy`: la migración siguiente falla con
-- `relation "TicketSale" does not exist`.
--
-- Todo es idempotente: en producción, donde ya existen, no hace nada.
-- Definiciones tomadas del schema.prisma vigente; ninguna migración posterior
-- les agrega columnas. Los dos índices que 20260913120000 crea sin
-- IF NOT EXISTS quedan fuera a propósito para no romperla.


DO $$ BEGIN
  CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PromissoryNoteStatus" AS ENUM ('ACTIVE', 'PAID', 'PROTESTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentPlanFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TicketType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantityAvailable" INTEGER,
    "salesOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "quantity" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "qrCode" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VoteOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "voteCount" INTEGER NOT NULL,
    "pricePerVote" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CandidateSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityType" "CandidateActivityType" NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "customRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Budget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BudgetLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "candidateId" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "frequency" "PaymentPlanFrequency" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "penaltyBps" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentPlanInstallment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentPlanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "penaltyApplied" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlanInstallment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromissoryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "candidateId" TEXT,
    "amount" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "status" "PromissoryNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromissoryNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

CREATE INDEX IF NOT EXISTS "Budget_companyId_status_idx" ON "Budget"("companyId", "status");

CREATE INDEX IF NOT EXISTS "BudgetLine_companyId_budgetId_idx" ON "BudgetLine"("companyId", "budgetId");

CREATE INDEX IF NOT EXISTS "PromissoryNote_companyId_status_dueDate_idx" ON "PromissoryNote"("companyId", "status", "dueDate");

CREATE INDEX IF NOT EXISTS "PromissoryNote_companyId_contactId_idx" ON "PromissoryNote"("companyId", "contactId");

CREATE INDEX IF NOT EXISTS "PromissoryNote_companyId_candidateId_idx" ON "PromissoryNote"("companyId", "candidateId");

CREATE INDEX IF NOT EXISTS "PaymentPlan_companyId_status_idx" ON "PaymentPlan"("companyId", "status");

CREATE INDEX IF NOT EXISTS "PaymentPlan_companyId_contactId_idx" ON "PaymentPlan"("companyId", "contactId");

CREATE INDEX IF NOT EXISTS "PaymentPlan_companyId_candidateId_idx" ON "PaymentPlan"("companyId", "candidateId");

CREATE INDEX IF NOT EXISTS "PaymentPlanInstallment_companyId_paymentStatus_dueDate_idx" ON "PaymentPlanInstallment"("companyId", "paymentStatus", "dueDate");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentPlanInstallment_paymentPlanId_installmentNumber_key" ON "PaymentPlanInstallment"("paymentPlanId", "installmentNumber");

CREATE INDEX IF NOT EXISTS "CandidateSession_companyId_projectId_date_idx" ON "CandidateSession"("companyId", "projectId", "date");

CREATE INDEX IF NOT EXISTS "TicketType_companyId_projectId_idx" ON "TicketType"("companyId", "projectId");

CREATE UNIQUE INDEX IF NOT EXISTS "TicketSale_qrCode_key" ON "TicketSale"("qrCode");

CREATE INDEX IF NOT EXISTS "TicketSale_companyId_projectId_idx" ON "TicketSale"("companyId", "projectId");

CREATE INDEX IF NOT EXISTS "TicketSale_companyId_paymentStatus_idx" ON "TicketSale"("companyId", "paymentStatus");

CREATE INDEX IF NOT EXISTS "VoteOrder_companyId_projectId_idx" ON "VoteOrder"("companyId", "projectId");

CREATE INDEX IF NOT EXISTS "VoteOrder_companyId_candidateId_idx" ON "VoteOrder"("companyId", "candidateId");

CREATE INDEX IF NOT EXISTS "VoteOrder_companyId_paymentStatus_idx" ON "VoteOrder"("companyId", "paymentStatus");

DO $$ BEGIN
  ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Budget" ADD CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketSale" ADD CONSTRAINT "TicketSale_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoteOrder" ADD CONSTRAINT "VoteOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoteOrder" ADD CONSTRAINT "VoteOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoteOrder" ADD CONSTRAINT "VoteOrder_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
