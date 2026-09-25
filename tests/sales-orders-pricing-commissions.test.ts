import { applyPercentAdjustment, listDiscountPercent, resolveUnitPrice } from '@/modules/sales/pricing';
import {
  applyDocumentToOrder,
  deriveOrderStatus,
  documentProgressEffect,
  orderProgressPercent,
  remainingToDispatch,
  remainingToInvoice,
  reservedQuantity,
  type OrderLineProgress,
} from '@/modules/sales/orders';
import { commissionFor, computeCommissions, formatRate, netOfPayment, netSale } from '@/modules/sales/commissions';
import { priceListItemsSchema, salesOrderCreateSchema } from '@/modules/sales/schema';

describe('listas de precios', () => {
  const tiers = [
    { minQuantity: 1, netPrice: 900 },
    { minQuantity: 10, netPrice: 800 },
    { minQuantity: 50, netPrice: 700 },
  ];

  it('elige el tramo de mayor cantidad mínima que no supere lo pedido', () => {
    expect(resolveUnitPrice(1000, tiers, 1)).toBe(900);
    expect(resolveUnitPrice(1000, tiers, 9)).toBe(900);
    expect(resolveUnitPrice(1000, tiers, 10)).toBe(800);
    expect(resolveUnitPrice(1000, tiers, 120)).toBe(700);
  });

  it('sin tramos aplicables usa el precio base del catálogo', () => {
    expect(resolveUnitPrice(1000, [], 5)).toBe(1000);
    expect(resolveUnitPrice(1000, [{ minQuantity: 10, netPrice: 800 }], 3)).toBe(1000);
  });

  it('calcula precios desde el catálogo con un ajuste porcentual y el descuento implícito', () => {
    expect(applyPercentAdjustment(10_000, -12)).toBe(8_800);
    expect(applyPercentAdjustment(999, 10)).toBe(1_099);
    expect(applyPercentAdjustment(100, -100)).toBe(0);
    expect(listDiscountPercent(10_000, 8_800)).toBe(12);
    expect(listDiscountPercent(10_000, 12_000)).toBe(0);
  });

  it('rechaza dos precios para el mismo producto y cantidad', () => {
    const result = priceListItemsSchema.safeParse([
      { productId: 'p1', minQuantity: 1, netPrice: 100 },
      { productId: 'p1', minQuantity: 1, netPrice: 90 },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('notas de venta', () => {
  const line = (overrides: Partial<OrderLineProgress> = {}): OrderLineProgress => ({
    id: 'l1',
    description: 'Silla',
    quantity: 10,
    quantityInvoiced: 0,
    quantityDispatched: 0,
    ...overrides,
  });

  it('una guía despacha sin facturar; una factura factura y despacha; la que formaliza una guía solo factura', () => {
    expect(documentProgressEffect('GUIA_DESPACHO_52', false)).toEqual({ invoices: false, dispatches: true });
    expect(documentProgressEffect('FACTURA_33', false)).toEqual({ invoices: true, dispatches: true });
    expect(documentProgressEffect('FACTURA_33', true)).toEqual({ invoices: true, dispatches: false });
    expect(documentProgressEffect('NOTA_CREDITO_61', false)).toEqual({ invoices: false, dispatches: false });
  });

  it('factura por partes y queda concluida al facturar todo', () => {
    const lines = [line()];
    const afterFirst = applyDocumentToOrder(lines, [{ salesOrderItemId: 'l1', quantity: 4 }], documentProgressEffect('FACTURA_33', false));
    expect(afterFirst).toEqual([{ id: 'l1', quantityInvoiced: 4, quantityDispatched: 4 }]);
    expect(deriveOrderStatus([{ quantity: 10, ...afterFirst[0]! }], 'PENDING')).toBe('IN_PROGRESS');

    const second = applyDocumentToOrder([line({ quantityInvoiced: 4, quantityDispatched: 4 })], [{ salesOrderItemId: 'l1', quantity: 6 }], documentProgressEffect('BOLETA_39', false));
    expect(deriveOrderStatus([{ quantity: 10, ...second[0]! }], 'IN_PROGRESS')).toBe('COMPLETED');
  });

  it('no deja facturar ni despachar más que el saldo', () => {
    expect(() =>
      applyDocumentToOrder([line({ quantityInvoiced: 8 })], [{ salesOrderItemId: 'l1', quantity: 3 }], documentProgressEffect('FACTURA_33', true))
    ).toThrow(/quedan 2 por facturar/);
    expect(() =>
      applyDocumentToOrder([line({ quantityDispatched: 10 })], [{ salesOrderItemId: 'l1', quantity: 1 }], documentProgressEffect('GUIA_DESPACHO_52', false))
    ).toThrow(/quedan 0 por despachar/);
  });

  it('rechaza líneas que no son de la nota', () => {
    expect(() => applyDocumentToOrder([line()], [{ salesOrderItemId: 'otra', quantity: 1 }], documentProgressEffect('FACTURA_33', false))).toThrow(/no pertenece/);
  });

  it('anular un documento devuelve el saldo a la nota', () => {
    const reverted = applyDocumentToOrder([line({ quantityInvoiced: 10, quantityDispatched: 10 })], [{ salesOrderItemId: 'l1', quantity: 4 }], documentProgressEffect('FACTURA_33', false), -1);
    expect(reverted).toEqual([{ id: 'l1', quantityInvoiced: 6, quantityDispatched: 6 }]);
    expect(deriveOrderStatus([{ quantity: 10, ...reverted[0]! }], 'COMPLETED')).toBe('IN_PROGRESS');
  });

  it('una nota anulada sigue anulada y una sin avance queda pendiente', () => {
    expect(deriveOrderStatus([{ quantity: 1, quantityInvoiced: 1, quantityDispatched: 1 }], 'CANCELLED')).toBe('CANCELLED');
    expect(deriveOrderStatus([{ quantity: 1, quantityInvoiced: 0, quantityDispatched: 0 }], 'IN_PROGRESS')).toBe('PENDING');
  });

  it('reserva lo que falta despachar y mide el avance por monto', () => {
    expect(reservedQuantity([{ quantity: 10, quantityDispatched: 4 }, { quantity: 5, quantityDispatched: 5 }])).toBe(6);
    expect(remainingToInvoice(line({ quantityInvoiced: 3 }))).toBe(7);
    expect(remainingToDispatch(line({ quantityDispatched: 12 }))).toBe(0);
    expect(
      orderProgressPercent([
        { ...line({ quantityInvoiced: 10 }), unitPrice: 100 },
        { ...line({ id: 'l2', quantityInvoiced: 0 }), unitPrice: 300 },
      ])
    ).toBe(25);
  });

  it('el esquema exige cliente, bodega y al menos una línea con cantidad positiva', () => {
    const base = { contactId: 'c', warehouseId: 'w', paymentMethod: 'CREDITO_30', items: [{ description: 'X', quantity: 1, unitPrice: 100 }] };
    expect(salesOrderCreateSchema.safeParse(base).success).toBe(true);
    expect(salesOrderCreateSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(salesOrderCreateSchema.safeParse({ ...base, items: [{ description: 'X', quantity: 0, unitPrice: 100 }] }).success).toBe(false);
  });
});

describe('comisiones', () => {
  it('la venta neta excluye IVA, guías y cotizaciones; la nota de crédito resta', () => {
    expect(netSale({ dteType: 'FACTURA_33', netAmount: 100_000, exemptAmount: 20_000 })).toBe(120_000);
    expect(netSale({ dteType: 'NOTA_CREDITO_61', netAmount: 10_000, exemptAmount: 0 })).toBe(-10_000);
    expect(netSale({ dteType: 'GUIA_DESPACHO_52', netAmount: 50_000, exemptAmount: 0 })).toBe(0);
    expect(netSale({ dteType: 'COTIZACION', netAmount: 50_000, exemptAmount: 0 })).toBe(0);
  });

  it('el cobro se lleva a neto en la misma proporción que el documento', () => {
    expect(netOfPayment({ amount: 119_000, documentNet: 100_000, documentTotal: 119_000 })).toBe(100_000);
    expect(netOfPayment({ amount: 59_500, documentNet: 100_000, documentTotal: 119_000 })).toBe(50_000);
  });

  it('calcula por vendedor según su base y tasa', () => {
    const rates = new Map([
      ['ana', { rateBps: 300, basis: 'ISSUED' as const }],
      ['beto', { rateBps: 500, basis: 'COLLECTED' as const }],
    ]);
    const rows = computeCommissions(
      [
        { sellerId: 'ana', dteType: 'FACTURA_33', netAmount: 1_000_000, exemptAmount: 0, totalAmount: 1_190_000 },
        { sellerId: 'ana', dteType: 'NOTA_CREDITO_61', netAmount: 100_000, exemptAmount: 0, totalAmount: 119_000 },
        { sellerId: 'beto', dteType: 'FACTURA_33', netAmount: 2_000_000, exemptAmount: 0, totalAmount: 2_380_000 },
        { sellerId: 'carla', dteType: 'BOLETA_39', netAmount: 50_000, exemptAmount: 0, totalAmount: 59_500 },
      ],
      [{ sellerId: 'beto', amount: 1_190_000, documentNet: 2_000_000, documentTotal: 2_380_000 }],
      rates
    );
    const byId = Object.fromEntries(rows.map((row) => [row.sellerId, row]));
    expect(byId.ana).toMatchObject({ base: 900_000, commission: 27_000, documents: 2 });
    expect(byId.beto).toMatchObject({ base: 1_000_000, commission: 50_000, basis: 'COLLECTED' });
    expect(byId.carla).toMatchObject({ base: 50_000, rateBps: 0, commission: 0 });
  });

  it('una base negativa no genera comisión negativa', () => {
    expect(commissionFor(-10_000, 500)).toBe(0);
    expect(formatRate(250)).toBe('2,5%');
  });
});
