import os from 'node:os';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { writeBlankY4m, writeEan13Y4m } from './fake-camera';
import { OWNER_STATE } from './support';

/**
 * Piezas comunes de las pruebas de la app del bodeguero (`/bodega`): cámara
 * falsa, consultas a la API y creación idempotente de los productos de prueba.
 */

export const EAN_ACEITE = '4006381333931';
export const STATE = { storageState: OWNER_STATE };
const chromiumPath = process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {};

const cameraDir = path.join(os.tmpdir(), 'aether-e2e-camera');
export const eanVideo = writeEan13Y4m(EAN_ACEITE, path.join(cameraDir, 'ean.y4m'));
export const blankVideo = writeBlankY4m(path.join(cameraDir, 'blank.y4m'));

export const fakeCamera = (video: string) => ({
  ...chromiumPath,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
});

/** EAN-13 válido que no existe todavía (sin esto, repetir la prueba sumaría al producto de la corrida anterior). */
export function freshEan13(): string {
  const body = `780${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 12);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export interface ProductRead {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  barcode: string | null;
  imageUrl: string | null;
  tracksLots: boolean;
  isActive: boolean;
  stock: number;
  totalStock: number;
}

export async function lookup(request: APIRequestContext, code: string, warehouseId: string): Promise<(ProductRead & Record<string, unknown>) | null> {
  const response = await request.get(`/api/bodega/lookup?${new URLSearchParams({ code, warehouseId })}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data.match;
}

export async function bootstrap(request: APIRequestContext) {
  const response = await request.get('/api/bodega/bootstrap');
  expect(response.status()).toBe(200);
  return (await response.json()).data as { warehouses: Array<{ id: string; name: string }>; can: { move: boolean; createProduct: boolean } };
}

/** Productos conocidos de la prueba, creados por la propia API (idempotente: las claves son fijas). */
export async function seedCatalog(request: APIRequestContext) {
  const { warehouses } = await bootstrap(request);
  const warehouseId = warehouses[0]!.id;
  const response = await request.post('/api/bodega/sync', {
    data: {
      ops: [
        { kind: 'CREATE_PRODUCT', clientOpId: 'e2e-seed-aceite-0001', mode: 'RECEIVE', warehouseId, quantity: 10, product: { name: 'Aceite Maravilla Chef 900 ml', sku: 'E2E-ACE-900', brand: 'Chef', barcode: EAN_ACEITE, unit: 'UN' } },
        { kind: 'CREATE_PRODUCT', clientOpId: 'e2e-seed-harina-0001', mode: 'RECEIVE', warehouseId, quantity: 4, product: { name: 'Harina E2E Selecta 1 kg', sku: 'E2E-HAR-1KG', brand: 'Selecta', unit: 'KG' } },
      ],
    },
  });
  expect(response.status()).toBe(200);
  const results = (await response.json()).data.results as Array<{ status: string }>;
  for (const result of results) expect(['APPLIED', 'REJECTED']).toContain(result.status);
  return warehouseId;
}

export async function openApp(page: Page) {
  await page.goto('/bodega');
  await expect(page.getByText('¿Qué vas a hacer?')).toBeVisible({ timeout: 30_000 });
  // El indicador de desarrollo de Next (esquina inferior) tapa botones; no existe en producción.
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
}

