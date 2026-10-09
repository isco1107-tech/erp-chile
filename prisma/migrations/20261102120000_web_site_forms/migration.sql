-- Sitios web: formularios a medida con destino en el ERP (aditiva e idempotente).
-- Un formulario puede no pedir correo (se responde por teléfono): el correo pasa a ser opcional.
ALTER TABLE "WebSiteMessage" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "WebSiteMessage"
  ADD COLUMN IF NOT EXISTS "formId" TEXT,
  ADD COLUMN IF NOT EXISTS "formTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" TEXT,
  ADD COLUMN IF NOT EXISTS "destination" TEXT,
  ADD COLUMN IF NOT EXISTS "tag" TEXT,
  ADD COLUMN IF NOT EXISTS "answers" JSONB,
  ADD COLUMN IF NOT EXISTS "routedKind" TEXT,
  ADD COLUMN IF NOT EXISTS "routedId" TEXT,
  ADD COLUMN IF NOT EXISTS "routedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "routeNote" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WebSiteMessage_companyId_createdAt_idx" ON "WebSiteMessage"("companyId", "createdAt");
