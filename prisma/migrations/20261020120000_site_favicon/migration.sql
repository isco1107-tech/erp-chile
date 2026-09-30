-- Logo de la pestaña del navegador (favicon) editable por sitio: micrositio de certamen y sitio web.
-- Columnas nullable sin datos que migrar; repetirlas no falla.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "faviconUrl" TEXT;
ALTER TABLE "WebSite" ADD COLUMN IF NOT EXISTS "faviconUrl" TEXT;
