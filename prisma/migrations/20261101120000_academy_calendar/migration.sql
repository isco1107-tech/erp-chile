-- Academia: calendario de clases y material de estudio (aditiva e idempotente).
DO $$ BEGIN
  CREATE TYPE "AcademyMaterialKind" AS ENUM ('FILE', 'LINK');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AcademySession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyMaterial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "AcademyMaterialKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "lastSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyMaterial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AcademySession_companyId_date_idx" ON "AcademySession"("companyId", "date");
CREATE INDEX IF NOT EXISTS "AcademySession_seriesId_idx" ON "AcademySession"("seriesId");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademySession_groupId_date_key" ON "AcademySession"("groupId", "date");
CREATE INDEX IF NOT EXISTS "AcademyMaterial_companyId_groupId_createdAt_idx" ON "AcademyMaterial"("companyId", "groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "AcademyMaterial_sessionId_idx" ON "AcademyMaterial"("sessionId");

DO $$ BEGIN
  ALTER TABLE "AcademySession" ADD CONSTRAINT "AcademySession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademySession" ADD CONSTRAINT "AcademySession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyMaterial" ADD CONSTRAINT "AcademyMaterial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyMaterial" ADD CONSTRAINT "AcademyMaterial_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AcademyMaterial" ADD CONSTRAINT "AcademyMaterial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
