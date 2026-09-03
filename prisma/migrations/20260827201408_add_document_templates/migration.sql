-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM ('SPONSOR_COMMITMENT_LETTER', 'CANDIDATE_CONTRACT');

-- CreateEnum
CREATE TYPE "CandidateDocumentType" AS ENUM ('CONTRACT_IMAGE', 'OTHER');

-- AlterTable
ALTER TABLE "CandidateDocument" ADD COLUMN     "documentType" "CandidateDocumentType" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "SponsorshipContract" ADD COLUMN     "agreementFileUrl" TEXT,
ADD COLUMN     "agreementGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "agreementSignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DocumentTemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_companyId_type_key" ON "DocumentTemplate"("companyId", "type");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
