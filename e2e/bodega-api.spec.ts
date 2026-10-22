import { expect, test } from '@playwright/test';
import { EAN_ACEITE, STATE, lookup, seedCatalog } from './bodega-support';

// API de la app del bodeguero, con la sesión del dueño de la empresa de prueba.

test.use(STATE);

test.describe('API de la app del bodeguero', () => {
  test('sin sesión responde 401 en JSON (no una redirección al login)', async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    for (const url of ['/api/bodega/bootstrap', '/api/bodega/recent', '/api/bodega/lookup?code=123']) {
      const response = await anonymous.get(url);
      expect(response.status(), url).toBe(401);
      expect((await response.json()).success).toBe(false);
    }
    expect((await anonymous.post('/api/bodega/sync', { data: { ops: [] } })).status()).toBe(401);
    await anonymous.dispose();
  });

  test('reenviar la misma operación no mueve el stock otra vez', async ({ request }) => {
    const warehouseId = await seedCatalog(request);
    const before = (await lookup(request, EAN_ACEITE, warehouseId))!.stock;
    const op = { kind: 'MOVE', clientOpId: `e2e-idem-${Date.now()}`, mode: 'RECEIVE', productId: (await lookup(request, EAN_ACEITE, warehouseId))!.id, warehouseId, quantity: 3 };

    const first = (await (await request.post('/api/bodega/sync', { data: { ops: [op] } })).json()).data.results[0];
    const second = (await (await request.post('/api/bodega/sync', { data: { ops: [op] } })).json()).data.results[0];
    expect(first).toMatchObject({ status: 'APPLIED', replayed: false, newStock: before + 3 });
    expect(second).toMatchObject({ status: 'APPLIED', replayed: true, newStock: before + 3 });
    expect((await lookup(request, EAN_ACEITE, warehouseId))!.stock).toBe(before + 3);
  });

  test('una operación inválida o sin stock se rechaza sin tumbar las demás', async ({ request }) => {
    const warehouseId = await seedCatalog(request);
    const product = (await lookup(request, EAN_ACEITE, warehouseId))!;
    const results = (
      await (
        await request.post('/api/bodega/sync', {
          data: {
            ops: [
              { kind: 'MOVE', clientOpId: 'e2e-bad-qty-0001', mode: 'RECEIVE', productId: product.id, warehouseId, quantity: -1 },
              { kind: 'MOVE', clientOpId: `e2e-too-much-${Date.now()}`, mode: 'WASTE', reason: 'DAMAGED', productId: product.id, warehouseId, quantity: 999_999 },
              { kind: 'MOVE', clientOpId: `e2e-ok-${Date.now()}`, mode: 'RECEIVE', productId: product.id, warehouseId, quantity: 1 },
            ],
          },
        })
      ).json()
    ).data.results;
    expect(results[0]).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
    expect(results[1]).toMatchObject({ status: 'REJECTED', code: 'INSUFFICIENT_STOCK' });
    expect(results[2]).toMatchObject({ status: 'APPLIED' });
  });

  test('identificar rechaza lo que no es una imagen', async ({ request }) => {
    const response = await request.post('/api/bodega/identify', { multipart: { file: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('esto no es una imagen') } } });
    expect(response.status()).toBe(400);
  });
});

