-- CreateEnum
CREATE TYPE "WebSiteKind" AS ENUM ('LANDING', 'CORPORATE', 'PORTFOLIO', 'CATALOG', 'EVENT', 'PERSONAL', 'BLANK');

-- CreateEnum
CREATE TYPE "WebSiteMode" AS ENUM ('GUIDED', 'HTML');

-- CreateEnum
CREATE TYPE "WebSiteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'WEB_SITE_MESSAGE_RECEIVED';

-- AlterTable
ALTER TABLE "CompanyFeatures" ADD COLUMN     "hasWebSites" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WebSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "WebSiteKind" NOT NULL DEFAULT 'LANDING',
    "mode" "WebSiteMode" NOT NULL DEFAULT 'GUIDED',
    "status" "WebSiteStatus" NOT NULL DEFAULT 'DRAFT',
    "contactId" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "ogImageUrl" TEXT,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "draftBlocks" JSONB NOT NULL DEFAULT '[]',
    "publishedBlocks" JSONB,
    "publishedTheme" JSONB,
    "draftHtml" TEXT,
    "publishedHtml" TEXT,
    "publishedAt" TIMESTAMP(3),
    "customDomain" TEXT,
    "customDomainVerifiedAt" TIMESTAMP(3),
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSiteAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "alt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSiteAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSiteMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSiteMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebSite_slug_key" ON "WebSite"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WebSite_customDomain_key" ON "WebSite"("customDomain");

-- CreateIndex
CREATE INDEX "WebSite_companyId_status_idx" ON "WebSite"("companyId", "status");

-- CreateIndex
CREATE INDEX "WebSite_companyId_contactId_idx" ON "WebSite"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "WebSiteAsset_companyId_siteId_idx" ON "WebSiteAsset"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "WebSiteMessage_companyId_siteId_createdAt_idx" ON "WebSiteMessage"("companyId", "siteId", "createdAt");

-- CreateIndex
CREATE INDEX "WebSiteMessage_companyId_readAt_idx" ON "WebSiteMessage"("companyId", "readAt");

-- AddForeignKey
ALTER TABLE "WebSite" ADD CONSTRAINT "WebSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSite" ADD CONSTRAINT "WebSite_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSiteAsset" ADD CONSTRAINT "WebSiteAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSiteAsset" ADD CONSTRAINT "WebSiteAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSiteMessage" ADD CONSTRAINT "WebSiteMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSiteMessage" ADD CONSTRAINT "WebSiteMessage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
