-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "portalTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN     "portalTokenHash" TEXT;

-- CreateTable
CREATE TABLE "FixedAssetMaintenance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedAssetMaintenance_companyId_assetId_date_idx" ON "FixedAssetMaintenance"("companyId", "assetId", "date");

-- CreateIndex
CREATE INDEX "FixedAssetMaintenance_companyId_nextDueDate_idx" ON "FixedAssetMaintenance"("companyId", "nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_portalTokenHash_key" ON "Contact"("portalTokenHash");

-- AddForeignKey
ALTER TABLE "FixedAssetMaintenance" ADD CONSTRAINT "FixedAssetMaintenance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetMaintenance" ADD CONSTRAINT "FixedAssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

