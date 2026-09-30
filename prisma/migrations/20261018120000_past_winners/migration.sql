-- Salón de la fama del micrositio de certámenes: fotos de ganadoras anteriores.
-- Tabla nueva, sin datos que migrar; repetirla no falla.
CREATE TABLE IF NOT EXISTS "PastWinner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Ganadora',
    "year" INTEGER,
    "note" TEXT,
    "photoUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastWinner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PastWinner_companyId_projectId_idx" ON "PastWinner"("companyId", "projectId");

DO $$ BEGIN
  ALTER TABLE "PastWinner" ADD CONSTRAINT "PastWinner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PastWinner" ADD CONSTRAINT "PastWinner_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
