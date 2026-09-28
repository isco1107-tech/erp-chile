import { expect, test } from '@playwright/test';
import { OWNER_STATE } from './support';

test.use({ storageState: OWNER_STATE });

// Una sola cookie de sesión para todas las pestañas: si en una se cambia de
// empresa, las demás deben bloquearse antes de que alguien guarde algo en la
// empresa equivocada. El cambio se simula con el mismo anuncio que hace una
// pestaña al cargar en otra empresa.
test('una pestaña se bloquea cuando en otra se cambia de empresa', async ({ context }) => {
  const first = await context.newPage();
  await first.goto('/dashboard');
  const second = await context.newPage();
  await second.goto('/dashboard');

  // Dos pestañas en la misma empresa conviven sin aviso.
  await expect(first.getByRole('alertdialog')).toHaveCount(0);
  await expect(second.getByRole('alertdialog')).toHaveCount(0);

  await second.evaluate(() => {
    const channel = new BroadcastChannel('aether-active-company');
    channel.postMessage({ companyId: 'otra-empresa', companyName: 'Otra Empresa SpA' });
    channel.close();
  });

  await first.bringToFront();
  const dialog = first.getByRole('alertdialog', { name: 'Cambiaste de empresa en otra pestaña' });
  await expect(dialog).toBeVisible();
  // El aviso queda por encima de cualquier otro modal abierto (tour, asistente)
  // y su botón recarga la pestaña.
  await Promise.all([first.waitForEvent('load'), dialog.getByRole('button', { name: 'Recargar en Otra Empresa SpA' }).click()]);
  await expect(first.getByRole('alertdialog', { name: 'Cambiaste de empresa en otra pestaña' })).toHaveCount(0);
});
