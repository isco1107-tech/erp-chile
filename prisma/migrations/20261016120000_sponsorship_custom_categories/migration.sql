
-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS     "sponsorshipCategoryId" TEXT;

-- AlterTable
ALTER TABLE "SponsorshipContract" ADD COLUMN IF NOT EXISTS     "categoryId" TEXT,
ALTER COLUMN "tier" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SponsorshipPackage" ADD COLUMN IF NOT EXISTS     "categoryId" TEXT,
ALTER COLUMN "tier" DROP NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SponsorshipCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SponsorshipCategory_companyId_projectId_idx" ON "SponsorshipCategory"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SponsorshipCategory_projectId_name_key" ON "SponsorshipCategory"("projectId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Opportunity_sponsorshipCategoryId_idx" ON "Opportunity"("sponsorshipCategoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SponsorshipContract_categoryId_idx" ON "SponsorshipContract"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SponsorshipPackage_categoryId_idx" ON "SponsorshipPackage"("categoryId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SponsorshipContract" ADD CONSTRAINT "SponsorshipContract_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SponsorshipCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SponsorshipPackage" ADD CONSTRAINT "SponsorshipPackage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SponsorshipCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SponsorshipCategory" ADD CONSTRAINT "SponsorshipCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SponsorshipCategory" ADD CONSTRAINT "SponsorshipCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sponsorshipCategoryId_fkey" FOREIGN KEY ("sponsorshipCategoryId") REFERENCES "SponsorshipCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

