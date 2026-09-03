-- CreateEnum
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('INFLOW', 'OUTFLOW');

-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "cashShiftId" TEXT;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "initialAmount" INTEGER NOT NULL,
    "expectedAmount" INTEGER,
    "actualAmount" INTEGER,
    "difference" INTEGER,
    "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingNotes" TEXT,
    "closingNotes" TEXT,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_companyId_idx" ON "CashRegister"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_companyId_name_key" ON "CashRegister"("companyId", "name");

-- CreateIndex
CREATE INDEX "CashShift_companyId_status_idx" ON "CashShift"("companyId", "status");

-- CreateIndex
CREATE INDEX "CashShift_companyId_cashRegisterId_openedAt_idx" ON "CashShift"("companyId", "cashRegisterId", "openedAt");

-- CreateIndex
CREATE INDEX "CashShift_userId_idx" ON "CashShift"("userId");

-- CreateIndex
CREATE INDEX "CashMovement_companyId_cashShiftId_idx" ON "CashMovement"("companyId", "cashShiftId");

-- CreateIndex
CREATE INDEX "SalesDocument_cashShiftId_idx" ON "SalesDocument"("cashShiftId");

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariantes del arqueo que Prisma no puede declarar (índices únicos parciales).
--
-- Dos turnos abiertos sobre la misma caja harían que el efectivo esperado sea
-- ambiguo: no habría forma de decir a qué turno pertenece cada venta. Y un mismo
-- usuario con dos turnos abiertos rompe el supuesto de "mi turno actual" sobre
-- el que se construye toda la pantalla del POS.
--
-- Va en la base y no solo en la Server Action porque dos clics simultáneos en
-- "Abrir caja" son un caso real en un mostrador, y la comprobación previa en
-- JavaScript no serializa nada.
CREATE UNIQUE INDEX "CashShift_one_open_per_register"
  ON "CashShift"("cashRegisterId")
  WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "CashShift_one_open_per_user"
  ON "CashShift"("userId")
  WHERE "status" = 'OPEN';
