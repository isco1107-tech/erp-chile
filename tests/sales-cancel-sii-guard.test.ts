import { prisma } from '@/lib/prisma';

/**
 * Anular vs. Nota de Crédito.
 *
 * Anular (CONTEXT.md) deja sin efecto dentro de Aether un documento que aún
 * no llega al SII. Un DTE ya despachado (con Track ID o con estado de envío
 * más allá de PENDING) sigue vigente ante el SII: anularlo acá revertiría
 * stock, pagos y asientos mientras el SII lo mantiene. Se corrige con NC.
 */

jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postCreditNoteIssued: jest.fn(),
  postSalesDocumentIssued: jest.fn(),
  reverseSalesDocumentPosting: jest.fn().mockResolvedValue(undefined),
}));

import { cancelSalesDocument } from '@/modules/sales/services/sales.service';
import { isSubmittedToSii } from '@/modules/sales/cancellation';

interface DocStub {
  id: string;
  companyId: string;
  status: string;
  dteType: string;
  folio: number | null;
  totalAmount: number;
  warehouseId: string;
  contactId: string;
  items: never[];
  cashShift: null;
  siiTrackId: string | null;
  siiStatus: string | null;
}

function docStub(overrides: Partial<DocStub> = {}): DocStub {
  return {
    id: 'doc_1',
    companyId: 'cmp_1',
    status: 'ISSUED',
    dteType: 'FACTURA_33',
    folio: 101,
    totalAmount: 119000,
    warehouseId: 'wh_1',
    contactId: 'ct_1',
    items: [],
    cashShift: null,
    siiTrackId: null,
    siiStatus: 'PENDING',
    ...overrides,
  };
}

function mockCancelTransaction(document: DocStub) {
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];

  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: unknown) => {
    const tx = {
      salesDocument: {
        findFirst: async () => document,
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          updates.push(args);
          Object.assign(document, args.data);
          return { count: 1 };
        },
      },
      payment: { findMany: async () => [], create: async () => ({}) },
      product: { findFirst: async () => null },
    };
    return (callback as (client: unknown) => Promise<unknown>)(tx);
  }) as never);

  return updates;
}

afterEach(() => jest.restoreAllMocks());

describe('isSubmittedToSii', () => {
  it('no considera despachado un documento pendiente o sin estado', () => {
    expect(isSubmittedToSii({ siiTrackId: null, siiStatus: null })).toBe(false);
    expect(isSubmittedToSii({ siiTrackId: null, siiStatus: 'PENDING' })).toBe(false);
  });

  it('considera despachado un documento con Track ID o estado posterior a PENDING', () => {
    expect(isSubmittedToSii({ siiTrackId: '123456', siiStatus: 'PENDING' })).toBe(true);
    expect(isSubmittedToSii({ siiTrackId: null, siiStatus: 'SENT' })).toBe(true);
    expect(isSubmittedToSii({ siiTrackId: null, siiStatus: 'ACCEPTED' })).toBe(true);
  });
});

describe('cancelSalesDocument — guard de envío al SII', () => {
  it('anula un DTE timbrado que aún no tiene Track ID', async () => {
    const document = docStub({ siiTrackId: null, siiStatus: 'PENDING' });
    const updates = mockCancelTransaction(document);

    const result = await cancelSalesDocument('cmp_1', 'doc_1', 'Error de digitación');

    expect(result.status).toBe('CANCELLED');
    expect(updates).toContainEqual({
      where: { id: 'doc_1', companyId: 'cmp_1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('rechaza anular un DTE con Track ID y pide emitir Nota de Crédito', async () => {
    const document = docStub({ siiTrackId: '0123456789', siiStatus: 'SENT' });
    const updates = mockCancelTransaction(document);

    await expect(cancelSalesDocument('cmp_1', 'doc_1')).rejects.toThrow(/Nota de Crédito/);
    expect(updates).toHaveLength(0);
    expect(document.status).toBe('ISSUED');
  });

  it('rechaza anular un DTE con estado del SII posterior a PENDING aunque no tenga Track ID', async () => {
    const document = docStub({ siiTrackId: null, siiStatus: 'ACCEPTED' });
    const updates = mockCancelTransaction(document);

    await expect(cancelSalesDocument('cmp_1', 'doc_1')).rejects.toThrow(/Nota de Crédito/);
    expect(updates).toHaveLength(0);
  });
});
