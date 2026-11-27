-- Paleta del micrositio del certamen: tres colores (fondo, acento y destaque) detectados de la
-- portada o elegidos a mano, con los que se pinta todo el sitio (JSON validado con Zod al guardar
-- y al leer; NULL o {} = sin paleta, vale el acento prediseñado).
-- Aditiva e idempotente (la base es la de producción compartida): columna nullable.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "publicPalette" JSONB;
