-- DropForeignKey
ALTER TABLE "CashShift" DROP CONSTRAINT "CashShift_userId_fkey";

-- AlterTable
ALTER TABLE "CashShift" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
