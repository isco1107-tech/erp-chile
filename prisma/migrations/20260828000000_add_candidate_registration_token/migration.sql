-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "candidateRegistrationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_candidateRegistrationToken_key" ON "Project"("candidateRegistrationToken");
