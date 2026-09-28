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
E2E_DATABASE=1 npx tsx e2e/fixtures/seed-e2e.ts   # 2ª empresa + persona en ambas + POS con cajera y productos

# 3. Compilar y correr
npm run build
npm run test:e2e
```

- `E2E_BASE_URL`: probar contra una app ya levantada (no arranca `next start`).
- `E2E_CHROMIUM_PATH`: usar un Chromium ya instalado en vez de `npx playwright install`.

Qué cubren:
- `public.spec.ts`: ingreso, redirección sin sesión, contraseña incorrecta, rutas públicas.
- `multi-company.spec.ts`: elegir empresa al entrar, rol por empresa, cambio desde ⌘K y bloqueo
  de pestañas cuando otra cambia de empresa.
- `pos-offline.spec.ts`: modo sin conexión. El POS y la pantalla de contingencia abren sin red;
  una venta (comprobante provisorio) y una entrada de stock hechas sin conexión quedan registradas
  al volver la red; cerrar sesión borra las copias.
- `dashboard-routes.spec.ts`: cada pantalla del menú (leída de `workspace-nav.ts`)
  carga sin 5xx, sin la pantalla "Algo salió mal" y sin errores de JavaScript,
  con la empresa de prueba recién creada. Una pantalla nueva en el menú entra sola.
