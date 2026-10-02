/**
 * SEG-12 (auditoría 2026-09-14): el webhook de ZapSign debe (1) validar el
 * token contra un `CandidateDocument` local ANTES de llamar a ZapSign o
 * tocar storage, y (2) responder 5xx — no 200 — ante una falla transitoria
 * remota, para que ZapSign reintente en vez de darla por perdida.
 */

jest.mock('@/lib/zapsign/client', () => ({ getDocumentStatus: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn() }));
jest.mock('@/lib/integrations/company-integrations', () => ({ getCompanyZapsignConfig: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn(), getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/modules/candidates/services/documents.service', () => ({
  findCandidateDocumentByZapsignToken: jest.fn(),
  markContractSignedByZapsignToken: jest.fn(),
  markTestSignatureByZapsignToken: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { getDocumentStatus } from '@/lib/zapsign/client';
import { getCompanyZapsignConfig } from '@/lib/integrations/company-integrations';
import { put } from '@/lib/storage/blob';
import { captureException } from '@/lib/observability';
import {
  findCandidateDocumentByZapsignToken,
  markContractSignedByZapsignToken,
  markTestSignatureByZapsignToken,
} from '@/modules/candidates/services/documents.service';
import { POST } from '@/app/api/webhooks/zapsign/route';

function makeRequest(body: unknown): Request {
  return new Request('https://app.test/api/webhooks/zapsign', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const COMPANY_ZAPSIGN = { token: 'token-de-la-empresa', baseUrl: 'https://api.zapsign.com.br' };

beforeEach(() => (getCompanyZapsignConfig as jest.Mock).mockResolvedValue(COMPANY_ZAPSIGN));
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
      zapsignSandbox: false,
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
    // El estado se reconsulta con la cuenta de ZapSign de la empresa dueña del documento, no con la de otra.
    expect(getCompanyZapsignConfig).toHaveBeenCalledWith('c1', false);
    expect(getDocumentStatus).toHaveBeenCalledWith('token-real', COMPANY_ZAPSIGN);
    expect(markContractSignedByZapsignToken).toHaveBeenCalledWith('token-real', 'https://blob.test/candidates/zapsign-signed/token-real.pdf');
  });
  describe('firmas del sandbox de ZapSign', () => {
    const sandboxDoc = { id: 'doc1', companyId: 'c1', candidateId: 'cand1', signedAt: null, zapsignSandbox: true, zapsignTestSignedAt: null };

    it('reconsulta en el entorno donde se creó el documento, no en el modo actual de la empresa', async () => {
      (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue(sandboxDoc);
      (getDocumentStatus as jest.Mock).mockResolvedValue({ status: 'pending', signedFileUrl: null });

      await POST(makeRequest({ token: 'token-sandbox' }));

      expect(getCompanyZapsignConfig).toHaveBeenCalledWith('c1', true);
    });

    it('una firma de sandbox no firma el contrato: queda como firma de prueba, sin descargar el PDF', async () => {
      (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue(sandboxDoc);
      (getDocumentStatus as jest.Mock).mockResolvedValue({ status: 'signed', signedFileUrl: 'https://zapsign.test/signed.pdf' });
      (markTestSignatureByZapsignToken as jest.Mock).mockResolvedValue(true);
      const fetchSpy = jest.spyOn(global, 'fetch');

      const response = await POST(makeRequest({ token: 'token-sandbox' }));

      expect(response.status).toBe(200);
      expect(markTestSignatureByZapsignToken).toHaveBeenCalledWith('token-sandbox');
      expect(markContractSignedByZapsignToken).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('un reintento tras la firma de prueba no vuelve a consultar a ZapSign', async () => {
      (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue({ ...sandboxDoc, zapsignTestSignedAt: new Date() });

      const response = await POST(makeRequest({ token: 'token-sandbox' }));

      expect(response.status).toBe(200);
      expect(getDocumentStatus).not.toHaveBeenCalled();
    });

    it('rechaza descargar un PDF firmado desde una URL no segura', async () => {
      (findCandidateDocumentByZapsignToken as jest.Mock).mockResolvedValue({ id: 'doc1', companyId: 'c1', candidateId: 'cand1', signedAt: null, zapsignSandbox: false });
      (getDocumentStatus as jest.Mock).mockResolvedValue({ status: 'signed', signedFileUrl: 'http://169.254.169.254/latest/meta-data' });
      const fetchSpy = jest.spyOn(global, 'fetch');

      const response = await POST(makeRequest({ token: 'token-real' }));

      expect(response.status).toBe(502);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
