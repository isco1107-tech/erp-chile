-- Requisitos de inscripción configurables por certamen (aditiva e idempotente).
-- `requireCandidateInstagram` parte en true: hasta hoy el formulario ya lo exigía.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "requireChileanNationality" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "requireCandidateInstagram" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "requireCandidatePhoto" BOOLEAN NOT NULL DEFAULT false;
