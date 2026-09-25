-- Micrositio del certamen: sección "Conoce al Director" y nota para sponsors.
-- Aditiva y re-ejecutable (columnas nullable o con default, IF NOT EXISTS).
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorName" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorRole" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorBio" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorPhotoUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorHighlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sponsorExclusivityNote" TEXT;
