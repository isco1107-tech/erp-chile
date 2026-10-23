import { POST as upload } from '@/app/api/store/asset-upload/route';
import { POST as uploadWebsite } from '@/app/api/web-sites/asset-upload/route';
import { requireAuthWithPermission, can } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { put, del } from '@/lib/storage/blob';
import { assertStoreModule } from '@/modules/ecommerce/services/store-settings.service';
import { assertCanAddAsset, registerAsset } from '@/modules/web-sites/services/web-sites.service';

jest.mock('@/lib/auth/guards', () => ({ requireAuthWithPermission: jest.fn(), can: jest.fn(), authErrorMessage: () => null }));
jest.mock('@/lib/prisma', () => ({ prisma: { webSiteStore: { findFirst: jest.fn() } } }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn(), del: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/modules/ecommerce/services/store-settings.service', () => ({ assertStoreModule: jest.fn() }));
jest.mock('@/modules/web-sites/services/web-sites.service', () => ({
  MAX_ASSET_BYTES: 4 * 1024 * 1024,
  WebSiteError: class extends Error {},
  assertCanAddAsset: jest.fn(),
  registerAsset: jest.fn(),
}));

const session = { id: 'u1', companyId: 'company-a', name: 'Gestora' };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const imageUrl = 'https://test.public.blob.vercel-storage.com/web-sites/company-a/site-a/foto.png';
function request(bytes: Uint8Array = png, siteId = 'site-a') {
  const form = new FormData();
  form.set('siteId', siteId);
  form.set('file', new File([bytes as Uint8Array<ArrayBuffer>], 'imagen.jpg', { type: 'image/jpeg' }));
  form.set('scope', 'website'); // Client-controlled fields must never select the permission scope.
  return new Request('http://localhost/api/store/asset-upload', { method: 'POST', body: form });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireAuthWithPermission).mockResolvedValue(session as never);
  jest.mocked(can).mockImplementation((_session, permission) => permission === 'store:write');
  jest.mocked(prisma.webSiteStore.findFirst).mockResolvedValue({ id: 'store-a' } as never);
  jest.mocked(assertStoreModule).mockResolvedValue(undefined);
  jest.mocked(assertCanAddAsset).mockResolvedValue(undefined);
  jest.mocked(put).mockResolvedValue({ url: imageUrl } as never);
  jest.mocked(del).mockResolvedValue(undefined);
  jest.mocked(registerAsset).mockResolvedValue({ id: 'asset-a', url: imageUrl } as never);
});

test('una ficha puede subir su foto con permisos de tienda y sin permiso de Sitios web', async () => {
  expect((await upload(request())).status).toBe(200);
  expect(requireAuthWithPermission).toHaveBeenCalledWith('store:read');
  expect(assertStoreModule).toHaveBeenCalledWith('company-a');
  expect(prisma.webSiteStore.findFirst).toHaveBeenCalledWith({ where: { companyId: 'company-a', siteId: 'site-a' }, select: { id: true } });
  expect(put).toHaveBeenCalledWith(
    expect.stringMatching(/^web-sites\/company-a\/site-a\/.*\.png$/),
    expect.any(Buffer),
    expect.objectContaining({ contentType: 'image/png' }),
  );
});
test('un gestor puede subir el logo sin tener el permiso de editar productos', async () => {
  jest.mocked(can).mockImplementation((_session, permission) => permission === 'store:manage');
  expect((await upload(request())).status).toBe(200);
});
test('solo lectura nunca sube archivos, aunque el cuerpo pida scope website', async () => {
  jest.mocked(can).mockReturnValue(false);
  expect((await upload(request())).status).toBe(403);
  expect(put).not.toHaveBeenCalled();
});
test('una tienda ajena no dispara una subida', async () => {
  jest.mocked(prisma.webSiteStore.findFirst).mockResolvedValue(null);
  expect((await upload(request(png, 'site-b'))).status).toBe(404);
  expect(put).not.toHaveBeenCalled();
});
test.each(['<svg onload="alert(1)"></svg>', 'GIF89a', 'MZ-executable'])('rechaza bytes peligrosos aunque declaren ser JPG: %s', async (bytes) => {
  expect((await upload(request(new TextEncoder().encode(bytes)))).status).toBe(400);
  expect(put).not.toHaveBeenCalled();
});
test('si falla el registro, elimina el archivo para evitar un huérfano en el almacenamiento', async () => {
  jest.mocked(registerAsset).mockRejectedValueOnce(new Error('database unavailable'));
  expect((await upload(request())).status).toBe(500);
  expect(del).toHaveBeenCalledWith(imageUrl);
});
test('la ruta del constructor conserva su permiso original aunque el cuerpo pida otro alcance', async () => {
  jest.mocked(prisma.webSiteStore.findFirst).mockResolvedValue(null);
  expect((await uploadWebsite(request())).status).toBe(200);
  expect(requireAuthWithPermission).toHaveBeenCalledWith('websites:write');
  expect(assertStoreModule).not.toHaveBeenCalled();
});

test('un permiso del constructor no permite subir imágenes a una tienda independiente', async () => {
  expect((await uploadWebsite(request())).status).toBe(403);
  expect(prisma.webSiteStore.findFirst).toHaveBeenCalledWith({ where: { companyId: 'company-a', siteId: 'site-a', standalone: true }, select: { id: true } });
  expect(put).not.toHaveBeenCalled();
});
