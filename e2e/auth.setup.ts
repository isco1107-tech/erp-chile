import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { OWNER_EMAIL, OWNER_PASSWORD, OWNER_STATE, login } from './support';

setup('inicia sesión como dueño de la empresa de prueba', async ({ page }) => {
  expect(OWNER_PASSWORD, 'Falta SEED_ADMIN_PASSWORD (o E2E_ADMIN_PASSWORD) en el entorno').not.toBe('');
  await login(page, OWNER_EMAIL, OWNER_PASSWORD);
  await page.waitForURL(/\/dashboard(\/|$|\?)/);
  mkdirSync(path.dirname(OWNER_STATE), { recursive: true });
  await page.context().storageState({ path: OWNER_STATE });
});
