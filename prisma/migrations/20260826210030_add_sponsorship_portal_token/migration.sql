-- AlterTable
ALTER TABLE "SponsorshipContract" ADD COLUMN     "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipContract_portalToken_key" ON "SponsorshipContract"("portalToken");
