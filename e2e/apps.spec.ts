import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { db } from './db';
import type { ControlSnapshot } from '@/modules/control/service';
const capture = '.vercel/apps-review';
test('centro de apps, instalación y control privado del dueño', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://missing/missing',
  );
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/_test$|_e2e$/.test(url.pathname)
  )
    throw new Error('Solo una base local de pruebas');
  for (const width of [
    280, 320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1920, 2560,
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/apps');
    await expect(
      page.getByRole('heading', { name: 'Aether Control', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${capture}/centro-${width}.png`,
      fullPage: true,
    });
  }
  const manifest = await (
    await page.request.get('/control/manifest.webmanifest')
  ).json();
  expect(manifest).toMatchObject({
    id: '/control',
    start_url: '/control',
    scope: '/control',
    display: 'standalone',
  });
  expect((await page.request.get('/api/control')).status()).toBe(401);
  const key = randomUUID();
  const password = `App-${key}!`;
  const company = await db().company.create({
    data: {
      rut: `apps-${key}`,
      businessName:
        'Comercializadora de productos del sur Temuco/Longuimay y distribución regional de prueba',
      features: {
        create: {
          hasPos: true,
          hasInventory: true,
          hasDteBilling: true,
          hasTreasury: true,
        },
      },
      settings: { create: {} },
    },
  });
  const user = await db().user.create({
    data: {
      companyId: company.id,
      email: `apps-${key}@prueba.local`,
      name: 'Dueño de prueba',
      role: 'OWNER',
      passwordHash: await hash(password, 10),
    },
  });
  try {
    await context.clearCookies();
    await page.goto('/control/ingresar');
    await page.locator('#username').fill(user.email);
    await page.locator('#password').fill(password);
    await page.evaluate(() => {
      document.documentElement.dataset.controlInstallPrompts = '0';
      const event = new Event('beforeinstallprompt');
      Object.assign(event, {
        prompt: async () => {
          const data = document.documentElement.dataset;
          data.controlInstallPrompts = String(Number(data.controlInstallPrompts ?? 0) + 1);
        },
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/control$/, { timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: company.businessName, exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const response = await page.request.get('/api/control');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.json()).toMatchObject({
      company: company.businessName,
      salesToday: 0,
      incomeToday: 0,
      openRegisters: 0,
    });
    const snapshot = (await response.json()) as ControlSnapshot;
    const activity = [
      {
        id: 'sale:test',
        kind: 'sale',
        label: 'Venta #900',
        detail: 'Documento emitido en el ERP',
        at: snapshot.at,
        amount: 5000,
      },
      {
        id: 'cash:test',
        kind: 'cash',
        label: 'Retiro de caja',
        detail: 'Caja Norte · Ana · Reposición',
        at: snapshot.at,
        amount: -1000,
      },
      {
        id: 'stock:test',
        kind: 'stock',
        label: 'Miel de Longuimay',
        detail: 'Bodega Norte · +2 unidades · Rosa',
        at: snapshot.at,
        amount: null,
      },
    ];
    let unavailable = false;
    await page.route('**/api/control', route => unavailable
      ? route.fulfill({ status: 503, json: { error: 'No disponible' } })
      : route.fulfill({ json: { ...snapshot, activity } }));
    await page
      .getByRole('button', { name: 'Actualizar ahora', exact: true })
      .click();
    await expect(page.getByText('Venta #900', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bodega', exact: true }).click();
    await expect(
      page.getByText('Miel de Longuimay', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Venta #900', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Todo', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Buscar en actividad' })
      .fill('Ana');
    await expect(
      page.getByText('Retiro de caja', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Miel de Longuimay', { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('searchbox', { name: 'Buscar en actividad' })
      .fill('NoExiste');
    await expect(
      page.getByText(/No hay movimientos que coincidan/),
    ).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar en actividad' }).fill('');
    for (const width of [
      280, 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920, 2560,
    ]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${capture}/control-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('navigation', { name: 'Secciones de Control' })
      .getByRole('link', { name: 'Actividad', exact: true })
      .click();
    await expect(page).toHaveURL(/#control-actividad$/);
    await context.setOffline(true);
    await expect(
      page.getByText(
        'Sin conexión. Los importes no se actualizarán hasta consultar nuevamente el ERP.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Actualizar ahora', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('Venta #900', { exact: true })).toBeVisible();
    await context.setOffline(false);
    unavailable = true;
    await page
      .getByRole('button', { name: 'Actualizar ahora', exact: true })
      .click();
    await expect(
      page.getByText(/Se conserva la última consulta/),
    ).toBeVisible();
    await expect(page.getByText('Venta #900', { exact: true })).toBeVisible();
    await page.unroute('**/api/control');
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${capture}/control-390.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Instalar Aether Control', exact: true })
      .click();
    await expect(
      page.getByText('Agregar a la pantalla de inicio', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.dataset.controlInstallPrompts,
      ),
    ).toBe('1');
    await page
      .getByRole('button', { name: 'Cerrar instrucciones de instalación' })
      .click();
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      Object.assign(event, {
        prompt: async () => undefined,
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole('button', { name: 'Instalar Aether Control', exact: true })
      .click();
    await expect(
      page.getByText('Agregar a la pantalla de inicio', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Instalar Aether Control',
        exact: true,
      }),
    ).toBeEnabled();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(
      page.getByRole('button', {
        name: 'Aether Control instalada',
        exact: true,
      }),
    ).toBeDisabled();
    await db().user.updateMany({
      where: { id: user.id, companyId: company.id },
      data: { role: 'ADMIN' },
    });
    expect((await page.request.get('/api/control')).status()).toBe(403);
    await page
      .getByRole('button', { name: 'Actualizar ahora', exact: true })
      .click();
    await expect(
      page.getByText('Tu cuenta no tiene acceso a Aether Control.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: company.businessName, exact: true }),
    ).toHaveCount(0);
  } finally {
    await db().user.updateMany({
      where: { id: user.id, companyId: company.id },
      data: { isActive: false },
    });
  }
});
