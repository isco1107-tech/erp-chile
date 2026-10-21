/**
 * Subida de imágenes del estudio de afiches (`/api/projects/cover-upload` con
 * `purpose=poster-photo|poster-logo`): carpeta propia por empresa (así el motor
 * puede exigir que una imagen del afiche sea de quien lo dibuja) y tamaños mínimos.
 */

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn(async (pathname: string) => ({ url: `https://x.public.blob.vercel-storage.com/${pathname}` })) }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));

import { POST } from '@/app/api/projects/cover-upload/route';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { put } from '@/lib/storage/blob';

/** Cabecera PNG mínima con el tamaño pedido (basta para el sniff de tipo y la lectura de tamaño). */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function upload(purpose: string, bytes: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.set('projectId', 'pr_1');
  form.set('purpose', purpose);
  form.set('file', new File([bytes], 'logo.png', { type: 'image/png' }));
  return POST(new Request('https://app.test/api/projects/cover-upload', { method: 'POST', body: form }));
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  (requireAuthWithPermission as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@b.cl', companyId: 'co_1' });
  jest.spyOn(prisma.project, 'findFirst').mockResolvedValue({ id: 'pr_1' } as never);
});

describe('subida de imágenes de afiches', () => {
  it('logo: a la carpeta de afiches de la empresa, aunque sea chico y alargado', async () => {
    const response = await upload('poster-logo', png(300, 90));
    expect(response.status).toBe(200);
    expect((put as jest.Mock).mock.calls[0]![0]).toMatch(/^pageant-posters\/co_1\/pr_1-\d+-[0-9a-f]{8}\.png$/);
  });

  it('foto: rechaza una imagen chica con el motivo', async () => {
    const response = await upload('poster-photo', png(300, 300));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('La foto es muy chica (300 × 300 px)');
    expect(put).not.toHaveBeenCalled();
  });

  it('foto grande: también a la carpeta de afiches', async () => {
    expect((await upload('poster-photo', png(1080, 1350))).status).toBe(200);
    expect((put as jest.Mock).mock.calls[0]![0]).toMatch(/^pageant-posters\/co_1\//);
  });

  it('un propósito desconocido cae en portada (no en la carpeta de afiches)', async () => {
    await upload('inventado', png(1600, 900));
    expect((put as jest.Mock).mock.calls[0]![0]).toMatch(/^pageant-covers\/co_1\//);
  });

  it('el certamen se busca en la empresa de la sesión', async () => {
    await upload('poster-logo', png(300, 90));
    expect((prisma.project.findFirst as jest.Mock).mock.calls[0]![0].where).toEqual({ id: 'pr_1', companyId: 'co_1' });
  });
});
