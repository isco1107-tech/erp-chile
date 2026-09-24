import { prisma } from '@/lib/prisma';

/**
 * N-17 (auditoría 2026-09-14): el folio de compra es único por
 * `(companyId, contactId, documentType, folio)` — el mismo folio puede
 * pertenecer a la vez a una Factura y a una Nota de Crédito/Débito del
 * mismo proveedor. `createPurchaseDocument` buscaba el documento
 * referenciado por una Nota de Crédito solo por folio, sin `documentType`,
 * así que podía encontrar el documento equivocado. La búsqueda debe acotarse
 * a los tipos que agregan stock/deuda (Factura, Boleta, Guía de Despacho), y
 * el tope de NC previas debe descartar notas que en realidad corrigen un
 * documento distinto que casualmente comparte folio.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  applyStockOut: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/purchases-posting', () => ({
  postPurchaseDocumentIssued: jest.fn(),
  postPurchaseCreditNoteIssued: jest.fn(),
  reversePurchaseDocumentPosting: jest.fn(),
}));

import { createPurchaseDocument } from '@/modules/purchases/services/purchases.service';
import type { PurchaseDocumentCreateInput } from '@/modules/purchases/schema';

const STOP = 'STOP_ANTES_DE_CREAR';

const facturaOriginal = {
  id: 'fac1',
  companyId: 'c1',
  contactId: 'sup1',
  documentType: 'FACTURA',
  folio: '100',
  totalAmount: 100000,
  paidAmount: 0,
  items: [],
};

type FakeTx = {
  $queryRaw: jest.Mock;
  contact: { findFirst: jest.Mock };
  warehouse: { findFirst: jest.Mock };
  product: { findFirst: jest.Mock };
  purchaseDocument: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  companySettings: { findUnique: jest.Mock };
};

function fakeTx(overrides: Partial<FakeTx> = {}): FakeTx {
  const tx: FakeTx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'sup1', isSupplier: true }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', isDefault: true }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true }) },
    purchaseDocument: {
      findFirst: jest.fn().mockResolvedValue(facturaOriginal),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockRejectedValue(new Error(STOP)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    companySettings: { findUnique: jest.fn().mockResolvedValue({ purchaseApprovalThreshold: null }) },
    ...overrides,
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: FakeTx) => unknown) => callback(tx)) as never);
  return tx;
}

function creditNoteInput(overrides: Partial<PurchaseDocumentCreateInput> = {}): PurchaseDocumentCreateInput {
  return {
    contactId: 'sup1',
    documentType: 'NOTA_CREDITO',
    folio: '900',
    referenceFolio: '100',
    issueDate: '2026-09-20',
    items: [{ description: 'Devolución', quantity: 1, unitCost: 20000 }],
    ...overrides,
  } as PurchaseDocumentCreateInput;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('N-17: la NC de compra busca su original acotada a los tipos que agregan stock/deuda', () => {
  it('busca el documento referenciado con documentType entre los tipos "creditables" (Factura/Boleta/Guía)', async () => {
    const tx = fakeTx();

    await expect(createPurchaseDocument('c1', creditNoteInput(), 'ISSUED')).rejects.toThrow(STOP);

    const referencedLookupCall = tx.purchaseDocument.findFirst.mock.calls.find(
      ([args]: [{ where: { folio?: string } }]) => args?.where?.folio === '100'
    );
    expect(referencedLookupCall).toBeTruthy();
    const [args] = referencedLookupCall as [{ where: { documentType: { in: string[] } } }];
    expect(args.where.documentType).toEqual({ in: expect.arrayContaining(['FACTURA', 'BOLETA', 'GUIA_DESPACHO']) });
    expect(args.where.documentType.in).not.toContain('NOTA_CREDITO');
    expect(args.where.documentType.in).not.toContain('NOTA_DEBITO');
  });

  it('el tope de NC previas descarta notas que en realidad corrigen OTRO documento con el mismo folio', async () => {
    // Existen dos documentos con folio "100" para el mismo proveedor: la
    // Factura #100 (la que se está acreditando ahora) y una Boleta #100
    // (legítimamente distinta, numeración independiente). Una NC previa de
    // $90.000 corrigió la BOLETA, no la Factura — no debe contar contra el
    // tope de la Factura.
    const boletaOriginal = { ...facturaOriginal, id: 'bol1', documentType: 'BOLETA', totalAmount: 90000 };
    const priorNoteAgainstBoleta = {
      id: 'nc-prev',
      contactId: 'sup1',
      documentType: 'NOTA_CREDITO',
      referenceFolio: '100',
      totalAmount: 90000,
      items: [],
    };

    const tx = fakeTx({
      purchaseDocument: {
        // 1ª resolución del documento referenciado por la NC nueva -> Factura.
        // 2ª resolución (dentro del cruce de la NC previa) -> Boleta, porque
        // esa NC previa en realidad corrigió la Boleta, no la Factura.
        findFirst: jest.fn().mockResolvedValueOnce(facturaOriginal).mockResolvedValueOnce(boletaOriginal),
        findMany: jest.fn().mockResolvedValue([priorNoteAgainstBoleta]),
        create: jest.fn().mockRejectedValue(new Error(STOP)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    // La nueva NC es de $20.000 contra una Factura de $100.000: si la NC
    // previa de $90.000 (que en realidad es de la Boleta) se mezclara acá,
    // 90.000 + 20.000 = 110.000 > 100.000 y se rechazaría por error. Filtrada
    // correctamente, no cuenta, y la emisión sigue hasta `create` (STOP).
    await expect(createPurchaseDocument('c1', creditNoteInput(), 'ISSUED')).rejects.toThrow(STOP);
  });
});
