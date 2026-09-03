-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN "calendarSyncToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_calendarSyncToken_key" ON "CompanySettings"("calendarSyncToken");
