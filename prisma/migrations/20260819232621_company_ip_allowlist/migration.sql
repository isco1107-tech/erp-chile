-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ipAllowlistEnabled" BOOLEAN NOT NULL DEFAULT false;
