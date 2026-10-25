import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { OWNER_STATE } from './support';

test.use({ storageState: OWNER_STATE });

test('la función compilada genera el manual Word conservando sus capturas', async ({ request }) => {
  const response = await request.get('/api/manual/docx?alcance=rol');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('wordprocessingml');
  expect(response.headers()['cache-control']).toContain('no-store');
  const archive = await JSZip.loadAsync(await response.body());
  const document = archive.file('word/document.xml');
  if (!document) throw new Error('Missing Word document');
  expect(await document.async('string')).toContain('Manual de');
  const images = archive.file(/^word\/media\/.*\.(png|jpg)$/);
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) expect((await image.async('nodebuffer')).length).toBeGreaterThan(0);
});
