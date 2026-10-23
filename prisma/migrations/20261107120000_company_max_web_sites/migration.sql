-- Tope de sitios web por empresa, fijado desde la Supersuite (aditiva e idempotente).
-- El valor por omisión es el tope fijo que regía hasta ahora (30): ninguna empresa cambia de comportamiento.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "maxWebSites" INTEGER NOT NULL DEFAULT 30;
