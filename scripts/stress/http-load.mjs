/**
 * Carga HTTP de extremo a extremo: N usuarios simultáneos, con sesión
 * iniciada, piden en bucle las pantallas más usadas del panel durante
 * DURATION segundos contra `next start` (base LOCAL, idealmente detrás de
 * `latency-proxy.mjs` para parecerse a producción). Mide p50/p95/p99, tasa de
 * error y respuestas lentas por ruta.
 *
 *   BASE_URL=http://localhost:3100 USERS=20 DURATION=60 node scripts/stress/http-load.mjs
 *
 * Un solo proceso `next start` con el pool de Prisma de 5 conexiones equivale
 * a UNA instancia serverless: lo que se mide es cuánto aguanta cada instancia
 * antes de que las peticiones empiecen a esperar conexión.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const USERS = Number(process.env.USERS ?? 20);
const DURATION = Number(process.env.DURATION ?? 60);
const EMAIL = process.env.LOAD_EMAIL ?? 'admin@prueba.local';
const PASSWORD = process.env.LOAD_PASSWORD ?? 'DemoManual2026!';
const ROUTES = (process.env.ROUTES ?? '/dashboard,/dashboard/sales,/dashboard/products,/dashboard/contacts,/dashboard/treasury/cxc,/dashboard/inventory').split(',');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

// Sesión real: se inicia con el formulario y se reusan sus cookies.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${BASE_URL}/login`);
await page.locator('#username').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
await browser.close();

const results = new Map(ROUTES.map((route) => [route, { times: [], errors: 0, statuses: {} }]));
const deadline = Date.now() + DURATION * 1000;

async function virtualUser(index) {
  let step = index;
  while (Date.now() < deadline) {
    const route = ROUTES[step++ % ROUTES.length];
    const bucket = results.get(route);
    const started = performance.now();
    try {
      const response = await fetch(`${BASE_URL}${route}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      await response.arrayBuffer();
      bucket.statuses[response.status] = (bucket.statuses[response.status] ?? 0) + 1;
      if (response.status >= 400 || response.status === 307) bucket.errors += 1;
    } catch {
      bucket.errors += 1;
      bucket.statuses.timeout = (bucket.statuses.timeout ?? 0) + 1;
    }
    bucket.times.push(performance.now() - started);
  }
}

console.log(`Carga HTTP: ${USERS} usuarios × ${DURATION} s contra ${BASE_URL}`);
const started = Date.now();
await Promise.all(Array.from({ length: USERS }, (_, index) => virtualUser(index)));
const elapsed = (Date.now() - started) / 1000;

const report = [];
let total = 0;
for (const [route, bucket] of results) {
  const sorted = [...bucket.times].sort((a, b) => a - b);
  total += sorted.length;
  const row = {
    route,
    requests: sorted.length,
    errors: bucket.errors,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    statuses: bucket.statuses,
  };
  report.push(row);
  console.log(`${route.padEnd(28)} ${String(row.requests).padStart(5)} pet. · p50 ${String(row.p50).padStart(5)} ms · p95 ${String(row.p95).padStart(5)} ms · p99 ${String(row.p99).padStart(5)} ms · errores ${row.errors} ${JSON.stringify(row.statuses)}`);
}
console.log(`Total ${total} peticiones en ${elapsed.toFixed(0)} s = ${(total / elapsed).toFixed(1)} pet./s`);
mkdirSync('.stress-out', { recursive: true });
writeFileSync(`.stress-out/http-load-${USERS}u.json`, JSON.stringify({ users: USERS, duration: DURATION, report }, null, 2));
