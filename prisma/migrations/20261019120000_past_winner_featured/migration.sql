-- Ganadoras anteriores: marca "reciente" (se muestra con foto completa).
-- La columna y su relleno inicial van en un solo bloque que corre UNA vez: si la
-- migración se repite, no pisa lo que el equipo ya eligió. El relleno deja como
-- recientes a las de la última edición de cada certamen (varias si empatan en año;
-- si ninguna tiene año, la primera que se cargó), que es lo que el sitio mostraba.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PastWinner' AND column_name = 'featured') THEN
    ALTER TABLE "PastWinner" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
    UPDATE "PastWinner" w SET "featured" = true
    WHERE (w."year" IS NOT NULL AND w."year" = (SELECT MAX(p."year") FROM "PastWinner" p WHERE p."projectId" = w."projectId"))
       OR (w."year" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "PastWinner" p WHERE p."projectId" = w."projectId" AND p."year" IS NOT NULL)
           AND w."createdAt" = (SELECT MIN(p."createdAt") FROM "PastWinner" p WHERE p."projectId" = w."projectId"));
  END IF;
END $$;
