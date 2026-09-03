-- CreateEnum
CREATE TYPE "BadgeBackgroundMode" AS ENUM ('COLOR', 'IMAGE');

-- CreateEnum
CREATE TYPE "BadgeImageDisplayMode" AS ENUM ('SOLID', 'WATERMARK');

-- AlterTable
ALTER TABLE "StaffAccreditation" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "BadgeTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "backgroundMode" "BadgeBackgroundMode" NOT NULL DEFAULT 'COLOR',
    "backgroundColor" TEXT NOT NULL DEFAULT '#1e3a5f',
    "backgroundImageUrl" TEXT,
    "imageDisplayMode" "BadgeImageDisplayMode" NOT NULL DEFAULT 'SOLID',
    "watermarkOpacityBps" INTEGER NOT NULL DEFAULT 2000,
    "accentColor" TEXT NOT NULL DEFAULT '#1e3a5f',
    "textColor" TEXT NOT NULL DEFAULT '#0f172a',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BadgeTemplate_companyId_projectId_idx" ON "BadgeTemplate"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "StaffAccreditation_templateId_idx" ON "StaffAccreditation"("templateId");

-- AddForeignKey
ALTER TABLE "BadgeTemplate" ADD CONSTRAINT "BadgeTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeTemplate" ADD CONSTRAINT "BadgeTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccreditation" ADD CONSTRAINT "StaffAccreditation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BadgeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
