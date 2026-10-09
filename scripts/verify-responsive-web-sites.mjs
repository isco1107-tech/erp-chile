#!/usr/bin/env node
/**
 * Verificador de responsividad del constructor de sitios web.
 *
 *   npm run verify:responsive:web-sites
 *   npm run verify:responsive:web-sites -- --only=portadas
 *   npm run verify:responsive:web-sites -- --device=iphone-se,desktop
 *
 * Igual que el de certámenes y el de la academia: renderiza el sitio REAL
 * (`SiteRenderer`, el mismo de producción, con Tailwind compilado desde el
 * código y las fuentes reales) con datos incómodos
 * (`scripts/responsive/web-sites-fixtures.ts`: CADA diseño de CADA tipo de
 * sección, estilos completos y sitios por rubro) en 13 pantallas, y falla si
 * algo desborda, se corta, parte una palabra o queda invisible. Además prueba
 * lo interactivo: pestañas, flechas del carrusel, comparador antes/después,
 * el formulario por pasos (no avanza sin lo obligatorio; completo, avanza),
 * preguntas y el menú del celular. Las fotos se sirven desde `https://img.test`
 * (imágenes generadas) y los iframes externos se responden vacíos: no usa red
 * de la app ni base de datos. Capturas y `report.html` quedan en
 * `.vercel/responsive-check-web-sites/`.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const collectProblems = require('./responsive/page-checks.cjs');

const root = process.cwd();
const out = path.join(root, '.vercel', 'responsive-check-web-sites');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

const DEVICES = [
  { id: 'galaxy-fold', label: 'Galaxy Fold plegado', width: 280, height: 653, mobile: true },
  { id: 'iphone-se-1', label: 'iPhone SE (1ª gen.)', width: 320, height: 568, mobile: true },
  { id: 'android-chico', label: 'Android chico', width: 360, height: 740, mobile: true },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, mobile: true },
  { id: 'iphone-15', label: 'iPhone 15', width: 390, height: 844, mobile: true },
  { id: 'iphone-max', label: 'iPhone Pro Max', width: 430, height: 932, mobile: true },
  { id: 'telefono-horizontal', label: 'Teléfono horizontal', width: 844, height: 390, mobile: true },
  { id: 'ipad-mini', label: 'iPad mini', width: 768, height: 1024, mobile: true },
  { id: 'ipad-pro', label: 'iPad Pro vertical', width: 1024, height: 1366, mobile: true },
  { id: 'notebook', label: 'Notebook', width: 1280, height: 720, mobile: false },
  { id: 'desktop', label: 'Escritorio', width: 1440, height: 900, mobile: false },
  { id: 'full-hd', label: 'Full HD', width: 1920, height: 1080, mobile: false },
  { id: 'ultra-ancho', label: 'Monitor ultra ancho', width: 2560, height: 1080, mobile: false },
];

// 1) Componentes reales empaquetados para el navegador. `next/font/google` necesita el compilador de Next:
//    se reemplaza por un cargador vacío y las fuentes reales se cargan abajo con @font-face.
const fontNames = [...fs.readFileSync(path.join(root, 'src/components/web-sites/site-fonts.ts'), 'utf8').matchAll(/^\s+([A-Z][A-Za-z_]+),$/gm)].map((m) => m[1]);
const stubs = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /^next\/font\/google$/ }, () => ({ path: 'fonts-stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `const f = () => ({ className: '', variable: '', style: {} });\n${fontNames.map((n) => `export const ${n} = f;`).join('\n')}`,
      loader: 'js',
    }));
  },
};
const browserBundle = path.join(out, 'web-sites-browser.js');
await esbuild.build({
  entryPoints: [path.join(root, 'scripts/responsive/web-sites-browser.tsx')],
  outfile: browserBundle,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  // `crypto.randomUUID` solo existe en contextos seguros (https); la página de prueba es about:blank.
  banner: { js: "var process={env:{}};if(!globalThis.crypto.randomUUID){globalThis.crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16));return Array.from(b,function(x){return x.toString(16).padStart(2,'0')}).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/,'$1-$2-$3-$4-')}}" },
  plugins: [stubs],
});
const browserScript = fs.readFileSync(browserBundle, 'utf8');

// 2) Tailwind compilado solo con las clases que usa el renderizador (mismo motor que el build).
const entryCss = `@import "tailwindcss" source(none);\n@source "${path.join(root, 'src/components/web-sites').replace(/\\/g, '/')}";\n`;
const tailwindCss = (await postcss([tailwind({ base: root })]).process(entryCss, { from: path.join(root, 'src/app/web-sites-check.css') })).css;

// 3) Fuentes reales (subconjunto latino), una sola vez.
const FAMILIES = {
  inter: 'Inter',
  poppins: 'Poppins',
  montserrat: 'Montserrat',
  nunito: 'Nunito',
  raleway: 'Raleway',
  'space-grotesk': 'Space Grotesk',
  josefin: 'Josefin Sans',
  oswald: 'Oswald',
  playfair: 'Playfair Display',
  lora: 'Lora',
  'dm-serif': 'DM Serif Display',
  'dm-sans': 'DM Sans',
  manrope: 'Manrope',
  outfit: 'Outfit',
  jakarta: 'Plus Jakarta Sans',
  'work-sans': 'Work Sans',
  rubik: 'Rubik',
  figtree: 'Figtree',
  quicksand: 'Quicksand',
  merriweather: 'Merriweather',
  'libre-baskerville': 'Libre Baskerville',
  'eb-garamond': 'EB Garamond',
  fraunces: 'Fraunces',
  cormorant: 'Cormorant Garamond',
  bebas: 'Bebas Neue',
  syne: 'Syne',
  unbounded: 'Unbounded',
  'instrument-serif': 'Instrument Serif',
  anton: 'Anton',
  cinzel: 'Cinzel',
  abril: 'Abril Fatface',
  caveat: 'Caveat',
  dancing: 'Dancing Script',
};
const SINGLE_WEIGHT = new Set(['Bebas Neue', 'Instrument Serif', 'Anton', 'Abril Fatface', 'DM Serif Display']);
async function loadFonts() {
  const cssPath = path.join(out, 'fonts', 'fonts.css');
  if (fs.existsSync(cssPath)) return fs.readFileSync(cssPath, 'utf8');
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  let result = '';
  let n = 0;
  const seen = new Map();
  for (const family of Object.values(FAMILIES)) {
    const spec = SINGLE_WEIGHT.has(family) ? family : `${family}:wght@400;500;700`;
    let css = '';
    try {
      css = execFileSync('curl', ['-sS', '-m', '30', '-A', ua, `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%20/g, '+')}&display=swap`], { encoding: 'utf8' });
    } catch {
      console.warn(`No se pudo bajar ${family}: se usa la de respaldo.`);
      continue;
    }
    for (const block of css.split('/* ').slice(1)) {
      if (!block.startsWith('latin */')) continue;
      const src = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
      if (!src) continue;
      // Una fuente variable devuelve el mismo archivo para cada grosor: se baja una vez.
      if (!seen.has(src)) {
        const file = path.join(out, 'fonts', `f${n++}.woff2`);
        execFileSync('curl', ['-sS', '-m', '60', '-o', file, src]);
        seen.set(src, `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`);
      }
      const data = seen.get(src);
      result += `@font-face${block.slice(block.indexOf('{') - 1).replace(/;\s*\}.*/s, ';}').replace(src, data)}\n`.replace('latin */', '');
    }
  }
  fs.writeFileSync(cssPath, result);
  return result;
}
const fontCss = await loadFonts();
const fontVars = Object.entries(FAMILIES)
  .map(([id, family]) => `--wsf-${id}:'${family}'`)
  .join(';');

// 4) Imágenes generadas (sin red): proporciones distintas para probar recortes.
const SVG = {
  'wide.svg': [1600, 900],
  'tall.svg': [900, 1200],
  'square.svg': [1000, 1000],
  'logo.svg': [480, 140],
};
const svgFor = (name) => {
  const [w, h] = SVG[name] ?? [800, 600];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6e8f"/><stop offset="1" stop-color="#d9a45b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${Math.min(w, h) * 0.18}" fill="#ffffff" fill-opacity=".35"/></svg>`;
};

function chromiumPath() {
  if (process.env.E2E_CHROMIUM_PATH) return process.env.E2E_CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      const exe = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });

const wrapper = `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${fontCss}
${tailwindCss}
:root{${fontVars}}
html,body{margin:0}
</style></head><body><div id="root"></div></body></html>`;

// Casos: los que exporta el paquete (se leen en un navegador para no duplicar la lista).
const probe = await browser.newPage();
await probe.setContent('<!doctype html><div id="root"></div>');
await probe.addScriptTag({ content: browserScript });
const allFixtures = await probe.evaluate(() => window.webSiteFixtures());
await probe.close();

// Admiten varios valores separados por coma: --only=venta,medios --device=galaxy-fold,desktop
const only = args.get('only')?.split(',');
const onlyDevice = args.get('device')?.split(',');
const fixtures = allFixtures.filter((n) => !only || only.includes(n));
const devices = DEVICES.filter((d) => !onlyDevice || onlyDevice.includes(d.id));
if (!fixtures.length || !devices.length) {
  console.error(`Nada que revisar: revisa --only (${allFixtures.join(', ')}) y --device`);
  process.exit(2);
}

const results = [];
const failures = [];
for (const name of fixtures) {
  for (const device of devices) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.mobile, hasTouch: device.mobile, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago' });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'img.test') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgFor(url.pathname.slice(1)) });
      if (url.protocol === 'data:' || url.protocol === 'about:') return route.continue();
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>externo</title>' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(wrapper, { waitUntil: 'load' });
    await page.addScriptTag({ content: browserScript });
    await page.evaluate((n) => window.mountWebSite(n), name);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    // Las fotos van con carga diferida: se fuerzan todas para medir con su tamaño real (con un tope de espera).
    await page.evaluate(async () => {
      const images = [...document.images];
      images.forEach((img) => {
        img.loading = 'eager';
      });
      const pending = images.filter((img) => !img.complete).map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }));
      await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, 4000))]);
    });
    const problems = await page.evaluate(collectProblems, '.ws-root');
    for (const message of errors) problems.push({ kind: 'error-js', detail: message });

    // Contenido que no puede quedar invisible.
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('main section [class]')]
        .filter((el) => !el.closest('[aria-hidden="true"], [hidden], .ws-marquee'))
        .filter((el) => el.getBoundingClientRect().height > 0 && (el.textContent ?? '').trim().length > 0 && Number(getComputedStyle(el).opacity) < 0.1)
        .map((el) => el.className.toString().split(' ').slice(0, 2).join('.'))
    );
    if (hidden.length) problems.push({ kind: 'contenido-invisible', detail: `Quedó invisible: ${[...new Set(hidden)].slice(0, 5).join(', ')}` });

    // Pestañas: la segunda se muestra al tocarla.
    const tab = page.getByRole('tab').nth(1);
    if (await tab.count()) {
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      const ok = await page.evaluate(() => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        const panel = selected && document.getElementById(selected.getAttribute('aria-controls') ?? '');
        return Boolean(panel && !panel.hidden && panel.getBoundingClientRect().height > 0);
      });
      if (!ok) problems.push({ kind: 'pestanas', detail: 'Al tocar una pestaña no se mostró su contenido' });
      const after = await page.evaluate(collectProblems, '.ws-root');
      for (const p of after) if (!problems.some((q) => q.detail === p.detail)) problems.push({ ...p, detail: `(con otra pestaña abierta) ${p.detail}` });
    }

    // Carrusel: la flecha «Siguiente» avanza de verdad. Se fija el botón y su
    // fila antes de tocar: un localizador se vuelve a resolver en cada uso y,
    // cuando la flecha queda desactivada al llegar al final, apuntaría a otro.
    const nextLocator = page.locator('button[aria-label="Siguiente"]:not([disabled])').first();
    const nextHandle = (await nextLocator.count()) > 0 ? await nextLocator.elementHandle() : null;
    if (nextHandle) {
      await nextHandle.scrollIntoViewIfNeeded();
      const regionHandle = await nextHandle.evaluateHandle((btn) => btn.parentElement?.previousElementSibling ?? null);
      const scrollOf = () => regionHandle.evaluate((el) => (el instanceof HTMLElement ? el.scrollLeft : null)).catch(() => null);
      const before = await scrollOf();
      await nextHandle.click();
      await page.waitForTimeout(900);
      const after = await scrollOf();
      if (before !== null && after !== null && after <= before) problems.push({ kind: 'carrusel-quieto', detail: 'La flecha «Siguiente» no avanzó el carrusel' });
    }

    // Comparador antes/después: el teclado mueve la línea.
    const range = page.locator('input.ws-ba-range').first();
    if (await range.count()) {
      await range.scrollIntoViewIfNeeded();
      await range.focus();
      await page.keyboard.press('ArrowRight');
      const value = await range.inputValue();
      if (value === '50') problems.push({ kind: 'comparador-quieto', detail: 'El comparador antes/después no responde al teclado' });
    }

    // Formulario por pasos: sin las respuestas obligatorias no avanza; completas, pasa al paso 2 sin desbordar.
    const stepped = page.locator('form:has(.ws-progress)').first();
    if (await stepped.count()) {
      await stepped.scrollIntoViewIfNeeded();
      const label = () => stepped.locator('[aria-live="polite"]').first().innerText().catch(() => '');
      await stepped.getByRole('button', { name: 'Siguiente' }).click();
      await page.waitForTimeout(50);
      if (!/^Paso 1 /i.test(await label())) problems.push({ kind: 'formulario-pasos', detail: 'El formulario por pasos avanzó sin las respuestas obligatorias' });
      const step = stepped.locator('div.grid:not([hidden])').first();
      for (const input of await step.locator('input[required]:not([type=radio]):not([type=checkbox]), select[required], textarea[required]').all()) {
        const type = await input.getAttribute('type');
        const tag = await input.evaluate((el) => el.tagName);
        if (tag === 'SELECT') await input.selectOption({ index: 1 });
        else if (type === 'date') await input.fill('1995-05-04');
        else if (type === 'email') await input.fill('ana@correo.cl');
        else if (type === 'tel') await input.fill('+56 9 1234 5678');
        else if ((await input.getAttribute('placeholder')) === '12.345.678-5') await input.fill('12.345.678-5');
        else await input.fill('Ana Pérez');
      }
      for (const box of await step.locator('input[type=checkbox][required]').all()) await box.check();
      for (const radio of await step.locator('input[type=radio][required]').all()) await radio.check().catch(() => undefined);
      await stepped.getByRole('button', { name: 'Siguiente' }).click();
      await page.waitForTimeout(100);
      if (!/^Paso 2 /i.test(await label())) problems.push({ kind: 'formulario-pasos', detail: `El formulario por pasos no avanzó con las respuestas completas (${await label()})` });
      const after = await page.evaluate(collectProblems, '.ws-root');
      for (const p of after) if (!problems.some((q) => q.detail === p.detail)) problems.push({ ...p, detail: `(en el paso 2 del formulario) ${p.detail}` });
    }

    // Preguntas: abrir una no puede desbordar.
    const faq = page.locator('main details summary').first();
    if (await faq.count()) {
      await faq.scrollIntoViewIfNeeded();
      await faq.click();
      await page.waitForTimeout(100);
      const after = await page.evaluate(collectProblems, '.ws-root');
      for (const p of after) if (!problems.some((q) => q.detail === p.detail)) problems.push({ ...p, detail: `(con una pregunta abierta) ${p.detail}` });
    }

    // Menú del celular: el panel cabe en la pantalla.
    const menu = page.locator('header summary').first();
    if ((await menu.count()) && (await menu.isVisible())) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await menu.click();
      await page.waitForTimeout(100);
      const after = await page.evaluate(collectProblems, '.ws-root');
      for (const p of after) if (!problems.some((q) => q.detail === p.detail)) problems.push({ ...p, detail: `(con el menú abierto) ${p.detail}` });
      await menu.click();
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    const shot = `shots/${name}__${device.id}.jpg`;
    await page.screenshot({ path: path.join(out, shot), fullPage: true, type: 'jpeg', quality: 50 });
    results.push({ fixture: name, device, problems, shot });
    await context.close();
  }
}
await browser.close();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = fixtures
  .map((name) => {
    const cells = results
      .filter((r) => r.fixture === name)
      .map((r) => {
        const bad = r.problems.filter((p) => p.kind !== 'letra-muy-chica');
        return `<figure class="${bad.length ? 'bad' : 'ok'}"><a href="${r.shot}"><img loading="lazy" src="${r.shot}" alt=""></a><figcaption><b>${esc(r.device.label)}</b> ${r.device.width}×${r.device.height}<br>${bad.length ? `${bad.length} problema(s)` : 'sin problemas'}</figcaption></figure>`;
      })
      .join('');
    return `<section><h2>${esc(name)}</h2><div class="row">${cells}</div></section>`;
  })
  .join('');
fs.writeFileSync(
  path.join(out, 'report.html'),
  `<!doctype html><meta charset="utf-8"><title>Responsividad de sitios web</title><style>body{font:14px system-ui;background:#111;color:#eee;margin:1rem}h2{margin:2rem 0 .5rem}.row{display:flex;gap:1rem;overflow-x:auto;align-items:flex-start}figure{margin:0;flex:none;width:240px}figure img{width:100%;max-height:520px;object-fit:cover;object-position:top;border:2px solid #444;background:#222}figure.bad img{border-color:#e5484d}figure.ok img{border-color:#2f7d5b}figcaption{font-size:12px;margin-top:.3rem}</style><h1>Verificación de responsividad: sitios web</h1>${rows}`
);

let warnings = 0;
const grouped = new Map();
for (const r of results) {
  for (const p of r.problems) {
    if (p.kind === 'letra-muy-chica') {
      warnings++;
      continue;
    }
    failures.push(p);
    const key = `${r.fixture}|${p.kind}|${p.detail.replace(/\d+(\.\d+)?px/g, 'Npx').replace(/va de -?\d+ a \d+/, 'va de …').replace(/\(texto [^)]*\)/, '')}`;
    const g = grouped.get(key) ?? { fixture: r.fixture, kind: p.kind, detail: p.detail, devices: [] };
    g.devices.push(`${r.device.width}`);
    grouped.set(key, g);
  }
}
for (const g of grouped.values()) console.log(`✗ [${g.fixture}] ${g.kind}: ${g.detail}\n    pantallas: ${g.devices.join(', ')}px`);
console.log(`\n${results.length} combinaciones revisadas (${fixtures.length} casos × ${devices.length} pantallas).`);
console.log(`Visualizador: ${path.relative(root, path.join(out, 'report.html'))}`);
if (warnings) console.log(`Avisos de letra muy chica (<11px): ${warnings}`);
if (failures.length) {
  console.log(`✗ ${failures.length} problema(s) de responsividad. No publicar hasta corregirlos.`);
  process.exit(1);
}
console.log('✓ Sin desbordes ni textos cortados en ninguna pantalla.');
