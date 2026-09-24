import type { TxClient } from '@/modules/accounting/services/journal.service';

/**
 * N-12 (auditoría 2026-09-14): una venta al contado siempre cargaba CAJA en
 * `postSalesDocumentIssued`, sin mirar el medio de pago real — una venta por
 * transferencia o tarjeta también terminaba aumentando "efectivo".
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

const BASE_DOC = {
  id: 'doc-1',
  folio: 10,
  issueDate: new Date('2026-09-23'),
  totalAmount: 119000,
  netAmount: 100000,
  exemptAmount: 0,
  ivaAmount: 19000,
};

function calls() {
  return (createAndPostEntry as jest.Mock).mock.calls.map((call) => call[1]);
}

afterEach(() => jest.clearAllMocks());

describe('N-12: la venta al contado carga la cuenta de efectivo/banco según el medio de pago', () => {
  it('efectivo carga CAJA', async () => {
    await postSalesDocumentIssued(
      {} as TxClient,
      'c1',
      { ...BASE_DOC, dteType: 'FACTURA_33', paymentMethod: 'EFECTIVO' },
      [],
      { isImmediatePayment: true, affectsStock: false }
    );
    const [entry] = calls();
    expect(entry.lines[0]).toEqual({ accountId: 'acc-CAJA', debit: 119000, credit: 0 });
  });

  it('transferencia carga BANCO, no CAJA', async () => {
    await postSalesDocumentIssued(
      {} as TxClient,
      'c1',
      { ...BASE_DOC, dteType: 'FACTURA_33', paymentMethod: 'TRANSFERENCIA' },
      [],
      { isImmediatePayment: true, affectsStock: false }
    );
    const [entry] = calls();
    expect(entry.lines[0]).toEqual({ accountId: 'acc-BANCO', debit: 119000, credit: 0 });
  });

  it('tarjeta de débito también carga BANCO', async () => {
    await postSalesDocumentIssued(
      {} as TxClient,
      'c1',
      { ...BASE_DOC, dteType: 'BOLETA_39', paymentMethod: 'TARJETA_DEBITO' },
      [],
      { isImmediatePayment: true, affectsStock: false }
    );
    const [entry] = calls();
    expect(entry.lines[0].accountId).toBe('acc-BANCO');
  });

  it('venta a crédito sigue yendo a CLIENTES, sin importar el medio declarado', async () => {
    await postSalesDocumentIssued(
      {} as TxClient,
      'c1',
      { ...BASE_DOC, dteType: 'FACTURA_33', paymentMethod: 'CREDITO_30' },
      [],
      { isImmediatePayment: false, affectsStock: false }
    );
    const [entry] = calls();
    expect(entry.lines[0].accountId).toBe('acc-CLIENTES');
  });
});
