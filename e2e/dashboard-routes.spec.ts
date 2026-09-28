import { expect, test } from '@playwright/test';
import { OWNER_STATE, dashboardRoutes } from './support';

test.use({ storageState: OWNER_STATE });

const routes = dashboardRoutes();

test('el registro de navegación tiene rutas que recorrer', () => {
  expect(routes.length).toBeGreaterThan(20);
});

// Cada pantalla del menú, contra una base real recién migrada: atrapa las
// consultas que fallan con el esquema real (columnas que solo existían por
// `db push`, relaciones mal escritas) y las pantallas que revientan sin datos.
// Un módulo no contratado puede mostrar su aviso de módulo apagado, pero
// nunca un error.
for (const route of routes) {
  test(`${route} carga sin error`, async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(route);
    expect(response?.status(), `${route} respondió ${response?.status()}`).toBeLessThan(500);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Algo salió mal')).toHaveCount(0);
    expect(serverErrors, 'respuestas 5xx durante la carga').toEqual([]);
    expect(pageErrors, 'errores de JavaScript en el navegador').toEqual([]);
  });
}
