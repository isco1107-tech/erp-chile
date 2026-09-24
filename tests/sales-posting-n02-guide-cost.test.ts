import type { TxClient } from '@/modules/accounting/services/journal.service';

/**
 * N-02 (auditoría 2026-09-14): antes, `postSalesDocumentIssued` salía de
 * inmediato para cualquier DTE fuera de `REVENUE_DTE_TYPES` — incluida la
 * Guía de Despacho — así que ni su ingreso (correcto, no corresponde) ni su
 * costo de venta (incorrecto: sí movió stock) quedaban contabilizados en
 * ningún punto del ciclo guía → factura diferida.
 */

jest.mock('@/modules/accounting/services/journal.service', () => ({
  createAndPostEntry: jest.fn().mockResolvedValue(undefined),
  resolveMappedAccountId: jest.fn((_tx: unknown, _companyId: string, key: string) => Promise.resolve(`acc-${key}`)),
}));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({
  ...jest.requireActual('@/modules/accounting/posting-rules/shared'),
  isLedgerActive: jest.fn().mockResolvedValue(true),
}));

import { createAndPostEntry } from '@/modules/accounting/services/journal.service';
import { postSalesDocumentIssued } from '@/modules/accounting/posting-rules/sales-posting';

const GUIDE_DOC = {
  id: 'guia1',
  dteType: 'GUIA_DESPACHO_52' as const,
  paymentMethod: 'CREDITO_30' as const,
  folio: 10,
  issueDate: new Date('2026-09-23'),
  totalAmount: 0,
  netAmount: 0,
  exemptAmount: 0,
  ivaAmount: 0,
};

afterEach(() => jest.clearAllMocks());

describe('N-02: la Guía de Despacho reconoce su propio costo de venta al emitirse', () => {
  it('postea D COSTO_VENTAS / H EXISTENCIAS aunque no sea un documento de ingreso', async () => {
    await postSalesDocumentIssued({} as TxClient, 'c1', GUIDE_DOC, [{ unitCostPMP: 1000, quantity: 2 }], {
      isImmediatePayment: false,
      affectsStock: true,
    });

    // Solo un asiento: el de costo. Nunca ingreso, porque una guía no es una
    // venta formalizada — eso lo postea la Factura que la referencia.
    expect(createAndPostEntry).toHaveBeenCalledTimes(1);
    const entry = (createAndPostEntry as jest.Mock).mock.calls[0][1];
    expect(entry.description).toMatch(/Costo de venta/);
    expect(entry.lines).toEqual([
      { accountId: 'acc-COSTO_VENTAS', debit: 2000, credit: 0 },
      { accountId: 'acc-EXISTENCIAS', debit: 0, credit: 2000 },
    ]);
  });

  it('una guía que no movió stock (affectsStock false) no postea nada', async () => {
    await postSalesDocumentIssued({} as TxClient, 'c1', GUIDE_DOC, [], {
      isImmediatePayment: false,
      affectsStock: false,
    });
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });
});
