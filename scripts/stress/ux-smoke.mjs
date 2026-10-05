/**
 * Recorrido de humo de las pantallas que tocó la auditoría de experiencia de
 * usuario (2026-10-05), con el navegador real contra `next start` y una base
 * LOCAL. Entra con una empresa grande (la de demo, con la carga de volumen) y
 * con una recién creada (vacía), visita cada pantalla, junta errores de la
 * consola / respuestas 5xx y deja capturas en `.stress-out/ux/` para
 * MIRARLAS, no solo confiar en el "pasó".
 *
 *   BASE_URL=http://localhost:3100 node scripts/stress/ux-smoke.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT = '.stress-out/ux';
mkdirSync(OUT, { recursive: true });

const ACCOUNTS = [
  {
    name: 'nueva',
    email: process.env.UX_NEW_EMAIL ?? 'nueva@prueba.local',
    password: process.env.UX_NEW_PASSWORD ?? 'NuevaEmpresa2026!',
    pages: ['/dashboard', '/dashboard/products', '/dashboard/contacts', '/dashboard/inventory', '/dashboard/sales/new', '/dashboard/pos', '/dashboard/hr', '/dashboard/hr/payroll', '/dashboard/accounting/journal', '/dashboard/ticketing', '/dashboard/treasury/cxc'],
  },
  {
    name: 'grande',
    email: process.env.UX_DEMO_EMAIL ?? 'admin@prueba.local',
    password: process.env.UX_DEMO_PASSWORD ?? 'DemoManual2026!',
    pages: ['/dashboard', '/dashboard/sales', '/dashboard/sales/new', '/dashboard/treasury/cxc', '/dashboard/treasury/cxp', '/dashboard/intelligence', '/dashboard/customer-care', '/dashboard/inventory', '/dashboard/products', '/dashboard/contacts', '/dashboard/settings/company'],
  },
];

const viewport = { width: 1366, height: 900 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const problems = [];

for (const account of ACCOUNTS) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let current = '';
  // Vercel Analytics (`/_vercel/insights`) solo existe desplegado: en local da 404 y no es un problema de la app.
  const isLocalNoise = (text) => /_vercel\/insights|status of 404 \(Not Found\)/.test(text);
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isLocalNoise(msg.text())) problems.push(`[${account.name}] ${current} consola: ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (error) => problems.push(`[${account.name}] ${current} excepción: ${String(error).slice(0, 200)}`));
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`[${account.name}] ${current} HTTP ${response.status()} ${response.url().slice(0, 120)}`);
  });

  await page.goto(`${BASE_URL}/login`);
  await page.locator('#username').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(() => problems.push(`[${account.name}] no pudo entrar`));

  for (const path of account.pages) {
    current = path;
    const started = Date.now();
    const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 60_000 }).catch((error) => {
      problems.push(`[${account.name}] ${path} no cargó: ${String(error).slice(0, 120)}`);
      return null;
    });
    const ms = Date.now() - started;
    // Cierra el asistente de configuración o el tour si se abrieron solos.
    for (const label of ['Cerrar', 'Omitir', 'Saltar', 'Ahora no']) {
      const button = page.getByRole('button', { name: label, exact: true }).first();
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) problems.push(`[${account.name}] ${path} desborda horizontalmente a ${viewport.width}px`);
    const file = `${OUT}/${account.name}${path.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${String(ms).padStart(6)} ms  ${response?.status() ?? '---'}  [${account.name}] ${path}`);
  }
  await context.close();
}

await browser.close();
console.log(problems.length === 0 ? '\nSin errores de consola, excepciones ni 5xx.' : `\nPROBLEMAS (${problems.length}):\n  ${problems.join('\n  ')}`);
process.exit(problems.length === 0 ? 0 : 1);
