-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_planName_idx" ON "Company"("planName");

-- CreateIndex
CREATE INDEX "Invitation_customRoleId_idx" ON "Invitation"("customRoleId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
