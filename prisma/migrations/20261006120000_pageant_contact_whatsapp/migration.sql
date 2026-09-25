-- Contacto por certamen: WhatsApp que ven las postulantes y el público.
-- Aditiva y re-ejecutable (columna nullable, IF NOT EXISTS).
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "publicWhatsapp" TEXT;
