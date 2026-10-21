/**
 * Genera las capturas de pantalla reales del Manual de Usuario: una por
 * sección (`public/manual/screenshots/<id-de-la-sección>.jpg`). Recorre
 * `MANUAL_SECTIONS` en vez de una lista a mano, así una sección nueva tiene
 * su captura al volver a correrlo (y `tests/manual-coverage.test.ts` falla si
 * falta alguna).
 *
 * Corre contra un servidor de desarrollo LOCAL con la empresa de demo:
 *
 *   1. Base local:  DATABASE_URL=postgresql://…@localhost/…  npx prisma migrate deploy
 *   2. Empresa:     npx tsx scripts/seed-manual-demo.ts
 *   3. Datos:       npx tsx --conditions=react-server scripts/seed-manual-demo-data.ts
 *   4. Servidor:    npx next dev -p 3000   (con la misma DATABASE_URL local)
 *   5. Capturas:    npx tsx scripts/capture-manual-screenshots.ts
 *
 * Nunca contra producción: el paso 3 se niega a correr si la base no es local.
 *
 * Opcional: `MANUAL_SCREENSHOT_ONLY=ventas-facturacion,cheques` para rehacer
 * solo algunas secciones.
 */
import 'dotenv/config';
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { MANUAL_SECTIONS, sectionScreenshot } from '../src/modules/manual/content';
import { MANUAL_DEMO_ADMIN_EMAIL, MANUAL_DEMO_ADMIN_PASSWORD } from './manual-demo-constants';

const BASE_URL = process.env.MANUAL_SCREENSHOT_BASE_URL ?? 'http://localhost:3000';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const VIEWPORT = { width: 1366, height: 854 };
const ONLY = new Set((process.env.MANUAL_SCREENSHOT_ONLY ?? '').split(',').map((id) => id.trim()).filter(Boolean));

/**
 * Pantalla a capturar cuando la ruta de la sección no es la más
 * representativa (el centro de mando de un certamen dice más que la lista).
 */
async function captureRoute(sectionId: string, defaultRoute: string, companyId: string): Promise<string> {
  const project = await prisma.project.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  switch (sectionId) {
    case 'certamenes':
      return project ? `/dashboard/projects/${project.id}` : defaultRoute;
    case 'sitio-publico':
      return project ? `/dashboard/projects/${project.id}/site` : defaultRoute;
    case 'tesoreria':
      return '/dashboard/treasury/cxc';
    case 'multiempresa':
    case 'listados':
      return '/dashboard/contacts';
    default:
      return defaultRoute;
  }
}

/** Oculta lo que no debe salir en un manual: overlay de desarrollo y avisos flotantes. */
async function hideNoise(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal, [data-sonner-toaster] { display: none !important; }' });
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 120_000 });
  // El formulario usa @mantine/form: si se hace clic antes de que React
  // hidrate, el navegador hace un submit nativo y solo recarga /login.
  await page.getByRole('button', { name: 'Entrar' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1_500);
  await page.fill('#username', MANUAL_DEMO_ADMIN_EMAIL);
  await page.fill('#password', MANUAL_DEMO_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: MANUAL_DEMO_ADMIN_EMAIL }, select: { id: true, companyId: true } });
  if (!owner?.companyId) throw new Error('Primero corre scripts/seed-manual-demo.ts');
  const companyId = owner.companyId;

  // `MANUAL_SCREENSHOT_CHROMIUM` permite usar un Chromium ya instalado cuando
  // la versión de Playwright del proyecto no coincide con la del sistema.
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.MANUAL_SCREENSHOT_CHROMIUM || undefined });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago' });
  // Sin tutoriales ni guía de configuración encima de la pantalla.
  await context.addInitScript(
    ({ userId, company }) => {
      try {
        window.localStorage.setItem(`tutorial-auto-off:${userId}`, '1');
        window.localStorage.setItem(`onboarding-dismissed:${company}`, '1');
      } catch {
        // sin storage: el tutorial podría abrirse; se cierra con Escape más abajo.
      }
    },
    { userId: owner.id, company: companyId }
  );
  const page = await context.newPage();
  await login(page);

  let ok = 0;
  const failed: string[] = [];
  for (const section of MANUAL_SECTIONS) {
    const screenshot = sectionScreenshot(section);
    if (!screenshot || (ONLY.size > 0 && !ONLY.has(section.id))) continue;
    const route = await captureRoute(section.id, section.route, companyId);
    const file = path.join(PUBLIC_DIR, screenshot);
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
      await hideNoise(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900); // deja asentar animaciones y gráficos
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      ok += 1;
      console.log(`OK   ${section.id.padEnd(26)} ${route}`);
    } catch (error) {
      failed.push(section.id);
      console.log(`FAIL ${section.id.padEnd(26)} ${route} — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }

  await browser.close();
  console.log(`Listo: ${ok} capturas${failed.length ? `, fallaron: ${failed.join(', ')}` : ''}.`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
