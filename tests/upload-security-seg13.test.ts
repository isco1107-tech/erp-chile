/**
 * SEG-13 — subidas de archivos.
 *
 * 1. `promissory-notes/document-upload`: debía confiar solo en `file.type`
 *    (declarado por el navegador de quien sube, trivial de falsificar). Ahora
 *    reusa `sniffCertificateType` — mismo sniffer que ya protegía
 *    `candidates/document-upload` — para confirmar el formato real por los
 *    primeros bytes.
 * 2. `messaging/attachments/upload`: subía el archivo cifrado al storage
 *    ANTES de comprobar con `assertParticipant` que quien sube participa en
 *    la conversación. Ahora autoriza primero: un no-participante no debe
 *    disparar ninguna llamada a `put` (la función de subida).
 */

const SESSION = { id: 'user-1', companyId: 'company-1', email: 'staff@empresa.cl', role: 'ADMIN' };

describe('SEG-13 — promissory-notes/document-upload valida la firma binaria real', () => {
  let mockRequireAuthWithPermission: jest.Mock;
  let mockPut: jest.Mock;
  let POST: typeof import('../src/app/api/promissory-notes/document-upload/route').POST;

  beforeEach(() => {
    jest.resetModules();

    mockRequireAuthWithPermission = jest.fn().mockResolvedValue(SESSION);
    mockPut = jest.fn().mockResolvedValue({ url: 'https://files.example.com/promissory-notes/company-1/x.pdf' });

    jest.doMock('@/lib/auth/guards', () => ({
      requireAuthWithPermission: (...args: unknown[]) => mockRequireAuthWithPermission(...args),
      AuthError: class extends Error {
        status = 401;
      },
      ModuleNotEnabledError: class extends Error {},
      TenantInactiveError: class extends Error {},
    }));
    jest.doMock('@/lib/storage/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }));
    jest.doMock('@/lib/observability', () => ({ captureException: jest.fn() }));

    ({ POST } = require('../src/app/api/promissory-notes/document-upload/route'));
  });

  afterEach(() => {
    jest.dontMock('@/lib/auth/guards');
    jest.dontMock('@/lib/storage/blob');
    jest.dontMock('@/lib/observability');
  });

  function formDataRequest(fileName: string, mimeType: string, bytes: number[]) {
    const form = new FormData();
    const file = new File([new Uint8Array(bytes)], fileName, { type: mimeType });
    form.append('file', file);
    return new Request('https://aether.example/api/promissory-notes/document-upload', {
      method: 'POST',
      body: form,
    });
  }

  it('rechaza un archivo cuyo `type` dice PDF pero no tiene la firma %PDF (MIME falsificado)', async () => {
    // "type" declarado por el cliente es application/pdf, pero los bytes reales
    // son de un ejecutable/cualquier binario arbitrario — sin la firma %PDF.
    const fakePdfBytes = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]; // cabecera MZ (ejecutable Windows)
    const req = formDataRequest('pagare.pdf', 'application/pdf', fakePdfBytes);

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Formato no admitido/);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('acepta un PDF real (firma %PDF en los primeros bytes) aunque el `type` declarado sea distinto', async () => {
    const realPdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // %PDF-1.4
    const req = formDataRequest('pagare.pdf', 'text/plain', realPdfBytes);

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [pathname, , options] = mockPut.mock.calls[0];
    expect(pathname).toMatch(/\.pdf$/);
    expect(options.contentType).toBe('application/pdf');
  });
});

describe('SEG-13 — messaging/attachments/upload autoriza ANTES de subir al storage', () => {
  let mockRequireAuthWithPermission: jest.Mock;
  let mockAssertParticipant: jest.Mock;
  let mockCreatePendingAttachment: jest.Mock;
  let mockPut: jest.Mock;
  let mockEncryptFileBuffer: jest.Mock;
  let POST: typeof import('../src/app/api/messaging/attachments/upload/route').POST;

  beforeEach(() => {
    jest.resetModules();

    mockRequireAuthWithPermission = jest.fn().mockResolvedValue(SESSION);
    mockAssertParticipant = jest.fn();
    mockCreatePendingAttachment = jest.fn().mockResolvedValue({ id: 'att-1' });
    mockPut = jest.fn().mockResolvedValue({ url: 'https://files.example.com/messaging/company-1/x.enc' });
    mockEncryptFileBuffer = jest.fn().mockReturnValue(Buffer.from('cipher'));

    jest.doMock('@/lib/auth/guards', () => ({
      requireAuthWithPermission: (...args: unknown[]) => mockRequireAuthWithPermission(...args),
      AuthError: class extends Error {
        status = 401;
      },
      ModuleNotEnabledError: class extends Error {},
      TenantInactiveError: class extends Error {},
    }));
    jest.doMock('@/lib/storage/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }));
    jest.doMock('@/lib/messaging/crypto', () => ({
      encryptFileBuffer: (...args: unknown[]) => mockEncryptFileBuffer(...args),
    }));
    jest.doMock('@/lib/observability', () => ({ captureException: jest.fn() }));
    jest.doMock('@/modules/messaging/services/messaging.service', () => ({
      assertParticipant: (...args: unknown[]) => mockAssertParticipant(...args),
      createPendingAttachment: (...args: unknown[]) => mockCreatePendingAttachment(...args),
    }));

    ({ POST } = require('../src/app/api/messaging/attachments/upload/route'));
  });

  afterEach(() => {
    jest.dontMock('@/lib/auth/guards');
    jest.dontMock('@/lib/storage/blob');
    jest.dontMock('@/lib/messaging/crypto');
    jest.dontMock('@/lib/observability');
    jest.dontMock('@/modules/messaging/services/messaging.service');
  });

  function formDataRequest(conversationId: string) {
    const form = new FormData();
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'archivo.pdf', { type: 'application/pdf' });
    form.append('file', file);
    form.append('conversationId', conversationId);
    return new Request('https://aether.example/api/messaging/attachments/upload', {
      method: 'POST',
      body: form,
    });
  }

  it('un usuario que NO participa de la conversación no dispara ninguna subida al storage', async () => {
    mockAssertParticipant.mockRejectedValue(new Error('Conversación no encontrada'));

    const req = formDataRequest('conv-ajena');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockAssertParticipant).toHaveBeenCalledWith('company-1', 'conv-ajena', 'user-1');
    // La comprobación central de SEG-13: `put` (subida real al storage) NUNCA
    // se llama si la autorización falla.
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockEncryptFileBuffer).not.toHaveBeenCalled();
    expect(mockCreatePendingAttachment).not.toHaveBeenCalled();
  });

  it('un participante legítimo sube el archivo normalmente, en orden: autorizar y luego subir', async () => {
    mockAssertParticipant.mockResolvedValue({ id: 'participant-1' });

    const req = formDataRequest('conv-1');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockAssertParticipant).toHaveBeenCalledWith('company-1', 'conv-1', 'user-1');
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockCreatePendingAttachment).toHaveBeenCalledTimes(1);

    const assertOrder = mockAssertParticipant.mock.invocationCallOrder[0];
    const putOrder = mockPut.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(putOrder);
  });
});
