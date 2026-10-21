-- Tarifario general de auspicios: un plan puede existir sin certamen.
-- Solo relaja una restricción (sin datos que migrar); repetirla no falla.
ALTER TABLE "SponsorshipPackage" ALTER COLUMN "projectId" DROP NOT NULL;
