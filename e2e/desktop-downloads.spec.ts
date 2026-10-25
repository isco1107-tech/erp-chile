import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import erpReleases from '../public/downloads/releases.json';
import posReleases from '../public/downloads/pos-releases.json';

test.use({ storageState: { cookies: [], origins: [] } });

test('los ocho enlaces existentes redirigen a su versión pública sin servir binarios desde Vercel', async ({ request }) => {
  for (const release of [...erpReleases, ...posReleases]) {
    const response = await request.get(`/downloads/${release.file}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(release.url);
  }
});

test('los botones ERP y POS descargan después de la redirección al CDN', async ({ page }) => {
  await page.goto('/apps');
  // Test browser download behavior without depending on the public CDN or
  // consuming installer bandwidth in CI. Publication verifies real SHA-256s.
  const fixture = Buffer.from('MZ Aether installer CDN fixture');
  for (const [edition, releases] of [['erp', erpReleases], ['pos', posReleases]] as const) {
    if (edition === 'pos') await page.getByRole('button', { name: 'Descargar app POS', exact: true }).click();
    const release = releases.find(item => item.platform === 'windows');
    if (!release) throw new Error('Missing Windows release');
    await page.route(release.url, route => route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      headers: { 'Content-Disposition': `attachment; filename="${release.file}"` },
      body: fixture,
    }));
    const downloading = page.waitForEvent('download');
    await page.locator(`a[href="/downloads/${release.file}"]`).first().click();
    const download = await downloading;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe(release.file);
    const file = await download.path();
    if (!file) throw new Error('Browser did not save installer');
    expect(await readFile(file)).toEqual(fixture);
  }
});
