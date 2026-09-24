/**
 * SEG-12 (auditoría 2026-09-14): el webhook de ZapSign debe (1) validar el
 * token contra un `CandidateDocument` local ANTES de llamar a ZapSign o
 * tocar storage, y (2) responder 5xx — no 200 — ante una falla transitoria
 * remota, para que ZapSign reintente en vez de darla por perdida.
 */

jest.mock('@/lib/zapsign/client', () => ({ getDocumentStatus: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn(), getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/modules/candidates/services/documents.service', () => ({
  findCandidateDocumentByZapsignToken: jest.fn(),
  markContractSignedByZapsignToken: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { getDocumentStatus } from '@/lib/zapsign/client';
import { put } from '@/lib/storage/blob';
import { captureException } from '@/lib/observability';
import {
  findCandidateDocumentByZapsignToken,
  markContractSignedByZapsignToken,
} from '@/modules/candidates/services/documents.service';
import { POST } from '@/app/api/webhooks/zapsign/route';

function makeRequest(body: unknown): Request {
  return new Request('https://app.test/api/webhooks/zapsign', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

afterEach(() => jest.restoreAllMocks());
afterEach(() => jest.clearAllMocks());

describe('Webhook de ZapSign — orden de validación (SEG-12)', () => {
  it('un token que no corresponde a ningún documento local no dispara llamadas a ZapSign ni al storage', async () => {
    (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue(null);

    const response = await POST(makeRequest({ token: 'token-ajeno' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(getDocumentStatus).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('una falla transitoria al consultar ZapSign responde 5xx en vez de 200, para permitir reintento', async () => {
    (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue({
      id: 'doc1',
      companyId: 'c1',
      candidateId: 'cand1',
      signedAt: null,
    });
    (getDocumentStatus as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));

    const response = await POST(makeRequest({ token: 'token-real' }));
    const json = await response.json();

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(json.success).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it('un documento ya firmado localmente responde 200 sin volver a consultar a ZapSign (idempotente)', async () => {
    (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue({
      id: 'doc1',
      companyId: 'c1',
      candidateId: 'cand1',
      signedAt: new Date('2026-01-01'),
    });

    const response = await POST(makeRequest({ token: 'token-real' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(getDocumentStatus).not.toHaveBeenCalled();
    expect(markContractSignedByZapsignToken).not.toHaveBeenCalled();
  });

  it('marca la firma y responde 200 cuando ZapSign confirma la firma de un documento local pendiente', async () => {
    (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue({
      id: 'doc1',
      companyId: 'c1',
      candidateId: 'cand1',
      signedAt: null,
    });
    (getDocumentStatus as jest.Mock).mockResolvedValue({ status: 'signed', signedFileUrl: 'https://zapsign.test/signed.pdf' });
    (put as jest.Mock).mockResolvedValue({ url: 'https://blob.test/candidates/zapsign-signed/token-real.pdf' });
    (markContractSignedByZapsignToken as jest.Mock).mockResolvedValue({
      document: { id: 'doc1', companyId: 'c1', candidateId: 'cand1', title: 'Contrato de imagen' },
      justSigned: true,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response);
    jest.spyOn(prisma.candidate, 'findUnique').mockResolvedValue({ fullName: 'Ana', stageName: null } as never);
    jest.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

    const response = await POST(makeRequest({ token: 'token-real' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(markContractSignedByZapsignToken).toHaveBeenCalledWith('token-real', 'https://blob.test/candidates/zapsign-signed/token-real.pdf');
  });
});
