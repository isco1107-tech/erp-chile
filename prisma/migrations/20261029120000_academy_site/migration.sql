-- Micrositio público de la academia (aditiva e idempotente: solo una tabla nueva).
CREATE TABLE IF NOT EXISTS "AcademySite" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "heroImageUrl" TEXT,
  "whatsapp" TEXT,
  "contactEmail" TEXT,
  "instagramHandle" TEXT,
  "address" TEXT,
  "content" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademySite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademySite_companyId_key" ON "AcademySite"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademySite_slug_key" ON "AcademySite"("slug");

DO $$ BEGIN
  ALTER TABLE "AcademySite" ADD CONSTRAINT "AcademySite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
