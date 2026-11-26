/**
 * Capturas de la demo de CR Producciones (datos SIMULADOS) contra la app local.
 *
 *   node scripts/demo-cr/capture.mjs <ids.json> <carpeta-salida> [explore|final] [filtro]
 *
 * `explore`: pantalla completa a 1x de todas las rutas, para revisar qué se ve.
 * `final`: capturas curadas a 2x. `filtro` = texto que debe contener el nombre.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const [idsFile, outDir, mode = 'final', filter = ''] = process.argv.slice(2);
if (!idsFile || !outDir) throw new Error('Uso: capture.mjs <ids.json> <salida> [explore|final] [filtro]');
const ids = JSON.parse(readFileSync(idsFile, 'utf8'));
const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';
const EMAIL = 'direccion@crproducciones.local';
const PASSWORD = 'DemoCR2026!';

const P = Object.fromEntries(ids.projects.map((p) => [p.code, p]));
const A = P['FIESTA-PRIMAVERA-TEMUCO'];
const B = P['REINA-VERANO-VILLARRICA-2027'];
const C = P['REINA-NIEVE-LONQUIMAY-2025'];
const finalist = ids.candidates.find((c) => c.candidateNumber === 1);
const goldContract = ids.contracts.find((c) => c.tier === 'GOLD');
const pasarela = ids.sessions.find((s) => s.activityType === 'PASARELA' && new Date(s.date) < new Date(Date.now() - 10 * 86400000));

/** [nombre, ruta, opciones]. `full`: página completa; `scrollReveal`: recorre la página para activar animaciones. */
const PANEL = [
  ['00-inicio', '/dashboard', { tall: true }],
  ['01-certamenes-lista', '/dashboard/projects', { tall: true }],
  ['02-centro-de-mando-fiesta', `/dashboard/projects/${A.id}`, { tall: true }],
  ['03-centro-de-mando-verano', `/dashboard/projects/${B.id}`, { tall: true }],
  ['04-centro-de-mando-nieve', `/dashboard/projects/${C.id}`, { tall: true }],
  ['05-sitio-publico-config', `/dashboard/projects/${A.id}/site`, { tall: true }],
  ['06-afiches-estudio', `/dashboard/projects/${A.id}/poster`, { tall: true }],
  ['10-candidatas-lista', '/dashboard/candidates', { tall: true }],
  ['11-candidata-ficha', `/dashboard/candidates/${finalist?.id}`, { tall: true }],
  ['12-casting', '/dashboard/candidates/casting', { tall: true }],
  ['13-asistencia', '/dashboard/candidates/attendance', { tall: true }],
  ['14-asistencia-sesion', `/dashboard/candidates/attendance/${pasarela?.id}`, { tall: true }],
  ['15-cumplimiento-candidatas', '/dashboard/candidates/compliance', { tall: true }],
  ['20-jurado-escrutinio', '/dashboard/judging', { tall: true }],
  ['30-produccion-en-vivo', '/dashboard/production', { tall: true }],
  ['31-escaleta', '/dashboard/production/timeline', { tall: true }],
  ['31b-escaleta-en-vivo', '/dashboard/production/timeline', { tall: true, only: 'live' }],
  ['31c-modo-show', '/dashboard/production/timeline', { click: 'Modo show', only: 'live' }],
  ['32-vestuario', '/dashboard/production/wardrobe', { tall: true }],
  ['33-acreditacion', '/dashboard/production/accreditation', { tall: true }],
  ['40-auspicios', '/dashboard/sponsorships', { tall: true }],
  ['41-auspicio-detalle', `/dashboard/sponsorships/${goldContract?.id}`, { tall: true }],
  ['42-auspicios-tarifario', '/dashboard/sponsorships/packages', { tall: true }],
  ['43-auspicios-cumplimiento', '/dashboard/sponsorships/compliance', { tall: true }],
  ['50-entradas', '/dashboard/ticketing', { tall: true }],
  ['51-votacion-publico', '/dashboard/voting', { tall: true }],
  ['60-crm-embudo', '/dashboard/crm', { tall: true }],
  ['61-crm-lista', '/dashboard/crm/list', { tall: true }],
  ['70-organigrama', '/dashboard/org-chart', { tall: true }],
  ['71-tareas', '/dashboard/tasks', { tall: true }],
  ['80-cuotas-candidatas', '/dashboard/payment-plans', { tall: true }],
  ['81-compras-gastos', '/dashboard/purchases', { tall: true }],
  ['82-honorarios', '/dashboard/fees', { tall: true }],
  ['83-presupuestos', '/dashboard/budgets', { tall: true }],
  ['84-tesoreria-cxc', '/dashboard/treasury/cxc', { tall: true }],
  ['85-calendario', '/dashboard/calendar', { tall: true }],
  ['86-reportes', '/dashboard/reports', { tall: true }],
];

const PUBLIC = [
  ['p0-sitio-fiesta', `/certamen/${A.publicSlug}`, { full: true, scrollReveal: true, d1: true, hero: true }],
  ['p1-sitio-verano', `/certamen/${B.publicSlug}`, { full: true, scrollReveal: true, d1: true, hero: true }],
  ['p2-sitio-nieve', `/certamen/${C.publicSlug}`, { full: true, scrollReveal: true, d1: true, hero: true }],
  ['p3-sitio-fiesta-movil', `/certamen/${A.publicSlug}`, { mobile: true, strip: 5 }],
  ['p4-entradas-publico', `/tickets/${A.ticketSalesToken}`, { tall: true }],
  ['p5-votar-publico', `/votar/${A.voteSalesToken}`, { tall: true }],
  ['p6-jurado-celular', `/judging/${ids.judges[0]?.accessToken}`, { mobile: true, strip: 2 }],
  ['p7-portal-auspiciador', `/sponsors/${ids.portalToken}`, { tall: true }],
];

async function hideNoise(page) {
  await page.addStyleTag({ content: 'nextjs-portal, [data-sonner-toaster], #__next-build-watcher { display: none !important; } *, *::before, *::after { content-visibility: visible !important; } .ws-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }' }).catch(() => {});
}

async function revealByScrolling(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = 300;
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByRole('button', { name: 'Entrar' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard**', { timeout: 90_000 });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.DEMO_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const common = { locale: 'es-CL', timezoneId: 'America/Santiago', bypassCSP: true, ignoreHTTPSErrors: true };
  const scale = mode === 'final' ? 2 : 1;
  const desktop = await browser.newContext({ ...common, viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale });
  const desktop1 = await browser.newContext({ ...common, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const mobile = await browser.newContext({ ...common, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const panelPage = await desktop.newPage();
  await login(panelPage);
  console.log('Sesión iniciada.');

  const all = [...PANEL.map((s) => ({ s, group: 'panel' })), ...PUBLIC.map((s) => ({ s, group: 'publico' }))];
  const report = [];
  for (const { s: [name, route, opts = {}], group } of all) {
    if (filter && !name.includes(filter)) continue;
    if (opts.only === 'live' && filter !== 'live' && !name.includes(filter)) continue;
    const dir = path.join(outDir, group);
    mkdirSync(dir, { recursive: true });
    const ctx = opts.mobile ? mobile : opts.d1 ? desktop1 : desktop;
    const page = group === 'panel' && !opts.mobile && !opts.d1 ? panelPage : await ctx.newPage();
    const started = Date.now();
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
      await page.waitForTimeout(group === 'panel' ? 1800 : 1200);
      await hideNoise(page);
      if (group === 'panel') {
        const chosen = await page.evaluate(() => {
          for (const sel of document.querySelectorAll('select')) {
            const opt = [...sel.options].find((o) => /Fiesta de la Primavera/.test(o.textContent || ''));
            if (opt && sel.value !== opt.value) {
              const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
              setter.call(sel, opt.value);
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        });
        if (chosen) await page.waitForTimeout(2200);
      }
      if (opts.click) {
        await page.getByRole('button', { name: opts.click }).first().click();
        await page.waitForTimeout(2000);
      }
      if (opts.scrollReveal) await revealByScrolling(page);
      const status = resp?.status() ?? 0;
      const title = await page.title();
      const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
      const suspicious = /Application error|This page could not be found|404|No tienes acceso|Algo salió mal|Error inesperado|Sin permiso/i.test(bodyText);
      const file = path.join(dir, `${name}.png`);
      if (opts.hero) await page.screenshot({ path: path.join(dir, `${name}-portada.png`) });
      if (opts.strip) {
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        const vh = page.viewportSize().height;
        const stops = Math.min(opts.strip, Math.max(1, Math.ceil(total / vh)));
        for (let i = 0; i < stops; i++) {
          const y = stops === 1 ? 0 : Math.round(((total - vh) * i) / (stops - 1));
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(600);
          await page.screenshot({ path: path.join(dir, `${name}-${i + 1}.png`) });
        }
      } else if (opts.tall) {
        // Ventana tan alta como el contenido: la barra lateral y el pie salen completos.
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: 1440, height: Math.min(Math.max(total, 900), 3200) });
        await page.waitForTimeout(900);
        await page.screenshot({ path: file });
        await page.setViewportSize({ width: 1440, height: 900 });
      } else {
        await page.screenshot({ path: file, fullPage: Boolean(opts.full) });
      }
      report.push({ name, route, status, title, suspicious, ms: Date.now() - started });
      console.log(`${suspicious ? '⚠' : '✓'} ${name}  [${status}] ${title}  (${Date.now() - started} ms)`);
    } catch (error) {
      report.push({ name, route, error: String(error).slice(0, 200) });
      console.log(`✗ ${name}  ${String(error).slice(0, 160)}`);
    } finally {
      if (page !== panelPage) await page.close();
    }
  }
  await browser.close();
  console.log('\nResumen:', report.filter((r) => r.error || r.suspicious || (r.status && r.status >= 400)).map((r) => r.name).join(', ') || 'sin problemas evidentes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
