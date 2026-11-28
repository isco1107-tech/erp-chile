import { expect, test } from '@playwright/test';
import { disableGuidedTour } from './db';
import { OWNER_STATE } from './support';

test.use({ storageState: OWNER_STATE });

// La guía «Cómo usar» de cada pantalla se abre sola la primera vez, como un diálogo modal que tapa el menú y el
// buscador y se queda con el foco: estos recorridos prueban justamente el menú y la búsqueda, así que la apagan
// (igual que el resto de los specs). La guía sigue disponible desde «Cómo usar».
test.beforeEach(async ({ context }) => {
  await disableGuidedTour(context);
});

test('el menú móvil mantiene el foco, se cierra al navegar y deja espacio al panel', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 650 });
  await page.goto('/dashboard/settings/profile');

  const trigger = page.getByRole('button', { name: 'Abrir menú', exact: true });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280);

  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Menú principal' });
  const close = drawer.getByRole('button', { name: 'Cerrar menú', exact: true });
  await expect(close).toBeFocused();
  await expect(page.getByRole('main')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Cerrar sesión' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(trigger).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(trigger).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await drawer.getByRole('link', { name: 'Aplicaciones', exact: true }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole('heading', { name: 'Centro de aplicaciones' })).toBeVisible();
});

test('la búsqueda del ERP abre desde el teclado y encuentra aplicaciones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/settings/profile');

  await page.getByRole('button', { name: /Buscar clientes/ }).focus();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Buscar en Aether' });
  const input = search.getByRole('combobox', { name: 'Buscar' });
  await expect(input).toBeFocused();
  await input.fill('centro de aplicaciones');
  await expect(search.getByRole('option', { name: /Aplicaciones/ })).toHaveCount(1);
  await expect(search.getByRole('button', { name: 'Cerrar búsqueda' })).toBeVisible();
  const bounds = await search.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await search.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');

  await input.press('Enter');
  await expect(page).toHaveURL(/\/apps$/);
});
