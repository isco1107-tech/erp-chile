-- Asistencia con QR: hora (de Chile, "HH:MM") desde la que quien escanea queda
-- «Atrasada». La elige la profesora al abrir el QR; NULL = nunca atrasada.
-- Aditiva e idempotente (la base es la de producción compartida): columna nullable.
ALTER TABLE "AcademyCheckInLink" ADD COLUMN IF NOT EXISTS "lateAfter" TEXT;
