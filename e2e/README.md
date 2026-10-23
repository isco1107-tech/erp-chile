# Recorridos E2E (Playwright)

Corren contra la app compilada y una base PostgreSQL **propia**, nunca contra
la `DATABASE_URL` del `.env` (es la de producción, ver CLAUDE.md §5).

En CI (`.github/workflows/ci.yml`, job `e2e`) todo esto es automático. En local:

```bash
# 1. Base vacía propia (ejemplo con un Postgres local)
createdb erp_e2e
export DATABASE_URL=postgresql://usuario:clave@localhost:5432/erp_e2e
export JWT_SECRET=cualquier-valor-largo-de-prueba
export SEED_ADMIN_PASSWORD=una-clave-de-prueba

# 2. Migraciones desde cero + datos mínimos
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 3. Compilar y correr
npm run build
npm run test:e2e
```

- `E2E_BASE_URL`: probar contra una app ya levantada (no arranca `next start`).
- `E2E_CHROMIUM_PATH`: usar un Chromium ya instalado en vez de `npx playwright install`.

Qué cubren:
- `public.spec.ts`: ingreso, redirección sin sesión, contraseña incorrecta, rutas públicas.
- `dashboard-routes.spec.ts`: cada pantalla del menú (leída de `workspace-nav.ts`)
  carga sin 5xx, sin la pantalla "Algo salió mal" y sin errores de JavaScript,
  con la empresa de prueba recién creada. Una pantalla nueva en el menú entra sola.
- `bodega-api.spec.ts`, `bodega-barcode.spec.ts`, `bodega-photo.spec.ts`: la app del
  bodeguero (`/bodega`) en un celular emulado. La API (sin sesión → 401 en JSON,
  idempotencia, rechazos), la lectura de un EAN-13 con una **cámara falsa**
  (`fake-camera.ts` dibuja el código en un video Y4M que Chromium reproduce en
  bucle) y los flujos con foto con la IA **simulada** (`page.route`): una prueba
  de punta a punta no debe depender de una llave de Gemini. Crean sus productos
  por la propia API con claves fijas, así que se pueden repetir contra la misma base.
