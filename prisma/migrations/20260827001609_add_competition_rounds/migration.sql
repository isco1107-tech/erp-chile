-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'READY', 'VOTING', 'VOTING_CLOSED', 'COMPLETED');

-- DropIndex
DROP INDEX "JudgingCategory_projectId_name_key";

-- AlterTable
ALTER TABLE "JudgingCategory" ADD COLUMN     "roundId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ScoreSheet" ADD COLUMN     "auditHash" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "roundId" TEXT NOT NULL,
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "CompetitionRound" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cutOffCount" INTEGER,
    "isFinalRound" BOOLEAN NOT NULL DEFAULT false,
    "status" "RoundStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundContestant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "finalScore" DOUBLE PRECISION,
    "rank" INTEGER,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundContestant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionRound_companyId_projectId_idx" ON "CompetitionRound"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionRound_projectId_order_key" ON "CompetitionRound"("projectId", "order");

-- CreateIndex
CREATE INDEX "RoundContestant_companyId_roundId_idx" ON "RoundContestant"("companyId", "roundId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundContestant_roundId_candidateId_key" ON "RoundContestant"("roundId", "candidateId");

-- CreateIndex
CREATE INDEX "JudgingCategory_companyId_roundId_idx" ON "JudgingCategory"("companyId", "roundId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgingCategory_roundId_name_key" ON "JudgingCategory"("roundId", "name");

-- CreateIndex
CREATE INDEX "ScoreSheet_companyId_roundId_idx" ON "ScoreSheet"("companyId", "roundId");

-- AddForeignKey
ALTER TABLE "JudgingCategory" ADD CONSTRAINT "JudgingCategory_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundContestant" ADD CONSTRAINT "RoundContestant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundContestant" ADD CONSTRAINT "RoundContestant_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundContestant" ADD CONSTRAINT "RoundContestant_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
