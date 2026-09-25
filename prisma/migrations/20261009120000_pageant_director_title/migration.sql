-- Micrositio: "Director" o "Directora" en la sección "Conoce al director".
-- Aditiva y re-ejecutable.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "directorTitle" TEXT;
