import { createRequire } from 'node:module';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import { validateRut } from '../src/lib/chile/rut';
import { STATE, seedCatalog } from './bodega-support';
import { db, disableGuidedTour, owner } from './db';

/**
 * Seller Center (Inventario, con su propio interruptor): la empresa invita a una persona de un seller
 * desde su ficha; la persona activa su cuenta con el enlace, ve lo vendido de su mercadería con la
 * comisión y lo que le corresponde (nunca lo de otro seller), descarga el Excel, sale y vuelve a entrar. Desactivarla la deja afuera
 * aunque tenga la sesión abierta, su cookie no sirve como sesión del panel y, con el interruptor
 * apagado, el portal no existe. El enlace del correo se fija en la base (el correo no sale en local).
 */

test.use(STATE);

const collectProblems: (
  rootSelector: string,
) => Array<{ kind: string; detail: string }> = createRequire(
  `${process.cwd()}/package.json`,
)('./scripts/responsive/page-checks.cjs');

const EMAIL = 'rosa.e2e@productores.cl';
const PASSWORD = 'Miel-del-Sur-2026';
const TOKEN = 'E2eSellerCenterToken_0123456789abcdefghijkl';
const hash = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const setSellerCenter = async (on: boolean) => {
  const { companyId } = await owner();
  await db().companyFeatures.upsert({
    where: { companyId },
    update: { hasInventory: true, hasSellerCenter: on },
    create: { companyId, hasInventory: true, hasSellerCenter: on },
  });
};

/** Seller de consignación (comisión 20 %) de la empresa de pruebas; se crea una vez y se reutiliza. */
async function ensureSeller(
  razonSocial: string,
  rutBody: string,
): Promise<{ id: string; name: string }> {
  const { companyId } = await owner();
  const rutClean = `${rutBody}K`;
  const data = { isConsignor: true, consignmentCommissionBps: 2000 };
  const found = await db().contact.findFirst({
    where: { companyId, rutClean },
    select: { id: true },
  });
  if (found) {
    await db().contact.update({ where: { id: found.id }, data });
    return { id: found.id, name: razonSocial };
  }
  const created = await db().contact.create({
    data: { companyId, razonSocial, rut: `${rutBody}-K`, rutClean, ...data },
    select: { id: true },
  });
  return { id: created.id, name: razonSocial };
}

/** Un seller con su producto vendido hoy (3 × $3.000 neto) y otro seller con una venta que no debe ver. */
async function seedSellerSales(warehouseId: string) {
  const { companyId } = await owner();
  const seller = await ensureSeller('Miel E2E del Sur', '76222333');
  const other = await ensureSeller('Otro Seller E2E', '76222444');
  const product = async (sku: string, name: string, consignorId: string) => {
    const found = await db().product.findFirst({
      where: { companyId, sku },
      select: { id: true },
    });
    if (found) {
      await db().product.update({
        where: { id: found.id },
        data: { consignorId, costPricePMP: 0 },
      });
      return found.id;
    }
    return (
      await db().product.create({
        data: {
          companyId,
          sku,
          name,
          netPrice: 3000,
          grossPrice: 3570,
          costPricePMP: 0,
          consignorId,
        },
        select: { id: true },
      })
    ).id;
  };
  const own = await product('E2E-SC-MIEL', 'Miel E2E Ulmo 500 g', seller.id);
  const theirs = await product(
    'E2E-SC-OTRO',
    'Mermelada E2E de Otro Seller',
    other.id,
  );
  const customer =
    (await db().contact.findFirst({
      where: { companyId, rutClean: '666666666' },
      select: { id: true },
    })) ??
    (await db().contact.create({
      data: {
        companyId,
        razonSocial: 'Consumidor final E2E',
        rut: '66.666.666-6',
        rutClean: '666666666',
        isCustomer: true,
      },
      select: { id: true },
    }));
  await db().salesDocumentItem.deleteMany({
    where: { companyId, productId: { in: [own, theirs] } },
  });
  const folio = 900_000 + Math.floor(Math.random() * 90_000);
  const sales = [
    [own, 'Miel E2E Ulmo 500 g', seller.id, 3, 9000, 0],
    [theirs, 'Mermelada E2E de Otro Seller', other.id, 2, 8000, 1],
  ] as const;
  for (const [
    productId,
    description,
    consignorId,
    quantity,
    subtotal,
    offset,
  ] of sales) {
    await db().salesDocument.create({
      data: {
        companyId,
        contactId: customer.id,
        warehouseId,
        dteType: 'BOLETA_39',
        folio: folio + offset,
        status: 'ISSUED',
        paymentMethod: 'EFECTIVO',
        netAmount: subtotal,
        totalAmount: subtotal,
        items: {
          create: [
            {
              companyId,
              productId,
              description,
              quantity,
              unitPrice: subtotal / quantity,
              subtotal,
              iva: 0,
              total: subtotal,
              consignorId,
              consignorCommissionBps: 2000,
            },
          ],
        },
      },
    });
  }
  const settlement = await db().sellerSettlement.findFirst({
    where: { companyId, idempotencyKey: 'e2e-mobile-settlement' },
    select: { id: true },
  });
  if (!settlement) {
    await db().$transaction(async tx => {
      const sequence = await tx.internalDocumentSequence.upsert({
        where: { companyId_kind: { companyId, kind: 'SELLER_SETTLEMENT' } },
        update: { currentFolio: { increment: 1 } },
        create: { companyId, kind: 'SELLER_SETTLEMENT', currentFolio: 1 },
      });
      await tx.sellerSettlement.create({
        data: {
          companyId, consignorId: seller.id, number: sequence.currentFolio,
          idempotencyKey: 'e2e-mobile-settlement', status: 'PAID', units: 3,
          netSales: 9000, commissionAmount: 1800, payoutAmount: 7200, paidAt: new Date(),
        },
      });
    });
  }
  // Sin accesos previos de esta persona: cada corrida parte de cero.
  await db().supplierPortalPerson.deleteMany({ where: { email: EMAIL } });
  return seller;
}

/** Contexto sin la sesión del panel: el seller no es usuario de la empresa. */
const supplierContext = (browser: Browser) =>
  browser.newContext({ storageState: { cookies: [], origins: [] } });

test.describe('seller center', () => {
  test.beforeEach(async ({ context }) => {
    await disableGuidedTour(context);
  });

  test.afterAll(async () => {
    await setSellerCenter(false);
  });

  test('invitar, activar la cuenta, ver ventas en $, salir y volver a entrar; desactivada queda afuera', async ({
    page,
    request,
    browser,
  }) => {
    const warehouseId = await seedCatalog(request);
    const seller = await seedSellerSales(warehouseId);
    await setSellerCenter(true);

    test.setTimeout(180000);
    // La empresa invita desde la ficha del seller.
    await page.goto(`/dashboard/contacts/${seller.id}`);
    const card = page.getByTestId('seller-center-card');
    await card.getByLabel('Nombre de la persona').fill('Rosa Productora');
    await card.getByLabel('Correo de la persona').fill(EMAIL);
    await card.getByRole('button', { name: 'Invitar' }).click();
    await expect(card.getByText(EMAIL, { exact: true })).toBeVisible();
    await expect(
      card.getByText('Pendiente de activación', { exact: true }),
    ).toBeVisible();
    const person = await db().supplierPortalPerson.findUniqueOrThrow({
      where: { email: EMAIL },
      select: { id: true },
    });
    await db().supplierPortalMembership.updateMany({
      where: { personId: person.id },
      data: { inviteTokenHash: hash(TOKEN) },
    });

    // La persona activa su cuenta con el enlace.
    const supplierCtx = await supplierContext(browser);
    const portal = await supplierCtx.newPage();
    await portal.goto(`/proveedor/cuenta/invitacion/${TOKEN}`);
    await expect(
      portal.getByRole('heading', { name: 'Hola, Rosa Productora' }),
    ).toBeVisible();
    await portal.getByLabel('Contraseña nueva').fill('corta');
    await portal.getByLabel('Repite la contraseña').fill('corta');
    await portal.getByRole('button', { name: 'Activar mi acceso' }).click();
    await expect(portal.getByText(/al menos 8 caracteres/)).toBeVisible();
    await portal.getByLabel('Contraseña nueva').fill(PASSWORD);
    await portal.getByLabel('Repite la contraseña').fill(PASSWORD);
    await portal.getByRole('button', { name: 'Activar mi acceso' }).click();

    // Lo vendido de SU mercadería, con la comisión (20 %) y lo que le corresponde; nunca lo de otro seller.
    await expect(
      portal.getByRole('heading', { name: /Tu resumen de/ }),
    ).toBeVisible();
    const sales = portal.getByRole('list', { name: 'Ventas por producto' });
    await expect(sales.getByText('Miel E2E Ulmo 500 g')).toBeVisible();
    await expect(sales.getByText('$9.000')).toBeVisible();
    await expect(sales.getByText('$1.800')).toBeVisible();
    await expect(sales.getByText('$7.200')).toBeVisible();
    await expect(portal.getByText('Mermelada E2E de Otro Seller')).toHaveCount(
      0,
    );
    await expect(
      portal.getByRole('heading', { name: 'Tu mercadería en consignación' }),
    ).toBeVisible();
    await portal.setViewportSize({ width: 390, height: 844 });
    await portal
      .getByRole('searchbox', { name: 'Buscar en mis ventas' })
      .fill('NoExiste');
    await expect(
      portal.getByText('No hay productos que coincidan con tu búsqueda.', {
        exact: true,
      }),
    ).toBeVisible();
    await portal
      .getByRole('searchbox', { name: 'Buscar en mis ventas' })
      .fill('Miel');
    await expect(sales.getByText('Miel E2E Ulmo 500 g')).toBeVisible();
    await portal
      .getByRole('searchbox', { name: 'Buscar en mis ventas' })
      .fill('');
    await portal
      .getByRole('searchbox', { name: 'Buscar en mi mercadería' })
      .fill('NoExiste');
    await expect(
      portal.getByText('No hay mercadería que coincida con tu búsqueda.', {
        exact: true,
      }),
    ).toBeVisible();
    await portal
      .getByRole('searchbox', { name: 'Buscar en mi mercadería' })
      .fill('');
    await expect(
      portal.getByRole('list', { name: 'Liquidaciones en el teléfono' }),
    ).toBeVisible();
    await expect(
      portal
        .getByRole('list', { name: 'Liquidaciones en el teléfono' })
        .getByText('Pagada', { exact: true }),
    ).toBeVisible();
    await db().supplierPortalPerson.updateMany({
      where: { id: person.id },
      data: {
        name: 'Rosa Productora de Temuco/Longuimay y representante de la asociación de pequeños productores del sur',
      },
    });
    await portal.reload();
    for (const width of [
      280, 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560,
    ]) {
      await portal.setViewportSize({ width, height: 844 });
      const problems = await portal.evaluate(collectProblems, '.sc-app');
      expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
      await portal.screenshot({
        path: `.vercel/apps-review/seller-${width}.png`,
        fullPage: true,
      });
    }
    await portal.setViewportSize({ width: 390, height: 844 });
    await portal
      .getByRole('navigation', { name: 'Secciones de Seller Center' })
      .getByRole('link', { name: 'Mercadería', exact: true })
      .click();
    await expect(portal).toHaveURL(/#seller-stock$/);
    await portal.getByRole('navigation', { name: 'Secciones de Seller Center' }).getByRole('link', { name: 'Mermas', exact: true }).click();
    await expect(portal.getByRole('heading', { name: /^Mermas de/ })).toBeInViewport();
    await portal.screenshot({ path: '.vercel/apps-review/seller-mermas-390.png' });
    await portal.getByRole('heading', { name: 'Tus liquidaciones', exact: true }).scrollIntoViewIfNeeded();
    await expect(portal.getByRole('list', { name: 'Liquidaciones en el teléfono' })).toBeVisible();
    await portal.screenshot({ path: '.vercel/apps-review/seller-liquidaciones-390.png' });
    await supplierCtx.setOffline(true);
    await expect(
      portal.getByText(
        'Sin conexión · estos datos pueden estar desactualizados',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      portal.getByRole('button', { name: 'Actualizar', exact: true }),
    ).toBeDisabled();
    await supplierCtx.setOffline(false);
    await portal.route('**/api/supplier-portal/logout', (route) =>
      route.fulfill({ status: 503, json: { error: 'Sin conexión' } }),
    );
    await portal.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(portal.getByText('No se pudo cerrar la sesión. Revisa la conexión e inténtalo nuevamente.', { exact: true })).toBeVisible();
    await expect(
      portal.getByRole('heading', { name: /Tu resumen de/ }),
    ).toBeVisible();
    await portal.unroute('**/api/supplier-portal/logout');
    const [download] = await Promise.all([
      portal.waitForEvent('download'),
      portal.getByRole('link', { name: 'Descargar Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^portal-proveedor-\d{4}-\d{2}\.xlsx$/,
    );

    // Su cookie no sirve como sesión del panel.
    const cookie = (await supplierCtx.cookies()).find(
      (entry) => entry.name === 'supplier_session',
    );
    expect(cookie?.httpOnly).toBe(true);
    const forged = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    await forged.addCookies([{ ...cookie!, name: 'session' }]);
    const forgedPage = await forged.newPage();
    await forgedPage.goto('/dashboard');
    await expect(forgedPage).toHaveURL(/\/login/);
    await forged.close();

    // Salir y volver a entrar; con la contraseña equivocada no.
    await portal.getByRole('button', { name: 'Salir' }).click();
    await expect(
      portal.getByRole('heading', { name: 'Ingresa a tu cuenta' }),
    ).toBeVisible();
    await portal.getByLabel('Correo o teléfono', { exact: true }).fill(EMAIL);
    await portal.getByLabel('Contraseña').fill('Otra-Clave-2026');
    await portal.getByRole('button', { name: 'Ingresar' }).click();
    await expect(
      portal.getByText('Correo o contraseña incorrectos'),
    ).toBeVisible();
    await portal.getByLabel('Contraseña').fill(PASSWORD);
    await portal.getByRole('button', { name: 'Ingresar' }).click();
    await expect(
      portal.getByRole('heading', { name: /Tu resumen de/ }),
    ).toBeVisible();

    // La empresa la desactiva: en la siguiente página queda afuera, aunque tenga la sesión abierta.
    await page.reload();
    await expect(card.getByText('Activa', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Desactivar' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(
      page.getByText('Acceso desactivado: ya no puede entrar'),
    ).toBeVisible();
    await portal.reload();
    await expect(
      portal.getByRole('heading', { name: 'Ingresa a tu cuenta' }),
    ).toBeVisible();
    await supplierCtx.close();
  });

  test('apagado: el portal no existe y la ficha no ofrece invitar', async ({
    page,
    request,
    browser,
  }) => {
    const warehouseId = await seedCatalog(request);
    const seller = await seedSellerSales(warehouseId);
    await setSellerCenter(false);

    await page.goto(`/dashboard/contacts/${seller.id}`);
    await expect(
      page.getByRole('heading', { name: 'Miel E2E del Sur' }),
    ).toBeVisible();
    await expect(page.getByTestId('seller-center-card')).toHaveCount(0);

    const supplierCtx = await supplierContext(browser);
    const response = await supplierCtx.request.post(
      '/api/supplier-portal/login',
      { data: { email: EMAIL, password: PASSWORD } },
    );
    expect(response.status()).toBe(401);
    const exported = await supplierCtx.request.get(
      '/api/supplier-portal/export',
    );
    expect(exported.status()).toBe(401);
    await supplierCtx.close();
  });
  for (const channel of ['email', 'whatsapp'] as const) test(`crear seller con ${channel}, activar su cuenta e ingresar en su app`, async ({ page, browser }) => {
    test.setTimeout(150000);
    const database = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !/_test$/.test(database.pathname)) throw new Error('Solo base local de pruebas');
    await setSellerCenter(true);
    const { companyId } = await owner();
    const key = randomBytes(6).toString('hex');
    const body = String(randomInt(70000000, 99000000));
    const dv = [...'0123456789K'].find(value => validateRut(body + value))!;
    const rut = `${body}-${dv}`;
    const label = `Seller alta ${channel} ${key}`;
    const email = `alta-${key}@prueba.local`;
    const phone = `+569${String(randomInt(10000000, 99999999))}`;
    await page.goto('/dashboard/contacts?new=1');
    await page.locator('#rut').fill(rut);
    await page.locator('#razonSocial').fill(label);
    if (channel === 'email') await page.locator('#email').fill(email);
    else await page.locator('#phone').fill(phone);
    await page.getByRole('checkbox', { name: 'Seller (consignación)', exact: true }).check();
    await page.locator('#consignmentCommission').fill('20');
    await page.getByRole('checkbox', { name: 'Crear su invitación al guardar el seller', exact: true }).check();
    await page.locator('#seller-person-name').fill('Rosa Seller');
    await expect(page.locator('#seller-invite-channel')).toHaveValue(channel);
    await page.getByRole('button', { name: 'Crear contacto', exact: true }).click();
    await expect.poll(() => db().contact.count({ where: { companyId, rutClean: body + dv } })).toBe(1);
    const contact = await db().contact.findFirstOrThrow({ where: { companyId, rutClean: body + dv } });
    await expect.poll(() => db().supplierPortalMembership.count({ where: { companyId, supplierId: contact.id } })).toBe(1);
    const membership = await db().supplierPortalMembership.findFirstOrThrow({ where: { companyId, supplierId: contact.id }, include: { person: true } });
    expect(membership.acceptedAt).toBeNull();
    expect(membership.person.passwordHash).toBeNull();
    let token: string;
    if (channel === 'whatsapp') {
      expect(membership.person).toMatchObject({ email: null, phone });
      const share = page.getByRole('link', { name: 'Compartir invitación por WhatsApp', exact: true });
      await expect(share).toBeVisible();
      const url = new URL((await share.getAttribute('href'))!);
      expect(url.origin).toBe('https://wa.me');
      expect(url.pathname).toBe('/' + phone.slice(1));
      token = /invitacion\/([\w-]{43})/.exec(url.searchParams.get('text')!)![1]!;
      expect(membership.inviteTokenHash).toBe(hash(token));
      await page.screenshot({ path: '.vercel/apps-review/seller-alta-whatsapp.png', fullPage: true });
    } else {
      expect(membership.person).toMatchObject({ email, phone: null });
      token = randomBytes(32).toString('base64url');
      // Local mail is not delivered: model the one-use link received by the recipient.
      await db().supplierPortalMembership.updateMany({ where: { companyId, id: membership.id }, data: { inviteTokenHash: hash(token) } });
    }
    const ctx = await supplierContext(browser);
    try {
      const app = await ctx.newPage();
      await app.setViewportSize({ width: 390, height: 844 });
      await app.goto(`/proveedor/cuenta/invitacion/${token}`);
      await expect(app.getByRole('heading', { name: 'Hola, Rosa Seller', exact: true })).toBeVisible();
      await app.getByLabel('Contraseña nueva', { exact: true }).fill(PASSWORD);
      await app.getByLabel('Repite la contraseña', { exact: true }).fill(PASSWORD);
      await app.screenshot({ path: `.vercel/apps-review/seller-activar-${channel}.png`, fullPage: true });
      if (channel === 'whatsapp') {
        for (const width of [280, 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
          await app.setViewportSize({ width, height: 844 });
          expect(await app.evaluate(collectProblems, '.seller-center-app')).toEqual([]);
          await app.screenshot({ path: `.vercel/apps-review/seller-activar-${width}.png`, fullPage: true });
        }
        await app.setViewportSize({ width: 390, height: 844 });
      }
      await app.getByRole('button', { name: 'Activar mi acceso', exact: true }).click();
      await expect(app).toHaveURL(/\/proveedor\/cuenta$/);
      await expect(app.getByRole('heading', { name: /Tu resumen de/ })).toBeVisible();
      await expect(app.getByText('Mermelada E2E de Otro Seller')).toHaveCount(0);
      expect((await app.request.get('/api/control')).status()).toBe(401);
      expect((await (await app.request.get('/proveedor/cuenta/manifest.webmanifest')).json())).toMatchObject({ id: '/proveedor/cuenta', start_url: '/proveedor/cuenta', display: 'standalone' });
      await expect(app.getByRole('button', { name: 'Instalar Seller Center', exact: true })).toBeVisible();
      await app.getByRole('button', { name: 'Salir', exact: true }).click();
      await expect(app.getByRole('heading', { name: 'Ingresa a tu cuenta', exact: true })).toBeVisible();
      if (channel === 'whatsapp') {
        for (const width of [280, 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
          await app.setViewportSize({ width, height: 844 });
          expect(await app.evaluate(collectProblems, '.seller-center-app')).toEqual([]);
        }
        await app.setViewportSize({ width: 390, height: 844 });
      }
      await app.getByLabel('Correo o teléfono', { exact: true }).fill(channel === 'email' ? email : phone.slice(3));
      await app.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
      await app.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await expect(app).toHaveURL(/\/proveedor\/cuenta$/);
      await page.goto(`/dashboard/contacts/${contact.id}`);
      await expect(page.getByTestId('seller-center-card').getByText('Activa', { exact: true })).toBeVisible();
      await app.goto(`/proveedor/cuenta/invitacion/${token}`);
      await expect(app.getByRole('heading', { name: 'Enlace no válido', exact: true })).toBeVisible();
    } finally { await ctx.close(); }
  });

});
