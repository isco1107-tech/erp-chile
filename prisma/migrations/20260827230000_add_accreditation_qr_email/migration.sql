-- AlterTable
ALTER TABLE "StaffAccreditation" ADD COLUMN     "email" TEXT,
ADD COLUMN     "qrEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "qrToken" TEXT;

-- Backfill: filas existentes no tienen qrToken (columna nueva), se les asigna
-- uno único antes de poder aplicar NOT NULL + UNIQUE.
UPDATE "StaffAccreditation" SET "qrToken" = md5(random()::text || clock_timestamp()::text || "id") WHERE "qrToken" IS NULL;

ALTER TABLE "StaffAccreditation" ALTER COLUMN "qrToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccreditation_qrToken_key" ON "StaffAccreditation"("qrToken");
