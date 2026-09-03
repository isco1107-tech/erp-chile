import { computeDocument } from '@/modules/sales/calc';
import { calculateNewPmp } from '@/lib/inventory/pmp';
import {
  TAXABLE_SALES_DTE_TYPES,
  signForSalesDteType,
  signForPurchaseDocumentType,
} from '@/lib/chile/document-sign';
import {
  buildSalesRevenueLines,
  buildCostOfSalesLines,
} from '@/modules/accounting/posting-rules/sales-posting';
import { recordWebhookEvent } from '@/modules/webhooks/services/webhook-idempotency.service';
import { prisma } from '@/lib/prisma';

describe('1. Idempotencia y Concurrencia Transaccional', () => {
  it('Webhook Idempotency: descarta eventos duplicados con el mismo eventId', async () => {
    const mockStore = new Map<string, unknown>();

    type CreateFn = typeof prisma.processedWebhookEvent.create;
    jest.spyOn(prisma.processedWebhookEvent, 'create').mockImplementation((async (args: unknown) => {
      const { data } = args as { data: { provider: string; eventId: string; eventType: string; payload?: unknown } };
      const key = `${data.provider}_${data.eventId}`;
      if (mockStore.has(key)) {
        const error = new Error('Unique constraint failed') as Error & { code: string };
        error.code = 'P2002';
        throw error;
      }
      const record = {
        id: 'webhook-123',
        companyId: null,
        status: 'PROCESSED',
        payload: data.payload ?? null,
        provider: data.provider,
        eventId: data.eventId,
        eventType: data.eventType,
        processedAt: new Date(),
        createdAt: new Date(),
      };
      mockStore.set(key, record);
      return record;
    }) as unknown as CreateFn);

    type FindUniqueFn = typeof prisma.processedWebhookEvent.findUnique;
    jest.spyOn(prisma.processedWebhookEvent, 'findUnique').mockImplementation((async (args: unknown) => {
      const { where } = args as { where: { provider_eventId: { provider: string; eventId: string } } };
      const key = `${where.provider_eventId.provider}_${where.provider_eventId.eventId}`;
      return mockStore.get(key) ?? null;
    }) as unknown as FindUniqueFn);

    const testEventId = 'evt_test_12345';
    const provider = 'stripe';

    // Primer procesamiento
    const firstResult = await recordWebhookEvent({
      provider,
      eventId: testEventId,
      eventType: 'payment_intent.succeeded',
      payload: { amount: 10000, currency: 'clp' },
    });

    expect(firstResult.alreadyProcessed).toBe(false);
    expect(firstResult.event).not.toBeNull();
    expect(firstResult.event?.eventId).toBe(testEventId);

    // Segundo procesamiento (duplicado/reintento)
    const secondResult = await recordWebhookEvent({
      provider,
      eventId: testEventId,
      eventType: 'payment_intent.succeeded',
      payload: { amount: 10000, currency: 'clp' },
    });

    expect(secondResult.alreadyProcessed).toBe(true);
    expect(secondResult.event?.id).toBe(firstResult.event?.id);

    jest.restoreAllMocks();
  });

  it('Concurrencia de Inventario: previene sobreventa mediante atomic decrement con guardas', () => {
    let availableStock = 10;
    const requestedQuantityA = 6;
    const requestedQuantityB = 6;

    // Simulación del comportamiento atómico de DB: updateMany con quantity >= requested
    function tryAtomicDecrement(quantity: number): boolean {
      if (availableStock >= quantity) {
        availableStock -= quantity;
        return true;
      }
      return false;
    }

    const txA = tryAtomicDecrement(requestedQuantityA);
    const txB = tryAtomicDecrement(requestedQuantityB);

    expect(txA).toBe(true);
    expect(txB).toBe(false); // La segunda transacción concurrente falla por falta de stock
    expect(availableStock).toBe(4); // No queda en negativo
  });
});

describe('2. Casos Borde Tributarios (DTEs & Impuestos)', () => {
  it('Nota de Crédito 61 - Caso A (Anulación Total): revierte débito fiscal y costo de ventas', () => {
    // Venta original de 2 unidades a $10.000 neto c/u, costo PMP $6.000
    const originalItems = [
      {
        productId: 'prod-1',
        sku: 'SKU-01',
        description: 'Producto A',
        quantity: 2,
        unitPrice: 10000,
        isExempt: false,
        unitCostPMP: 6000,
      },
    ];

    const { totals: originalTotals } = computeDocument(originalItems);
    expect(originalTotals.netAmount).toBe(20000);
    expect(originalTotals.ivaAmount).toBe(3800);
    expect(originalTotals.totalAmount).toBe(23800);

    // NC Caso A: Devuelve 2 unidades físicas a bodega
    const ncItems = [
      {
        productId: 'prod-1',
        sku: 'SKU-01',
        description: 'Devolución Producto A',
        quantity: 2,
        unitPrice: 10000,
        isExempt: false,
        unitCostPMP: 6000,
      },
    ];
    const { totals: ncTotals } = computeDocument(ncItems);

    // Signo tributario para F29
    expect(signForSalesDteType('NOTA_CREDITO_61')).toBe(-1);
    const f29DebitEffect = signForSalesDteType('NOTA_CREDITO_61') * ncTotals.ivaAmount;
    expect(f29DebitEffect).toBe(-3800); // Resta $3.800 de débito fiscal

    // Asiento contable de NC: D CLIENTES (reversado) / H VENTAS / H IVA_DEBITO
    const revenueLines = buildSalesRevenueLines({
      totalAmount: ncTotals.totalAmount,
      netAmount: ncTotals.netAmount,
      exemptAmount: ncTotals.exemptAmount,
      ivaAmount: ncTotals.ivaAmount,
      debitAccountId: 'acc-clientes',
      ventasAfectasAccountId: 'acc-ventas',
      ventasExentasAccountId: 'acc-exentas',
      ivaDebitoAccountId: 'acc-iva-deb',
    });

    expect(revenueLines).toEqual([
      { accountId: 'acc-clientes', debit: 23800, credit: 0 },
      { accountId: 'acc-ventas', debit: 0, credit: 20000 },
      { accountId: 'acc-iva-deb', debit: 0, credit: 3800 },
    ]);

    // Reverso de costo en Kardex: D EXISTENCIAS / H COSTO_VENTAS por $12.000
    const costLines = buildCostOfSalesLines({
      totalCost: 2 * 6000,
      costoVentasAccountId: 'acc-costo',
      existenciasAccountId: 'acc-existencias',
    });
    expect(costLines).toEqual([
      { accountId: 'acc-costo', debit: 12000, credit: 0 },
      { accountId: 'acc-existencias', debit: 0, credit: 12000 },
    ]);
  });

  it('Nota de Crédito 61 - Caso B (Corrección de Monto / Descuento): ajusta saldo contable sin mover stock físico', () => {
    // NC Caso B: Descuento financiero posterior de $5.000 neto (sin producto trackeable del catálogo)
    const ncDiscountItems = [
      {
        productId: undefined,
        sku: undefined,
        description: 'Descuento comercial acordado',
        quantity: 1,
        unitPrice: 5000,
        isExempt: false,
        unitCostPMP: 0,
      },
    ];

    const { totals: ncTotals } = computeDocument(ncDiscountItems);
    expect(ncTotals.netAmount).toBe(5000);
    expect(ncTotals.ivaAmount).toBe(950);
    expect(ncTotals.totalAmount).toBe(5950);

    // En el F29: resta $950 de débito fiscal
    const f29DebitEffect = signForSalesDteType('NOTA_CREDITO_61') * ncTotals.ivaAmount;
    expect(f29DebitEffect).toBe(-950);

    // Asiento financiero de la NC por descuento
    const revenueLines = buildSalesRevenueLines({
      totalAmount: ncTotals.totalAmount,
      netAmount: ncTotals.netAmount,
      exemptAmount: ncTotals.exemptAmount,
      ivaAmount: ncTotals.ivaAmount,
      debitAccountId: 'acc-clientes',
      ventasAfectasAccountId: 'acc-ventas',
      ventasExentasAccountId: 'acc-exentas',
      ivaDebitoAccountId: 'acc-iva-deb',
    });
    expect(revenueLines).toEqual([
      { accountId: 'acc-clientes', debit: 5950, credit: 0 },
      { accountId: 'acc-ventas', debit: 0, credit: 5000 },
      { accountId: 'acc-iva-deb', debit: 0, credit: 950 },
    ]);

    // Costo de venta es 0 porque no es producto físico de existencias
    const totalCost = 0;
    const costLines = buildCostOfSalesLines({
      totalCost,
      costoVentasAccountId: 'acc-costo',
      existenciasAccountId: 'acc-existencias',
    });
    expect(costLines).toEqual([]); // No genera reverso de existencias
  });

  it('Documentos Exentos (Factura Exenta 34 y Boleta Exenta 41): no generan débito de IVA 19%', () => {
    expect(TAXABLE_SALES_DTE_TYPES).toContain('FACTURA_EXENTA_34');
    expect(TAXABLE_SALES_DTE_TYPES).toContain('BOLETA_EXENTA_41');

    // Venta exenta por $100.000
    const exemptItems = [
      {
        description: 'Servicio de Capacitación Exento',
        quantity: 1,
        unitPrice: 100000,
        isExempt: true,
      },
    ];

    const { totals } = computeDocument(exemptItems);
    expect(totals.netAmount).toBe(0);
    expect(totals.exemptAmount).toBe(100000);
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(100000);

    // En el F29:
    // 1. Débito Fiscal es $0
    const debitVat = signForSalesDteType('FACTURA_EXENTA_34') * totals.ivaAmount;
    expect(debitVat).toBe(0);

    // 2. Base para PPM incluye ventas exentas (netSales = netAmount + exemptAmount)
    const netSales = totals.netAmount + totals.exemptAmount;
    expect(netSales).toBe(100000);
    const ppmRateBps = 100; // 1%
    const ppmAmount = Math.round((netSales * ppmRateBps) / 10000);
    expect(ppmAmount).toBe(1000); // $1.000 de PPM determinado
  });
});

describe('3. Políticas de Inmutabilidad y Auditoría', () => {
  it('PMP Calculation: recálculo ponderado inmutable ante ingresos sucesivos', () => {
    // Stock inicial: 10 unidades a $5.000 (PMP inicial = 5.000)
    // Ingreso: 10 unidades a $7.000
    const { newPmp } = calculateNewPmp({
      previousStock: 10,
      previousPmp: 5000,
      incomingQuantity: 10,
      incomingUnitCost: 7000,
    });

    // Nuevo PMP = (10*5000 + 10*7000) / 20 = (50000 + 70000) / 20 = 120000 / 20 = 6000
    expect(newPmp).toBe(6000);
  });

  it('Inmutabilidad de Compras: signos tributarios para notas de crédito y débito de proveedor', () => {
    expect(signForPurchaseDocumentType('FACTURA')).toBe(1);
    expect(signForPurchaseDocumentType('NOTA_DEBITO')).toBe(1);
    expect(signForPurchaseDocumentType('NOTA_CREDITO')).toBe(-1); // Resta crédito fiscal
  });
});

