import { expect, test, type Page } from '@playwright/test';
import { OWNER_PASSWORD, OWNER_STATE, login } from './support';

// Datos de e2e/fixtures/seed-multi-company.ts: una persona que trabaja en dos
// empresas, con un rol distinto en cada una.
const MULTI_USER_EMAIL = 'multi@prueba.local';
const HOME = 'Empresa de Prueba';
const SECOND = 'Filial E2E SpA';

async function dismissTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Omitir' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function switchWithCommandMenu(page: Page, companyName: string) {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Buscar' }).fill(companyName.slice(0, 8));
  const option = page.getByRole('option', { name: new RegExp(`Cambiar a ${companyName}`) });
  await expect(option).toBeVisible();
  await Promise.all([page.waitForURL(/\/dashboard$/), page.keyboard.press('Enter')]);
}

const companyButton = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name.slice(0, 1)}\\s*${name}`) });

test.describe('una persona en dos empresas', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('elige empresa al entrar, ve su rol en cada una y cambia desde ⌘K', async ({ page }) => {
    await login(page, MULTI_USER_EMAIL, OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/seleccionar-empresa/);
    await expect(page.getByText('Empresa principal · Vendedor')).toBeVisible();
    await expect(page.getByText('Acceso adicional · Contador')).toBeVisible();

    await Promise.all([page.waitForURL(/\/dashboard$/), page.getByRole('button', { name: new RegExp(SECOND) }).click()]);
    await dismissTour(page);
    await expect(companyButton(page, SECOND)).toBeVisible();

    await switchWithCommandMenu(page, HOME);
    await dismissTour(page);
    await expect(companyButton(page, HOME)).toBeVisible();
  });

  test('cambiar de empresa en una pestaña bloquea las otras', async ({ context }) => {
    const first = await context.newPage();
    await login(first, MULTI_USER_EMAIL, OWNER_PASSWORD);
    await Promise.all([first.waitForURL(/\/dashboard$/), first.getByRole('button', { name: new RegExp(HOME) }).click()]);
    await dismissTour(first);

    const second = await context.newPage();
    await second.goto('/dashboard');
    await dismissTour(second);
    await switchWithCommandMenu(second, SECOND);

    await first.bringToFront();
    const dialog = first.getByRole('alertdialog', { name: 'Cambiaste de empresa en otra pestaña' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(SECOND);
    await Promise.all([first.waitForEvent('load'), dialog.getByRole('button', { name: `Recargar en ${SECOND}` }).click()]);
    await dismissTour(first);
    await expect(companyButton(first, SECOND)).toBeVisible();
  });
});

test.describe('con otros modales abiertos', () => {
  test.use({ storageState: OWNER_STATE });

  // El dueño de la empresa de prueba ve además el tour y el asistente de
  // configuración: el bloqueo tiene que quedar por encima de ambos.
  test('el aviso queda por encima del tour y del asistente', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/dashboard');
    const second = await context.newPage();
    await second.goto('/dashboard');
    await expect(first.getByRole('alertdialog')).toHaveCount(0);

    await second.evaluate(() => {
      const channel = new BroadcastChannel('aether-active-company');
      channel.postMessage({ companyId: 'otra-empresa', companyName: 'Otra Empresa SpA' });
      channel.close();
    });

    await first.bringToFront();
    const dialog = first.getByRole('alertdialog', { name: 'Cambiaste de empresa en otra pestaña' });
    await expect(dialog).toBeVisible();
    await Promise.all([first.waitForEvent('load'), dialog.getByRole('button', { name: 'Recargar en Otra Empresa SpA' }).click()]);
  });
});
