import { validateLinesShape } from '@/modules/accounting/services/journal.service';
import { buildSalesRevenueLines, buildCostOfSalesLines, sumUnitCostPmp } from '@/modules/accounting/posting-rules/sales-posting';
import { buildPurchaseExpenseLines } from '@/modules/accounting/posting-rules/purchases-posting';
import { buildInventoryAdjustmentLines, buildCashShiftDifferenceLines } from '@/modules/accounting/posting-rules/inventory-posting';
import { invertLines } from '@/modules/accounting/posting-rules/shared';

/**
 * Lógica pura de las reglas de asiento (Fase C.1): que cada regla produzca
 * líneas cuadradas y con los signos correctos, sin necesitar una base real.
 * La integración contra la base (resolución de cuentas, transacciones,
 * reverso end-to-end) se verifica en `scripts/verify-accounting-engine.ts`.
 */

const ACC = {
  clientes: 'acc-clientes',
  caja: 'acc-caja',
  banco: 'acc-banco',
  ventasAfectas: 'acc-ventas-afectas',
  ventasExentas: 'acc-ventas-exentas',
  ivaDebito: 'acc-iva-debito',
  ivaCredito: 'acc-iva-credito',
  costoVentas: 'acc-costo-ventas',
  existencias: 'acc-existencias',
  proveedores: 'acc-proveedores',
  gastos: 'acc-gastos',
  diferenciaInventario: 'acc-diferencia-inventario',
  diferenciaCaja: 'acc-diferencia-caja',
};

describe('buildSalesRevenueLines', () => {
  it('venta afecta simple: cuadra y va a Clientes/Ventas Afectas/IVA Débito', () => {
    const lines = buildSalesRevenueLines({
      totalAmount: 119000,
      netAmount: 100000,
      exemptAmount: 0,
      ivaAmount: 19000,
      debitAccountId: ACC.clientes,
      ventasAfectasAccountId: ACC.ventasAfectas,
      ventasExentasAccountId: ACC.ventasExentas,
      ivaDebitoAccountId: ACC.ivaDebito,
    });
    expect(() => validateLinesShape(lines)).not.toThrow();
    expect(lines).toEqual([
      { accountId: ACC.clientes, debit: 119000, credit: 0 },
      { accountId: ACC.ventasAfectas, debit: 0, credit: 100000 },
      { accountId: ACC.ivaDebito, debit: 0, credit: 19000 },
    ]);
  });

  it('venta con líneas afectas y exentas mezcladas: reparte en dos cuentas de ingreso, sin depender del dteType', () => {
    const lines = buildSalesRevenueLines({
      totalAmount: 169000,
      netAmount: 50000,
      exemptAmount: 100000,
      ivaAmount: 9500 + 9500, // el motivo real no importa acá, solo que cuadre
      debitAccountId: ACC.caja,
      ventasAfectasAccountId: ACC.ventasAfectas,
      ventasExentasAccountId: ACC.ventasExentas,
      ivaDebitoAccountId: ACC.ivaDebito,
    });
    const total = lines.reduce((sum, l) => sum + l.debit - l.credit, 0);
    expect(total).toBe(0);
    expect(lines.find((l) => l.accountId === ACC.ventasExentas)?.credit).toBe(100000);
  });

  it('venta 100% exenta: sin línea de IVA', () => {
    const lines = buildSalesRevenueLines({
      totalAmount: 100000,
      netAmount: 0,
      exemptAmount: 100000,
      ivaAmount: 0,
      debitAccountId: ACC.clientes,
      ventasAfectasAccountId: ACC.ventasAfectas,
      ventasExentasAccountId: ACC.ventasExentas,
      ivaDebitoAccountId: null,
    });
    expect(lines.some((l) => l.accountId === ACC.ivaDebito)).toBe(false);
    expect(() => validateLinesShape(lines)).not.toThrow();
  });

  it('lanza si hay IVA pero no hay cuenta IVA_DEBITO mapeada', () => {
    expect(() =>
      buildSalesRevenueLines({
        totalAmount: 119000,
        netAmount: 100000,
        exemptAmount: 0,
        ivaAmount: 19000,
        debitAccountId: ACC.clientes,
        ventasAfectasAccountId: ACC.ventasAfectas,
        ventasExentasAccountId: ACC.ventasExentas,
        ivaDebitoAccountId: null,
      })
    ).toThrow(/IVA_DEBITO/);
  });
});

describe('invertLines — Nota de Crédito como espejo de la venta', () => {
  it('invierte debe/haber de cada línea sin tocar la cuenta', () => {
    const revenue = buildSalesRevenueLines({
      totalAmount: 119000,
      netAmount: 100000,
      exemptAmount: 0,
      ivaAmount: 19000,
      debitAccountId: ACC.clientes,
      ventasAfectasAccountId: ACC.ventasAfectas,
      ventasExentasAccountId: ACC.ventasExentas,
      ivaDebitoAccountId: ACC.ivaDebito,
    });
    const inverted = invertLines(revenue);
    expect(() => validateLinesShape(inverted)).not.toThrow();
    expect(inverted).toEqual([
      { accountId: ACC.clientes, debit: 0, credit: 119000 },
      { accountId: ACC.ventasAfectas, debit: 100000, credit: 0 },
      { accountId: ACC.ivaDebito, debit: 19000, credit: 0 },
    ]);
  });
});

describe('buildCostOfSalesLines / sumUnitCostPmp', () => {
  it('suma y redondea el costo de las líneas trackeadas', () => {
    const total = sumUnitCostPmp([
      { unitCostPMP: 1000.5, quantity: 2 },
      { unitCostPMP: 333.33, quantity: 3 },
    ]);
    // 2001 + 999.99 = 3000.99 -> redondeado a 3001
    expect(total).toBe(3001);
  });

  it('sin costo, no genera líneas (nada que postear)', () => {
    expect(buildCostOfSalesLines({ totalCost: 0, costoVentasAccountId: ACC.costoVentas, existenciasAccountId: ACC.existencias })).toEqual([]);
  });

  it('con costo, cuadra D Costo de Ventas / H Existencias', () => {
    const lines = buildCostOfSalesLines({ totalCost: 5000, costoVentasAccountId: ACC.costoVentas, existenciasAccountId: ACC.existencias });
    expect(() => validateLinesShape(lines)).not.toThrow();
    expect(lines).toEqual([
      { accountId: ACC.costoVentas, debit: 5000, credit: 0 },
      { accountId: ACC.existencias, debit: 0, credit: 5000 },
    ]);
  });
});

describe('buildPurchaseExpenseLines', () => {
  it('compra de mercadería: cuadra D Existencias + D IVA Crédito / H Proveedores', () => {
    const lines = buildPurchaseExpenseLines({
      totalAmount: 119000,
      netAmount: 100000,
      exemptAmount: 0,
      ivaAmount: 19000,
      creditAccountId: ACC.proveedores,
      debitAccountId: ACC.existencias,
      ivaCreditoAccountId: ACC.ivaCredito,
    });
    expect(() => validateLinesShape(lines)).not.toThrow();
    expect(lines).toEqual([
      { accountId: ACC.proveedores, debit: 0, credit: 119000 },
      { accountId: ACC.existencias, debit: 100000, credit: 0 },
      { accountId: ACC.ivaCredito, debit: 19000, credit: 0 },
    ]);
  });

  it('compra de gasto (sin producto): usa la cuenta de gasto en vez de Existencias', () => {
    const lines = buildPurchaseExpenseLines({
      totalAmount: 59500,
      netAmount: 50000,
      exemptAmount: 0,
      ivaAmount: 9500,
      creditAccountId: ACC.proveedores,
      debitAccountId: ACC.gastos,
      ivaCreditoAccountId: ACC.ivaCredito,
    });
    expect(lines.find((l) => l.accountId === ACC.gastos)?.debit).toBe(50000);
    expect(lines.some((l) => l.accountId === ACC.existencias)).toBe(false);
  });
});

describe('buildInventoryAdjustmentLines', () => {
  it('ajuste de entrada: D Existencias / H Diferencia de Inventario', () => {
    const lines = buildInventoryAdjustmentLines({
      totalCost: 10000,
      isIncrease: true,
      existenciasAccountId: ACC.existencias,
      diferenciaInventarioAccountId: ACC.diferenciaInventario,
    });
    expect(() => validateLinesShape(lines)).not.toThrow();
    expect(lines[0]).toEqual({ accountId: ACC.existencias, debit: 10000, credit: 0 });
  });

  it('ajuste de salida: D Diferencia de Inventario / H Existencias', () => {
    const lines = buildInventoryAdjustmentLines({
      totalCost: 10000,
      isIncrease: false,
      existenciasAccountId: ACC.existencias,
      diferenciaInventarioAccountId: ACC.diferenciaInventario,
    });
    expect(lines[0]).toEqual({ accountId: ACC.diferenciaInventario, debit: 10000, credit: 0 });
  });

  it('costo cero no genera líneas', () => {
    expect(
      buildInventoryAdjustmentLines({ totalCost: 0, isIncrease: true, existenciasAccountId: ACC.existencias, diferenciaInventarioAccountId: ACC.diferenciaInventario })
    ).toEqual([]);
  });
});

describe('buildCashShiftDifferenceLines', () => {
  it('sobrante: entra a Caja', () => {
    const lines = buildCashShiftDifferenceLines({ difference: 500, cajaAccountId: ACC.caja, diferenciaCajaAccountId: ACC.diferenciaCaja });
    expect(() => validateLinesShape(lines)).not.toThrow();
    expect(lines).toEqual([
      { accountId: ACC.caja, debit: 500, credit: 0 },
      { accountId: ACC.diferenciaCaja, debit: 0, credit: 500 },
    ]);
  });

  it('faltante: sale de Caja', () => {
    const lines = buildCashShiftDifferenceLines({ difference: -500, cajaAccountId: ACC.caja, diferenciaCajaAccountId: ACC.diferenciaCaja });
    expect(lines).toEqual([
      { accountId: ACC.diferenciaCaja, debit: 500, credit: 0 },
      { accountId: ACC.caja, debit: 0, credit: 500 },
    ]);
  });

  it('sin descuadre, no postea nada', () => {
    expect(buildCashShiftDifferenceLines({ difference: 0, cajaAccountId: ACC.caja, diferenciaCajaAccountId: ACC.diferenciaCaja })).toEqual([]);
  });
});
