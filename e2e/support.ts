import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/** Usuario que crea `prisma/seed.ts`. La contraseña sale de SEED_ADMIN_PASSWORD, igual que en el seed. */
export const OWNER_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@prueba.local';
export const OWNER_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '';

export const OWNER_STATE = path.join(__dirname, '.auth', 'owner.json');

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/**
 * Rutas del panel leídas del registro único de navegación
 * (src/lib/navigation/workspace-nav.ts). Se leen como texto, no importando
 * el módulo, para que el recorrido cubra solo cualquier pantalla nueva que
 * se agregue al menú sin tener que tocar este archivo.
 */
export function dashboardRoutes(): string[] {
  const source = readFileSync(path.join(__dirname, '..', 'src', 'lib', 'navigation', 'workspace-nav.ts'), 'utf8');
  const routes = [...source.matchAll(/href: '(\/dashboard[^']*)'/g)].map((match) => match[1]);
  return [...new Set(routes)];
}
