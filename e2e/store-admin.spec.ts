import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { db, disableGuidedTour } from './db';
import { OWNER_STATE } from './support';
import { STORE_SLUG, ensureStoreDemo, fakeProductImages, onHandOf, orderByToken, resetStoreOrders, type StoreDemo } from './store-support';

/**
 * Recorridos del EQUIPO en «Tienda en línea» (dueño de la empresa de pruebas): confirmar un pago manual, avanzar
 * la entrega hasta «Entregado», descargar el Excel, publicar y editar productos y cambiar la configuración. Cada
 * pedido lo hace el «comprador» por la API pública, como lo haría el sitio.
 */
test.use({ storageState: OWNER_STATE });

let demo: StoreDemo;
let visitor = 0;

test.beforeAll(async () => {
  demo = await ensureStoreDemo();
  await resetStoreOrders();
});

test.beforeEach(async ({ context, page }) => {
  await disableGuidedTour(context);
  await fakeProductImages(page);
});

async function buy(request: APIRequestContext, slug: string, quantity: number, over: Record<string, unknown> = {}) {
  const response = await request.post(`/api/public/store/${STORE_SLUG}/checkout`, {
    headers: { 'x-forwarded-for': `10.40.${Math.floor(++visitor / 250)}.${(visitor % 250) + 1}` },
    data: {
      idempotencyKey: `ck_admin_${Date.now()}_${visitor}_xxxx`,
      lines: [{ productId: demo.productIds[slug], quantity }],
      customer: { name: 'Camila Rojas', email: `camila.${visitor}.${Date.now()}@correo.cl`, phone: '+56 9 1234 5678' },
      documentType: 'BOLETA',
      deliveryMethod: 'PICKUP',
      paymentProvider: 'TRANSFER',
      acceptTerms: true,
      website: '',
      ...over,
    },
  });
  const body = (await response.json()) as { success: boolean; data: { number: number; orderToken: string } };
  expect(body.success).toBe(true);
  return body.data;
}

test.describe('pedidos', () => {
  test('confirma la transferencia, avanza la entrega y el comprador lo ve; la venta queda en el ERP', async ({ page, request }) => {
    const before = await onHandOf('harina-selecta');
    const order = await buy(request, 'harina-selecta', 2);

    await page.goto('/dashboard/store');
    await expect(page.getByRole('heading', { level: 1, name: 'Tienda en línea' })).toBeVisible();
    await page.getByRole('button', { name: 'Por confirmar pago' }).click();
    await page.getByRole('button', { name: `#${order.number}` }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Pedido #${order.number}`)).toBeVisible();
    await expect(dialog.getByText('Camila Rojas')).toBeVisible();
    // Antes de confirmar el pago no se puede preparar.
    await expect(dialog.getByRole('button', { name: 'Empezar a preparar' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Confirmar pago recibido' }).click();
    await dialog.getByLabel('Referencia (opcional)').fill('Transferencia 445566');
    await dialog.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
    await expect(page.getByText('Pago confirmado. Emitimos la venta')).toBeVisible();
    await expect(dialog.getByText('Pagado', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Boleta N°|Boleta \(sin folio/)).toBeVisible(); // la venta del ERP

    const paid = await orderByToken(order.orderToken);
    expect(paid).toMatchObject({ paymentStatus: 'PAID', paymentReference: 'Transferencia 445566', total: 2380 });
    expect(paid.salesDocument).toMatchObject({ status: 'ISSUED', totalAmount: 2380 });
    expect(await onHandOf('harina-selecta')).toBe(before - 2);

    for (const step of ['Empezar a preparar', 'Marcar listo para retirar', 'Marcar entregado']) {
      await dialog.getByRole('button', { name: step }).click();
      await expect(page.getByText('Pedido actualizado').last()).toBeVisible();
    }
    await expect(dialog.getByText('Entregado').first()).toBeVisible();
    expect((await orderByToken(order.orderToken)).fulfillmentStatus).toBe('DELIVERED');
    await page.keyboard.press('Escape');

    // El comprador, sin sesión, ve su pedido entregado.
    const buyer = await page.context().browser()!.newContext({ locale: 'es-CL', baseURL: new URL(page.url()).origin });
    const buyerPage = await buyer.newPage();
    await buyerPage.goto(`/web/${STORE_SLUG}/pedido/${order.orderToken}`);
    await expect(buyerPage.getByText(/Tu pedido fue entregado/)).toBeVisible();
    await buyer.close();
  });

  test('despacha con seguimiento, rechaza un enlace que no es https y deja el historial', async ({ page, request }) => {
    const order = await buy(request, 'miel-de-ulmo', 1, {
      deliveryMethod: 'SHIPPING',
      address: { region: 'Región Metropolitana de Santiago', comuna: 'Ñuñoa', street: 'Av. Irarrázaval 2401', extra: '' },
      shippingRateId: 'stgo',
    });
    await page.goto('/dashboard/store');
    await page.getByRole('button', { name: `#${order.number}` }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirmar pago recibido' }).click();
    await dialog.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
    await expect(page.getByText('Pago confirmado. Emitimos la venta')).toBeVisible();

    await dialog.getByRole('button', { name: 'Marcar despachado' }).click();
    await dialog.getByLabel('Transportista').fill('Starken');
    await dialog.getByLabel('N° de seguimiento').fill('ST-889900');
    await dialog.getByLabel('Enlace de seguimiento').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Marcar despachado' }).last().click();
    await expect(page.getByText(/debe empezar con https/)).toBeVisible();
    await dialog.getByLabel('Enlace de seguimiento').fill('https://starken.cl/seguimiento/ST-889900');
    await dialog.getByRole('button', { name: 'Marcar despachado' }).last().click();
    await expect(page.getByText('Pedido actualizado')).toBeVisible();
    await expect(dialog.getByText('ST-889900').first()).toBeVisible();
    await expect(dialog.getByText(/Pedido recibido/)).toBeVisible(); // historial
    expect(await orderByToken(order.orderToken)).toMatchObject({ fulfillmentStatus: 'SHIPPED', carrier: 'Starken', trackingNumber: 'ST-889900' });
  });

  test('cancelar un pedido sin pagar libera el stock apartado y pide el motivo', async ({ page, request }) => {
    const order = await buy(request, 'merken-ahumado', 3);
    const reserved = await db().storeStockReservation.count({ where: { order: { accessToken: order.orderToken }, status: 'ACTIVE' } });
    expect(reserved).toBe(1);
    await page.goto('/dashboard/store');
    await page.getByRole('button', { name: `#${order.number}` }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancelar pedido' }).click();
    await dialog.getByRole('button', { name: 'Cancelar el pedido' }).click(); // sin motivo: el navegador lo exige
    await expect(page.getByText('Pedido cancelado y stock liberado')).toHaveCount(0);
    await dialog.getByLabel('Motivo').fill('Pedido duplicado por el cliente');
    await dialog.getByRole('button', { name: 'Cancelar el pedido' }).click();
    await expect(page.getByText('Pedido cancelado y stock liberado')).toBeVisible();
    expect(await orderByToken(order.orderToken)).toMatchObject({ status: 'CANCELLED' });
    expect(await db().storeStockReservation.count({ where: { order: { accessToken: order.orderToken }, status: 'ACTIVE' } })).toBe(0);
  });

  test('descarga el Excel de pedidos y la descarga queda auditada', async ({ page, request }) => {
    const order = await buy(request, 'aceite-maravilla', 1, { customer: { name: '=2+2', email: `formula.${Date.now()}@correo.cl`, phone: '+56 9 1234 5678' } });
    await page.goto('/dashboard/store');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar Excel' }).click();
    const file = await (await download).path();
    expect((await download).suggestedFilename()).toBe('pedidos-tienda.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(readFileSync(file) as never);
    const sheet = workbook.getWorksheet('Pedidos')!;
    const rows: Array<{ number: number; name: string }> = [];
    sheet.eachRow((row, index) => index > 1 && rows.push({ number: Number(row.getCell('A').value), name: String(row.getCell('D').value) }));
    const found = rows.find((row) => row.number === order.number);
    expect(found).toBeDefined();
    expect(found!.name).toBe("'=2+2"); // un nombre que parece fórmula no se ejecuta
    const audit = await db().auditLog.findFirst({ where: { entity: 'StoreOrder', action: 'EXPORT' }, orderBy: { createdAt: 'desc' } });
    expect(audit).not.toBeNull();
  });
});

test.describe('productos y configuración', () => {
  test('quita un producto de la tienda y lo vuelve a publicar; edita su ficha y se ve en el sitio', async ({ page }) => {
    await page.goto('/dashboard/store?tab=products');
    await page.getByLabel('Seleccionar Té de boldo, caja con 20 bolsitas').check();
    await page.getByRole('button', { name: 'Quitar de la tienda' }).click();
    await expect(page.getByText(/1 producto quitado/)).toBeVisible();
    await page.goto(`/web/${STORE_SLUG}/tienda`);
    await expect(page.getByRole('link', { name: 'Té de boldo, caja con 20 bolsitas' })).toHaveCount(0);
    await expect(page.getByText('5 productos')).toBeVisible();

    await page.goto('/dashboard/store?tab=products');
    await page.getByLabel('Seleccionar Té de boldo, caja con 20 bolsitas').check();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    // El aviso trae título y, si el producto está agotado, una nota aparte que también empieza así: se mira el título.
    await expect(page.getByText('1 producto publicado en la tienda')).toBeVisible();

    await page.getByRole('button', { name: /Editar la ficha de Miel de ulmo/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/\$7\.490 con IVA/)).toBeVisible(); // el precio es del inventario
    await dialog.getByLabel('Nombre en la tienda').fill('Miel de ulmo del sur');
    await dialog.getByLabel('Colección').fill('Dulces');
    await dialog.getByLabel('Máximo por pedido').fill('2');
    await dialog.getByRole('button', { name: 'Guardar ficha' }).click();
    await expect(page.getByText('Ficha guardada')).toBeVisible();

    await page.goto(`/web/${STORE_SLUG}/producto/miel-de-ulmo`);
    await expect(page.getByRole('heading', { level: 1, name: 'Miel de ulmo del sur' })).toBeVisible();
    await expect(page.getByText('Máximo 2 por pedido')).toBeVisible();
    await expect(page.getByText('$7.490').first()).toBeVisible();
    // Restaura la ficha para no afectar otras pruebas.
    await db().storeProduct.updateMany({ where: { siteId: demo.siteId, slug: 'miel-de-ulmo' }, data: { title: null, collection: 'Despensa', maxPerOrder: null } });
  });

  test('cambia el teléfono de contacto, guarda, y cerrar la tienda la saca de internet', async ({ page }) => {
    await page.goto('/dashboard/store?tab=settings');
    await page.getByLabel('Teléfono o WhatsApp para dudas').fill('+56 9 5555 4444');
    await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Ajustes guardados')).toBeVisible();
    await expect(page.getByText('Todo guardado.')).toBeVisible();
    expect((await db().webSiteStore.findUniqueOrThrow({ where: { siteId: demo.siteId } })).supportPhone).toBe('+56 9 5555 4444');

    await page.getByRole('button', { name: 'Cerrar la tienda' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar la tienda' }).click();
    await expect(page.getByText('Tu tienda quedó cerrada')).toBeVisible();
    const origin = new URL(page.url()).origin;
    // `maxRetries`: una conexión que el servidor ya cerró por inactividad puede salir como «socket hang up» (ECONNRESET), no es un fallo de la tienda.
    const closed = await page.context().request.get(`${origin}/web/${STORE_SLUG}/pedido/${'0'.repeat(64)}`, { maxRetries: 3 });
    expect(closed.status()).toBe(404);
    const quote = await page.context().request.post(`${origin}/api/public/store/${STORE_SLUG}/quote`, { data: { lines: [] }, headers: { 'x-forwarded-for': '10.50.0.1' }, maxRetries: 3 });
    expect(quote.status()).toBe(404);

    await page.getByRole('button', { name: 'Abrir la tienda' }).click();
    await expect(page.getByText('Tu tienda está abierta al público')).toBeVisible();
    await db().webSiteStore.update({ where: { siteId: demo.siteId }, data: { supportPhone: '+56 9 8765 4321' } });
  });

  test('«Qué le falta» impide abrir una tienda incompleta', async ({ page }) => {
    await db().webSiteStore.update({ where: { siteId: demo.siteId }, data: { enabled: false, paymentMethods: [] } });
    try {
      await page.goto('/dashboard/store');
      await expect(page.getByText(/Qué le falta \(1 cosa obligatoria\)/)).toBeVisible();
      await expect(page.getByText('Tienes al menos un medio de pago funcionando')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Abrir la tienda' })).toBeDisabled();
    } finally {
      await db().webSiteStore.update({ where: { siteId: demo.siteId }, data: { enabled: true, paymentMethods: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'] } });
    }
  });
});
