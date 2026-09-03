-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianRut" TEXT;

-- AlterTable
ALTER TABLE "CandidateDocument" ADD COLUMN     "zapsignDocToken" TEXT,
ADD COLUMN     "zapsignSignUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocument_zapsignDocToken_key" ON "CandidateDocument"("zapsignDocToken");
