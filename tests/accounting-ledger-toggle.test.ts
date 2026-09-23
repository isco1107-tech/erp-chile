import type { TxClient } from '@/modules/accounting/services/journal.service';
import { isLedgerActive } from '@/modules/accounting/posting-rules/shared';
import { postSalesDocumentIssued } from '@/modules/accounting/posting-rules/sales-posting';
import { postPurchasePaymentEntry } from '@/modules/accounting/posting-rules/treasury-posting';
import { postInventoryAdjustmentEntry } from '@/modules/accounting/posting-rules/inventory-posting';

/**
 * Contabilidad es un módulo activable: apagada (o sin plan de cuentas), el
 * motor de asientos NO debe tocar la base más allá de la consulta del
 * interruptor. Antes posteaba siempre y una empresa sin plan de cuentas no
 * podía emitir ninguna venta.
 *
 * El `tx` falso solo implementa las dos lecturas del interruptor: si una regla
 * intentara seguir (resolver cuentas, crear el asiento), fallaría al llamar
 * un método inexistente y el test lo detectaría.
 */

function fakeTx(options: { hasAccounting: boolean | null; hasChart: boolean }): TxClient {
  return {
    companyFeatures: {
      findUnique: jest.fn().mockResolvedValue(options.hasAccounting === null ? null : { hasAccounting: options.hasAccounting }),
    },
    accountMapping: {
      findFirst: jest.fn().mockResolvedValue(options.hasChart ? { id: 'map-1' } : null),
    },
  } as unknown as TxClient;
}

const SALE = {
  id: 'doc-1',
  dteType: 'FACTURA_33' as const,
  folio: 10,
  issueDate: new Date('2026-09-23'),
  totalAmount: 119_000,
  netAmount: 100_000,
  exemptAmount: 0,
  ivaAmount: 19_000,
};

describe('interruptor del motor contable', () => {
  it('activo solo con Contabilidad encendida y plan de cuentas sembrado', async () => {
    await expect(isLedgerActive(fakeTx({ hasAccounting: true, hasChart: true }), 'c1')).resolves.toBe(true);
    await expect(isLedgerActive(fakeTx({ hasAccounting: true, hasChart: false }), 'c1')).resolves.toBe(false);
    await expect(isLedgerActive(fakeTx({ hasAccounting: false, hasChart: true }), 'c1')).resolves.toBe(false);
    await expect(isLedgerActive(fakeTx({ hasAccounting: null, hasChart: true }), 'c1')).resolves.toBe(false);
  });

  it('no consulta el plan de cuentas si el módulo está apagado', async () => {
    const tx = fakeTx({ hasAccounting: false, hasChart: true });
    await isLedgerActive(tx, 'c1');
    expect((tx as unknown as { accountMapping: { findFirst: jest.Mock } }).accountMapping.findFirst).not.toHaveBeenCalled();
  });
});

describe('con la contabilidad apagada, la operación sigue sin asiento', () => {
  it('una venta no intenta contabilizarse', async () => {
    await expect(
      postSalesDocumentIssued(fakeTx({ hasAccounting: false, hasChart: false }), 'c1', SALE, [{ unitCostPMP: 500, quantity: 2 }], {
        isImmediatePayment: true,
        affectsStock: true,
      })
    ).resolves.toBeUndefined();
  });

  it('con el módulo encendido pero sin plan de cuentas tampoco bloquea la venta', async () => {
    await expect(
      postSalesDocumentIssued(fakeTx({ hasAccounting: true, hasChart: false }), 'c1', SALE, [], { isImmediatePayment: false, affectsStock: false })
    ).resolves.toBeUndefined();
  });

  it('pagos y ajustes de inventario tampoco', async () => {
    const tx = fakeTx({ hasAccounting: false, hasChart: false });
    await expect(
      postPurchasePaymentEntry(tx, 'c1', {
        id: 'p1',
        amount: 10_000,
        paymentMethod: 'TRANSFERENCIA',
        paymentDate: new Date('2026-09-23'),
        contactId: 'k1',
      } as unknown as Parameters<typeof postPurchasePaymentEntry>[2])
    ).resolves.toBeUndefined();
    await expect(
      postInventoryAdjustmentEntry(tx, 'c1', { id: 'm1', totalCost: 5_000 } as unknown as Parameters<typeof postInventoryAdjustmentEntry>[2], true)
    ).resolves.toBeUndefined();
  });
});
