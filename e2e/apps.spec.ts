import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { db } from './db';
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
  for (const width of [280, 320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
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
      businessName: 'Mi empresa de prueba',
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
    await page.setViewportSize({ width: 390, height: 1000 });
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
