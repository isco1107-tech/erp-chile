/**
 * Real landing smoke + responsive review. Start Next, then:
 * npm run verify:landing -- http://localhost:3100
 * Optional CHROMIUM_PATH for an installed browser. No leads are sent: both
 * commercial POST endpoints are intercepted and their payloads are checked.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const collectProblems = require('./responsive/page-checks.cjs');

const devices = [
  [280, 653], [320, 568], [360, 740], [375, 667], [390, 844], [430, 932],
  [844, 390], [768, 1024], [1024, 1366], [1280, 720], [1440, 900], [1920, 1080], [2560, 1080],
];
const origin = process.argv[2] || 'http://localhost:3000';
const folder = '.vercel/landing-check';

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const report = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    let leadPayload, quotePayload;
    let rejectLead = true;
    await context.route('**/api/public/leads', async route => {
      assert.equal(route.request().method(), 'POST');
      leadPayload = route.request().postDataJSON();
      await route.fulfill({ status: rejectLead ? 503 : 200, json: rejectLead ? { success: false, error: 'Prueba controlada de indisponibilidad.' } : { success: true } });
    });
    await context.route('**/api/public/module-quote', async route => {
      assert.equal(route.request().method(), 'POST');
      quotePayload = route.request().postDataJSON();
      await route.fulfill({ json: { success: true } });
    });
    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('h1').count(), 1);
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily), /Geist/);
    // Real assets, including lazy images below the fold.
    await page.locator('main img').evaluateAll(async images => {
      for (const image of images) image.loading = 'eager';
      await Promise.all(images.map(image => image.decode()));
    });
    const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    const faq = structured['@graph'].find(item => item['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, await page.locator('#preguntas details').count());
    for (const item of faq.mainEntity) {
      assert.ok((await page.locator('#preguntas').textContent()).includes(item.acceptedAnswer.text));
    }
    // Every internal anchor must have a destination.
    const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href').slice(1)));
    for (const id of new Set(anchors)) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `Missing destination #${id}`);
    for (const [width, height] of devices) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const problems = await page.evaluate(collectProblems, 'body');
      report.push({ width, height, problems });
      await page.screenshot({ path: `${folder}/${width}.png`, fullPage: true });
      if (width === 1440 || width === 390) await page.screenshot({ path: `${folder}/hero-${width}.png` });
      assert.deepEqual(problems, [], `${width}px: ${JSON.stringify(problems)}`);
      console.log(`Responsive ${width} × ${height}: OK`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Explora Aether' });
    assert.equal(await menu.isVisible(), true);
    assert.deepEqual(await page.evaluate(collectProblems, 'dialog[open]'), []);
    await page.screenshot({ path: `${folder}/mobile-menu.png` });
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Abrir menú', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await menu.getByRole('link', { name: /Módulos/ }).click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(new URL(page.url()).hash, '#modulos');

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const label of ['Ventas', 'Inventario', 'Finanzas', 'Eventos', 'Agentes IA', 'Visión general']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.locator('#product-panel img').evaluate(image => image.decode());
      assert.match(await page.locator('#product-panel img').getAttribute('alt'), /Captura real/);
    }
    await page.getByRole('tab', { name: 'Visión general', exact: true }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Ventas', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Ventas', exact: true }).press('Home');
    await page.getByRole('button', { name: 'Ampliar captura de Visión general' }).click();
    assert.equal(await page.getByRole('dialog', { name: /Captura ampliada/ }).isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: /Captura ampliada/ }).isVisible(), false);

    const search = page.getByRole('searchbox', { name: 'Buscar módulos' });
    await search.fill('tesoreria');
    assert.equal(await page.locator('#modulos article').count(), 1);
    assert.match(await page.locator('#modulos article').innerText(), /Tesorería/);
    await search.fill('modulo que no existe');
    await page.getByRole('heading', { name: 'No encontramos ese módulo.' }).waitFor();
    await page.getByRole('button', { name: 'Restablecer filtros' }).click();
    await page.getByRole('combobox', { name: 'Filtrar por área' }).selectOption({ label: 'Incluido en la base' });
    assert.equal(await page.locator('#modulos article').count(), 2);
    await page.getByRole('combobox', { name: 'Filtrar por área' }).selectOption({ label: 'Todas las áreas' });
    await page.getByRole('button', { name: /Explorar los \d+ módulos/ }).click();
    assert.ok(await page.locator('#modulos article').count() > 25);
    await page.getByRole('button', { name: 'Mostrar menos módulos' }).click();
    await page.getByRole('checkbox', { name: /Agregar Punto de Venta/ }).check();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('checkbox', { name: /Agregar Punto de Venta/ }).isChecked(), true);
    await page.getByRole('button', { name: 'Cotizar', exact: true }).click();
    const quote = page.locator('dialog').filter({ has: page.locator('#cotizacion-modulos-titulo') });
    await quote.getByLabel('Nombre', { exact: true }).fill('Revisión Aether');
    await quote.getByLabel('Correo', { exact: true }).fill('preview@example.test');
    await quote.getByLabel('Teléfono o WhatsApp').fill('+56 9 1234 5678');
    await quote.getByRole('button', { name: 'Pedir cotización (1)' }).click();
    await quote.getByRole('heading', { name: '¡Solicitud recibida!' }).waitFor();
    assert.equal(quotePayload.email, 'preview@example.test');
    assert.deepEqual(quotePayload.moduleIds, ['pos']);
    await quote.getByRole('button', { name: 'Listo' }).click();

    await page.locator('#preguntas summary').first().click();
    assert.equal(await page.locator('#preguntas details[open]').count(), 1);
    await page.locator('#quote-name').fill('Revisión de preview');
    await page.locator('#quote-email').fill('preview@example.test');
    await page.getByRole('checkbox', { name: 'Academia y clases', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Sitios web e inteligencia artificial', exact: true }).check();
    await page.getByRole('button', { name: 'Solicitar demo y cotización', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Prueba controlada' }).waitFor();
    assert.match(await page.locator('#cotizar [role="alert"] a').getAttribute('href'), /^mailto:/);
    rejectLead = false;
    await page.getByRole('button', { name: 'Solicitar demo y cotización', exact: true }).click();
    await page.locator('#cotizar').getByRole('heading', { name: '¡Solicitud recibida!' }).waitFor();
    assert.ok(leadPayload.solutions.includes('Academia y clases'));
    assert.ok(leadPayload.solutions.includes('Sitios web e inteligencia artificial'));
    assert.equal(leadPayload.email, 'preview@example.test');
    await page.locator('#cotizar').screenshot({ path: `${folder}/contact-success.png` });

    const releases = JSON.parse(fs.readFileSync('public/downloads/releases.json', 'utf8'));
    const downloads = await page.locator('#descargas a[download]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const href of downloads) assert.ok(href.endsWith('SHA256SUMS.txt') || releases.some(release => href === `/downloads/${release.file}`));
    const mac = page.getByRole('combobox', { name: 'Procesador de macOS' });
    if (await mac.count()) {
      await mac.selectOption('x64');
      const intel = releases.find(release => release.platform === 'macos' && release.architecture === 'x64');
      assert.equal(await page.getByRole('link', { name: 'Descargar para macOS', exact: true }).getAttribute('href'), `/downloads/${intel.file}`);
    }
    // The public page remains available for customers; canonical matches home.
    assert.equal((await page.goto(`${origin}/conoce-aether`, { waitUntil: 'networkidle' })).status(), 200);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(new URL(await page.locator('link[rel="canonical"]').getAttribute('href')).pathname, '/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
    // SSR provides the pitch, FAQ and contact fallback even without JavaScript.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const staticPage = await noJs.newPage();
    assert.equal((await staticPage.goto(origin)).status(), 200);
    assert.equal(await staticPage.locator('h1').count(), 1);
    assert.ok(await staticPage.locator('a[href^="mailto:"]').count() > 0);
    await noJs.close();
    console.log('Tabs, keyboard, mobile menu, search, filters, persistence, quote, lead success/error, FAQ, downloads, SEO and SSR: OK. No emails sent.');
  } finally {
    fs.writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${folder}/report.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><title>Revisión de landing Aether</title><style>body{font:16px system-ui;background:#10131a;color:#eee;margin:30px}a{color:#e4cb8e}img{width:100%;max-width:960px;border:1px solid #555}section{margin:40px 0}</style><h1>Landing Aether · revisión responsive</h1>${report.map(item => `<section><h2>${item.width} × ${item.height} · ${item.problems.length ? 'Revisar' : 'OK'}</h2><a href="${item.width}.png"><img src="${item.width}.png" loading="lazy" alt="Landing en ${item.width} píxeles"></a></section>`).join('')}</html>`);
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
