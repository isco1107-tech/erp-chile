import { defineConfig, devices } from '@playwright/test';

/**
 * Recorridos de punta a punta (OP-11 / UX-14) contra la app compilada
 * (`next build` + `next start`) y una base PostgreSQL real con todas las
 * migraciones aplicadas desde cero. Nunca contra la base de producción: el
 * CI levanta una base efímera, y en local hay que apuntar DATABASE_URL a una
 * propia (ver e2e/README.md).
 *
 * Sin reintentos a propósito: un recorrido que falla a veces es un bug de
 * concurrencia o de datos, no ruido que haya que esconder.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
// `localhost` y no 127.0.0.1: la cookie de sesión es `secure` en producción
// y Chromium solo la acepta sin HTTPS cuando el host es localhost.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Para usar un Chromium ya instalado en vez de descargar el de esta
    // versión de Playwright (entornos sin salida a la red de descargas).
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
