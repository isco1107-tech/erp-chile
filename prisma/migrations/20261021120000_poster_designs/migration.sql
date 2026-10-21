-- Diseños de afiche guardados en el estudio de afiches del certamen.
-- Tabla nueva, sin datos que migrar; repetirla no falla.
CREATE TABLE IF NOT EXISTS "PosterDesign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "piece" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "accent" TEXT,
    "candidateId" TEXT,
    "qr" BOOLEAN,
    "overrides" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosterDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosterDesign_companyId_projectId_idx" ON "PosterDesign"("companyId", "projectId");

DO $$ BEGIN
  ALTER TABLE "PosterDesign" ADD CONSTRAINT "PosterDesign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PosterDesign" ADD CONSTRAINT "PosterDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
