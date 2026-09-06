/**
 * Genera las capturas de pantalla reales del Manual de Usuario. Corre UNA
 * VEZ a mano contra el servidor de desarrollo local (`npm run dev`), nunca
 * en producción — usa la empresa de demo creada por
 * `scripts/seed-manual-demo.ts`.
 *
 * Antes de correrlo: precalentar /login y /dashboard con una petición
 * simple (ej. `curl`) — la primera visita a una ruta compila en frío con
 * Turbopack y puede superar el timeout de navegación de Playwright.
 *
 * Uso: npx tsx scripts/capture-manual-screenshots.ts
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import { MANUAL_DEMO_ADMIN_EMAIL, MANUAL_DEMO_ADMIN_PASSWORD } from './manual-demo-constants';

const BASE_URL = process.env.MANUAL_SCREENSHOT_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.join(process.cwd(), 'public', 'manual', 'screenshots');

/** Oculta el overlay de desarrollo de Next.js (indicador de issues, devtools) — no debe salir en material de venta. */
async function hideDevOverlay(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  // El formulario usa @mantine/form (`form.onSubmit` intercepta el submit
  // nativo) — si se hace clic antes de que React hidrate, el navegador hace
  // un submit nativo (GET vacío, sin `preventDefault`) y la página solo
  // recarga /login sin loguear. Esperar a que el botón esté listo primero.
  await page.getByRole('button', { name: 'Entrar' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1_000);
  await page.fill('#username', MANUAL_DEMO_ADMIN_EMAIL);
  await page.fill('#password', MANUAL_DEMO_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

async function shoot(page: Page, route: string, filename: string) {
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await hideDevOverlay(page);
    await page.waitForTimeout(500); // deja asentar animaciones/toasts
    await page.screenshot({ path: path.join(OUT_DIR, filename) });
    console.log(`OK   ${filename}`);
  } catch (error) {
    console.log(`SKIP ${filename} —`, error instanceof Error ? error.message.split('\n')[0] : error);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await login(page);

  const targets: Array<{ route: string; file: string }> = [
    { route: '/dashboard', file: 'dashboard.png' },
    { route: '/dashboard/contacts', file: 'contacts.png' },
    { route: '/dashboard/settings', file: 'settings.png' },
    { route: '/dashboard/pos', file: 'pos.png' },
    { route: '/dashboard/products', file: 'inventory.png' },
    { route: '/dashboard/sales', file: 'sales.png' },
    { route: '/dashboard/purchases', file: 'purchases.png' },
    { route: '/dashboard/treasury/cxc', file: 'treasury.png' },
    { route: '/dashboard/agents', file: 'agents.png' },
    { route: '/dashboard/projects', file: 'projects.png' },
    { route: '/dashboard/sponsorships', file: 'sponsorships.png' },
    { route: '/dashboard/candidates', file: 'candidates.png' },
    { route: '/dashboard/payment-plans', file: 'payment-plans.png' },
  ];

  for (const target of targets) {
    await shoot(page, target.route, target.file);
  }

  await browser.close();
  console.log('Listo.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
