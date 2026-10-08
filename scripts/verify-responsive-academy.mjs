#!/usr/bin/env node
/**
 * Verificador de responsividad del micrositio de la academia.
 *
 *   npm run verify:responsive:academy
 *   npm run verify:responsive:academy -- --only=incomodo
 *   npm run verify:responsive:academy -- --device=iphone-se
 *
 * Igual que el de certámenes (`verify-responsive.mjs`): renderiza el sitio real
 * con las fuentes reales y datos incómodos (`scripts/responsive/academy-fixtures.ts`)
 * en 13 pantallas, y falla si algo desborda, se corta o queda ilegible. Además
 * prueba el carrusel (que avance) y que tocar una pregunta no deje contenido
 * invisible. Capturas y `report.html` quedan en `.vercel/responsive-check-academy/`.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const collectProblems = require('./responsive/page-checks.cjs');

const root = process.cwd();
const out = path.join(root, '.vercel', 'responsive-check-academy');
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

// next/font/google necesita el compilador de Next: las fuentes reales se cargan abajo con @font-face.
const stubs = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /public\/pageant\/fonts$|^\.\/fonts$/ }, (a) => (a.importer.includes('components/public/') ? { path: 'fonts-stub', namespace: 'stub' } : null));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const PAGEANT_FONT_CLASSES = '';", loader: 'js' }));
  },
};
const browserBundle = path.join(out, 'academy-browser.js');
await esbuild.build({
  entryPoints: [path.join(root, 'scripts/responsive/academy-browser.tsx')],
  outfile: browserBundle,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'var process={env:{}};' },
  plugins: [stubs],
});
const browserScript = fs.readFileSync(browserBundle, 'utf8');
const names = ['normal', 'incomodo', 'minimo', 'sin-portada'];

async function loadFonts() {
  const cssPath = path.join(out, 'fonts', 'fonts.css');
  if (fs.existsSync(cssPath)) return fs.readFileSync(cssPath, 'utf8');
  const url = 'https://fonts.googleapis.com/css2?family=Italiana&family=Karla:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap';
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const css = execFileSync('curl', ['-sS', '-m', '30', '-A', ua, url], { encoding: 'utf8' });
  let result = '';
  let n = 0;
  for (const block of css.split('/* ').slice(1)) {
    if (!block.startsWith('latin */')) continue;
    const src = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
    if (!src) continue;
    const file = path.join(out, 'fonts', `f${n++}.woff2`);
    execFileSync('curl', ['-sS', '-m', '60', '-o', file, src]);
    const data = `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`;
    result += `@font-face${block.slice(block.indexOf('{') - 1).replace(/;\s*\}.*/s, ';}').replace(src, data)}\n`.replace('latin */', '');
  }
  fs.writeFileSync(cssPath, result);
  return result;
}
const fontCss = await loadFonts();

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
html,body{margin:0}
.acs{--pgs-display:'Italiana';--pgs-body:'Karla';--pgs-serif:'Cormorant Garamond'}
</style></head><body><div id="root"></div></body></html>`;

const only = args.get('only');
const onlyDevice = args.get('device');
const fixtures = names.filter((n) => !only || n === only);
const devices = DEVICES.filter((d) => !onlyDevice || d.id === onlyDevice);
if (!fixtures.length || !devices.length) {
  console.error('Nada que revisar: revisa --only y --device');
  process.exit(2);
}

const results = [];
const failures = [];
for (const name of fixtures) {
  for (const device of devices) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.mobile, hasTouch: device.mobile, deviceScaleFactor: 1, locale: 'es-CL' });
    const page = await context.newPage();
    await page.setContent(wrapper, { waitUntil: 'load' });
    await page.addScriptTag({ content: browserScript });
    await page.evaluate((n) => window.mountAcademy(n), name);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.setAttribute('data-in', '')));
    await page.waitForTimeout(100);
    const problems = await page.evaluate(collectProblems, '.acs');
    // La barra superior no puede encimar su menú con el botón ni con el nombre (pasó: «Contacto» quedó bajo «Inscríbete»).
    const overlap = await page.evaluate(() => {
      const nav = document.querySelector('.acs-nav');
      const actions = document.querySelector('.acs-top-actions');
      const brand = document.querySelector('.acs-brand');
      if (!nav || getComputedStyle(nav).display === 'none') return null;
      const n = nav.getBoundingClientRect();
      if (actions && n.right > actions.getBoundingClientRect().left + 1) return 'el menú se encima con el botón de la derecha';
      if (brand && n.left < brand.getBoundingClientRect().right - 1) return 'el menú se encima con el nombre';
      return null;
    });
    if (overlap) problems.push({ kind: 'barra-encimada', detail: `Barra superior: ${overlap}` });

    // El carrusel tiene que avanzar de verdad al tocar la flecha «siguiente».
    const next = page.getByRole('button', { name: 'Foto siguiente' });
    if (await next.count()) {
      await page.locator('.acs-carousel').scrollIntoViewIfNeeded();
      const current = () => page.evaluate(() => [...document.querySelectorAll('.acs-dot')].findIndex((d) => d.getAttribute('aria-current') === 'true'));
      const before = await current();
      await next.click();
      await page.waitForTimeout(900);
      const after = await current();
      if (after === before) problems.push({ kind: 'carrusel-quieto', detail: 'La flecha «Foto siguiente» no avanzó el carrusel' });
    }
    // Abrir una pregunta no puede dejar nada invisible ni desbordar.
    const faq = page.locator('.acs-faq summary').first();
    if (await faq.count()) {
      await faq.click();
      await page.waitForTimeout(150);
      const after = await page.evaluate(collectProblems, '.acs');
      for (const p of after) if (!problems.some((q) => q.detail === p.detail)) problems.push({ ...p, detail: `(con una pregunta abierta) ${p.detail}` });
    }
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.acs [data-reveal]')].filter((el) => el.getBoundingClientRect().height > 0 && Number(getComputedStyle(el).opacity) < 0.5).map((el) => el.className || el.tagName)
    );
    if (hidden.length) problems.push({ kind: 'contenido-invisible', detail: `Quedó invisible: ${[...new Set(hidden)].join(', ')}` });

    const shot = `shots/${name}__${device.id}.jpg`;
    await page.screenshot({ path: path.join(out, shot), fullPage: true, type: 'jpeg', quality: 55 });
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
        return `<figure class="${bad.length ? 'bad' : 'ok'}"><img loading="lazy" src="${r.shot}" alt=""><figcaption><b>${esc(r.device.label)}</b> ${r.device.width}×${r.device.height}<br>${bad.length ? `${bad.length} problema(s)` : 'sin problemas'}</figcaption></figure>`;
      })
      .join('');
    return `<section><h2>${esc(name)}</h2><div class="row">${cells}</div></section>`;
  })
  .join('');
fs.writeFileSync(
  path.join(out, 'report.html'),
  `<!doctype html><meta charset="utf-8"><title>Responsividad de la academia</title><style>body{font:14px system-ui;background:#111;color:#eee;margin:1rem}h2{margin:2rem 0 .5rem}.row{display:flex;gap:1rem;overflow-x:auto;align-items:flex-start}figure{margin:0;flex:none;width:240px}figure img{width:100%;max-height:520px;object-fit:cover;object-position:top;border:2px solid #444;background:#222}figure.bad img{border-color:#e5484d}figure.ok img{border-color:#2f7d5b}figcaption{font-size:12px;margin-top:.3rem}</style><h1>Verificación de responsividad: academia</h1>${rows}`
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
    const key = `${r.fixture}|${p.kind}|${p.detail.replace(/\d+(\.\d+)?px/g, 'Npx').replace(/va de -?\d+ a \d+/, 'va de …')}`;
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
