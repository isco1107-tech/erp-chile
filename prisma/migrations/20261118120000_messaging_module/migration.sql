-- La mensajería interna pasa a ser un módulo de pago (`hasMessaging`).
ALTER TABLE "CompanyFeatures" ADD COLUMN IF NOT EXISTS "hasMessaging" BOOLEAN NOT NULL DEFAULT false;

-- Las empresas que ya conversan por el chat la conservan: no se les corta un
-- servicio que usan. El resto queda apagada y la enciende la Supersuite.
UPDATE "CompanyFeatures"
SET "hasMessaging" = true
WHERE "companyId" IN (SELECT DISTINCT "companyId" FROM "Conversation");
