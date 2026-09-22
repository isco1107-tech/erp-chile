const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

async function main() {
  const origin = process.argv[2] || 'http://localhost:3000';
  const folder = '.vercel/landing-check';
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const prepareImages = async () => {
      await page.locator('img').evaluateAll(async images => {
        for (const image of images) image.loading = 'eager';
        await Promise.all(images.map(image => image.decode()));
      });
    };
    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await prepareImages();
    await page.screenshot({ path: `${folder}/desktop.png`, fullPage: true });
    await page.screenshot({ path: `${folder}/hero.png` });
    for (const label of ['Ventas', 'Inventario', 'Finanzas', 'Eventos', 'Visión general']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.locator('#product-panel img').evaluate(image => image.decode());
      assert.equal(await page.locator('#product-panel img').evaluate(image => image.naturalWidth > 0), true);
    }
    await page.getByRole('button', { name: 'Ampliar captura de Visión general' }).click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    await page.getByRole('tab', { name: 'Eventos y producción', exact: true }).click();
    assert.equal(await page.locator('#module-panel').getByRole('heading', { name: 'Acreditaciones' }).isVisible(), true);
    await page.getByRole('tab', { name: 'Comercial y operación', exact: true }).click();
    await page.getByRole('tab', { name: 'Comercial y operación', exact: true }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Finanzas y control', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByText('¿Necesito instalar algo para usarlo?', { exact: true }).click();
    assert.equal(await page.locator('details[open]').count(), 1);
    await page.getByRole('checkbox', { name: 'Finanzas y contabilidad', exact: true }).check();
    await page.getByLabel('Tu empresa', { exact: false }).fill('Empresa de prueba');
    await page.getByLabel('Tu equipo', { exact: false }).selectOption('6 a 20 personas');
    assert.match(await page.locator('#cotizar form').innerText(), /Ventas e inventario \+ Finanzas y contabilidad/);
    // Headless Chromium has no mail client: this only prepares the request;
    // it never sends email or submits a lead to an external service.
    await page.getByRole('button', { name: 'Solicitar demo y cotización' }).click();
    const prepared = page.getByRole('status').filter({ hasText: 'Envía el mensaje' });
    await prepared.waitFor();
    const emailLink = await prepared.getByRole('link').getAttribute('href');
    assert.ok(emailLink.startsWith('mailto:aethererp1@gmail.com?'));
    assert.match(decodeURIComponent(emailLink), /Empresa de prueba/);
    assert.match(decodeURIComponent(emailLink), /Finanzas y contabilidad/);
    await page.locator('#cotizar').screenshot({ path: `${folder}/quote.png` });
    const releases = JSON.parse(fs.readFileSync('public/downloads/releases.json', 'utf8'));
    if (releases.length) {
      await page.getByLabel('Procesador').selectOption('x64');
      assert.match(await page.getByRole('link', { name: 'Descargar para macOS', exact: true }).getAttribute('href'), /intel/);
      await page.getByLabel('Procesador').selectOption('arm64');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Descargar para Windows', exact: true }).click();
      const download = await downloadPromise;
      assert.equal(await download.failure(), null);
      assert.equal(download.suggestedFilename(), 'aether-erp-windows.exe');
    }
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.goto(origin, { waitUntil: 'networkidle' });
      await prepareImages();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Horizontal overflow: ${viewport.width}`);
      const broken = await page.locator('img').evaluateAll(images => images.filter(image => image.getBoundingClientRect().height > 0 && image.complete && !image.naturalWidth).map(image => image.src));
      assert.deepEqual(broken, []);
      await page.screenshot({ path: `${folder}/${viewport.width}.png`, fullPage: true });
      await page.screenshot({ path: `${folder}/hero-${viewport.width}.png` });
      if (viewport.width === 390) {
        await page.screenshot({ path: `${folder}/mobile-hero.png` });
        await page.getByRole('button', { name: 'Abrir menú' }).click();
        await page.getByRole('navigation', { name: 'Navegación móvil' }).getByRole('link', { name: 'Descargas', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'Abrir menú' }).isVisible(), true);
        await page.screenshot({ path: `${folder}/mobile-downloads.png` });
      }
    }
    const protectedResponse = await page.request.get(`${origin}/dashboard`, { maxRedirects: 0 });
    assert.equal(protectedResponse.status(), 307);
    for (const entry of [
      { headers: { cookie: 'aether-entry=erp' }, name: 'returning customer' },
      { headers: { cookie: 'session=expired' }, name: 'expired session' },
      { headers: { 'user-agent': 'Mozilla/5.0 AetherDesktop/0.1.1' }, name: 'desktop app' },
    ]) {
      const response = await page.request.get(origin, { headers: entry.headers, maxRedirects: 0 });
      assert.equal(response.status(), 307, entry.name);
      // Next.js sends a same-origin redirect's Location as a relative path,
      // not an absolute URL -- resolve against origin instead of assuming either.
      assert.equal(new URL(response.headers().location, origin).pathname, '/login', entry.name);
    }
    const customer = await browser.newContext();
    await customer.addCookies([{ name: 'aether-entry', value: 'erp', url: origin }]);
    const customerPage = await customer.newPage();
    await customerPage.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(new URL(customerPage.url()).pathname, '/login');
    await customerPage.getByRole('heading', { name: 'Bienvenido de vuelta' }).waitFor();
    await customerPage.goto(`${origin}/conoce-aether`, { waitUntil: 'networkidle' });
    await customerPage.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(new URL(customerPage.url()).pathname, '/conoce-aether');
    await customer.close();
    for (const installed of ['tauri', 'standalone']) {
      const app = await browser.newContext();
      await app.addInitScript(kind => {
        if (kind === 'tauri') window.__TAURI_INTERNALS__ = {};
        else Object.defineProperty(navigator, 'standalone', { value: true });
      }, installed);
      const appPage = await app.newPage();
      await appPage.goto(origin);
      await appPage.waitForURL(url => url.pathname === '/login');
      await appPage.getByRole('heading', { name: 'Bienvenido de vuelta' }).waitFor();
      await app.close();
    }
    for (const release of releases) {
      const file = await page.request.get(`${origin}/downloads/${release.file}`, { maxRedirects: 0, timeout: 120000 });
      assert.equal(file.status(), 200, release.file);
      assert.match(file.headers()['content-disposition'] || '', /attachment/i, release.file);
      const data = await file.body();
      assert.equal(data.length, release.size, release.file);
      assert.equal(createHash('sha256').update(data).digest('hex'), release.sha256, release.file);
      console.log(`Download verified: ${release.file} (${data.length} bytes)`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${origin}, responsive layout, images, tabs, modal, menu, FAQ, access control and installer hashes`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
