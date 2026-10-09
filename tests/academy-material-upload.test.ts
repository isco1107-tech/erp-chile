/**
 * Subida de material de la academia (`POST /api/academy/material-upload`):
 * el archivo se valida por sus bytes, se guarda en la carpeta de SU empresa con
 * un nombre inadivinable, el grupo y la clase deben ser de esa empresa, un fallo
 * al registrarlo no deja el archivo huérfano, y enviarlo por correo es opcional
 * y no deshace la subida si falla.
 */

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn(async (pathname: string) => ({ url: `https://archivos.test/${pathname}`, pathname })), del: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/modules/academy/services/academy-material.service', () => ({
  assertMaterialTarget: jest.fn(),
  createFileMaterial: jest.fn(),
  sendMaterial: jest.fn(),
  deleteStoredFile: jest.fn(),
}));

import { POST } from '@/app/api/academy/material-upload/route';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { MATERIAL_MAX_BYTES } from '@/lib/academy/materials';
import { put } from '@/lib/storage/blob';
import { AcademyError } from '@/modules/academy/services/academy.service';
import * as materials from '@/modules/academy/services/academy-material.service';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, ...new Array(40).fill(0)]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(40).fill(0)]);
const ROW = { id: 'm1', groupId: 'g1', sessionId: null };

function upload(fields: Record<string, string>, file: { bytes: Uint8Array; name: string } | null) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('file', new File([file.bytes as Uint8Array<ArrayBuffer>], file.name));
  return POST(new Request('https://app.test/api/academy/material-upload', { method: 'POST', body: form }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireAuthWithPermission as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@b.cl', companyId: 'co_1' });
  (materials.assertMaterialTarget as jest.Mock).mockResolvedValue(undefined);
  (materials.createFileMaterial as jest.Mock).mockResolvedValue(ROW);
});

describe('subida de material', () => {
  it('pide el permiso de escritura de la academia', async () => {
    await upload({ groupId: 'g1' }, { bytes: PDF, name: 'clase.pdf' });
    expect(requireAuthWithPermission).toHaveBeenCalledWith('academy:write');
  });

  it('sin sesión o sin permiso no guarda nada', async () => {
    (requireAuthWithPermission as jest.Mock).mockRejectedValue(new AuthError('Sin permiso', 403));
    const response = await upload({ groupId: 'g1' }, { bytes: PDF, name: 'clase.pdf' });
    expect(response.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it('guarda un PDF en la carpeta de la empresa con nombre aleatorio y lo registra', async () => {
    const response = await upload({ groupId: 'g1', title: 'Clase 3', description: 'Léela antes' }, { bytes: PDF, name: 'Clase 3 – Postura.pdf' });
    expect(response.status).toBe(200);
    const [key, , options] = (put as jest.Mock).mock.calls[0]!;
    expect(key).toMatch(/^academy-material\/co_1\/[0-9a-f]{20}-clase-3-postura\.pdf$/);
    expect(options).toMatchObject({ access: 'public', contentType: 'application/pdf', addRandomSuffix: false });
    expect(materials.assertMaterialTarget).toHaveBeenCalledWith('co_1', 'g1', null);
    expect(materials.createFileMaterial).toHaveBeenCalledWith('co_1', 'u1', expect.objectContaining({ groupId: 'g1', title: 'Clase 3', description: 'Léela antes', fileName: 'Clase 3 – Postura.pdf', contentType: 'application/pdf', sizeBytes: PDF.length }));
    expect(materials.sendMaterial).not.toHaveBeenCalled();
  });

  it('si no hay título usa el nombre del archivo, y la clase indicada se verifica', async () => {
    await upload({ groupId: 'g1', sessionId: 's9' }, { bytes: PDF, name: 'Guía de estilo.pdf' });
    expect(materials.assertMaterialTarget).toHaveBeenCalledWith('co_1', 'g1', 's9');
    expect(materials.createFileMaterial).toHaveBeenCalledWith('co_1', 'u1', expect.objectContaining({ title: 'Guía de estilo', sessionId: 's9' }));
  });

  it('rechaza lo que no es un documento aceptado, aunque el nombre lo disfrace', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    for (const file of [{ bytes: html, name: 'clase.pdf' }, { bytes: ZIP, name: 'programa.exe' }, { bytes: ZIP, name: 'fotos.zip' }]) {
      const response = await upload({ groupId: 'g1' }, file);
      expect(response.status).toBe(400);
    }
    expect(put).not.toHaveBeenCalled();
  });

  it('un Office moderno pasa con su extensión', async () => {
    const response = await upload({ groupId: 'g1' }, { bytes: ZIP, name: 'Clase.pptx' });
    expect(response.status).toBe(200);
    expect((put as jest.Mock).mock.calls[0]![2]).toMatchObject({ contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  });

  it('rechaza un archivo vacío o demasiado grande con el motivo', async () => {
    expect((await upload({ groupId: 'g1' }, { bytes: new Uint8Array(0), name: 'x.pdf' })).status).toBe(400);
    const big = new Uint8Array(MATERIAL_MAX_BYTES + 1);
    big.set(PDF);
    const response = await upload({ groupId: 'g1' }, { bytes: big, name: 'x.pdf' });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain('enlace');
    expect(put).not.toHaveBeenCalled();
  });

  it('exige el archivo y el grupo', async () => {
    expect((await upload({ groupId: 'g1' }, null)).status).toBe(400);
    expect((await upload({}, { bytes: PDF, name: 'x.pdf' })).status).toBe(400);
  });

  it('un grupo o clase ajenos se rechazan antes de subir nada', async () => {
    (materials.assertMaterialTarget as jest.Mock).mockRejectedValue(new AcademyError('El grupo seleccionado no existe'));
    const response = await upload({ groupId: 'ajeno' }, { bytes: PDF, name: 'x.pdf' });
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('si no se pudo registrar, el archivo subido se borra', async () => {
    (materials.createFileMaterial as jest.Mock).mockRejectedValue(new Error('db caída'));
    const response = await upload({ groupId: 'g1' }, { bytes: PDF, name: 'x.pdf' });
    expect(response.status).toBe(500);
    expect(materials.deleteStoredFile).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/archivos\.test\/academy-material\/co_1\//), 'co_1');
  });

  it('con "enviar" lo manda al grupo y devuelve el resultado', async () => {
    (materials.sendMaterial as jest.Mock).mockResolvedValue({ sent: 12, failed: 1, withoutEmail: ['Cata'], truncated: false });
    const response = await upload({ groupId: 'g1', send: '1' }, { bytes: PDF, name: 'x.pdf' });
    const json = (await response.json()) as { success: boolean; data: { send: { sent: number }; sendError: string | null } };
    expect(materials.sendMaterial).toHaveBeenCalledWith('co_1', 'm1');
    expect(json.data.send.sent).toBe(12);
    expect(json.data.sendError).toBeNull();
  });

  it('si el envío falla, el material queda guardado y se explica por qué', async () => {
    (materials.sendMaterial as jest.Mock).mockRejectedValue(new AcademyError('Ninguna alumna de este grupo tiene un correo registrado.'));
    const response = await upload({ groupId: 'g1', send: '1' }, { bytes: PDF, name: 'x.pdf' });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; data: { send: unknown; sendError: string } };
    expect(json.success).toBe(true);
    expect(json.data.send).toBeNull();
    expect(json.data.sendError).toContain('correo registrado');
    expect(materials.deleteStoredFile).not.toHaveBeenCalled();
  });
});
