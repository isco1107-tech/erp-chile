-- AlterTable
ALTER TABLE "Company" DROP COLUMN "brandColorHex",
ADD COLUMN     "brandPalette" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
