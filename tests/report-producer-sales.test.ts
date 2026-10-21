/**
 * Reporte "Ventas por productor": agregación pura, consulta con companyId y
 * período en hora de Santiago, tolerancia a base sin migrar y hoja Excel.
 */
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: { consignmentSettlementLine: { findMany: jest.fn() } },
}));

import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import {
  aggregateProducerSales,
  loadProducerSales,
  type ProducerSaleLineInput,
} from '@/modules/reports/services/producer-sales.service';
import { buildWorkbook } from '@/modules/reports/services/workbook.service';
import type { ReportDataset } from '@/modules/reports/services/dataset.service';

const db = prisma as unknown as { consignmentSettlementLine: { findMany: jest.Mock } };

function line(overrides: Partial<ProducerSaleLineInput> = {}): ProducerSaleLineInput {
  return {
    kind: 'SALE',
    producerId: 'p1',
    producerName: 'Productor Uno',
    producerRut: '11.111.111-1',
    productId: 'prod1',
    sku: 'MIEL-1',
    productName: 'Miel 500 g',
    soldNet: 10000,
    commissionAmount: 2000,
    producerAmount: 8000,
    settlementId: null,
    itemQuantity: 5,
    origin: null,
    ...overrides,
  };
}

describe('aggregateProducerSales', () => {
  it('suma ventas del mismo productor y producto', () => {
    const rows = aggregateProducerSales([line(), line({ soldNet: 20000, commissionAmount: 4000, producerAmount: 16000, itemQuantity: 10 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unidades: 15, netoVendido: 30000, comision: 6000, montoALiquidar: 24000, sinLiquidar: 24000, enLiquidacion: 0 });
  });

  it('descuenta una nota de crédito por su cantidad exacta', () => {
    const rows = aggregateProducerSales([
      line(),
      line({ kind: 'REVERSAL', soldNet: -4000, commissionAmount: -800, producerAmount: -3200, itemQuantity: 2 }),
    ]);
    expect(rows[0]).toMatchObject({ unidades: 3, netoVendido: 6000, comision: 1200, montoALiquidar: 4800, unidadesEstimadas: false });
  });

  it('prorratea las unidades de una anulación y la marca como estimada', () => {
    const rows = aggregateProducerSales([
      line(),
      line({
        kind: 'REVERSAL', soldNet: -10000, commissionAmount: -2000, producerAmount: -8000,
        itemQuantity: null, origin: { itemQuantity: 5, soldNet: 10000 },
      }),
    ]);
    // Venta y anulación se anulan: la fila queda en cero y se descarta.
    expect(rows).toEqual([]);

    const partial = aggregateProducerSales([
      line({
        kind: 'REVERSAL', soldNet: -5000, commissionAmount: -1000, producerAmount: -4000,
        itemQuantity: null, origin: { itemQuantity: 5, soldNet: 10000 },
      }),
    ]);
    expect(partial[0].unidades).toBe(-2.5);
    expect(partial[0].unidadesEstimadas).toBe(true);
  });

  it('separa lo ya asignado a una liquidación de lo pendiente', () => {
    const rows = aggregateProducerSales([line({ settlementId: 's1' }), line()]);
    expect(rows[0]).toMatchObject({ montoALiquidar: 16000, enLiquidacion: 8000, sinLiquidar: 8000 });
  });

  it('mantiene filas separadas por productor y producto, ordenadas por nombre', () => {
    const rows = aggregateProducerSales([
      line({ producerId: 'p2', producerName: 'Zeta', productId: 'x' }),
      line({ productId: 'prod2', productName: 'Aceite' }),
      line(),
    ]);
    expect(rows.map((r) => `${r.productor}/${r.producto}`)).toEqual(['Productor Uno/Aceite', 'Productor Uno/Miel 500 g', 'Zeta/Miel 500 g']);
  });

  it('si la venta original no tiene cantidad, no inventa unidades', () => {
    const rows = aggregateProducerSales([
      line({ kind: 'REVERSAL', soldNet: -1000, commissionAmount: -200, producerAmount: -800, itemQuantity: null, origin: null }),
    ]);
    expect(rows[0].unidades).toBe(0);
  });
});

describe('loadProducerSales', () => {
  beforeEach(() => jest.resetAllMocks());

  it('filtra por companyId y por el período en hora de Santiago (fin exclusivo)', async () => {
    db.consignmentSettlementLine.findMany.mockResolvedValue([]);
    await loadProducerSales('c1', { from: new Date(Date.UTC(2026, 7, 1)), to: new Date(Date.UTC(2026, 7, 31, 23, 59)) });
    const where = db.consignmentSettlementLine.findMany.mock.calls[0][0].where as {
      companyId: string;
      documentDate: { gte: Date; lt: Date };
    };
    expect(where.companyId).toBe('c1');
    // Medianoche de Santiago = 03:00 o 04:00 UTC según el horario vigente.
    expect([3, 4]).toContain(where.documentDate.gte.getUTCHours());
    expect(where.documentDate.gte.getUTCDate()).toBe(1);
    // El último día entra completo: el límite es la medianoche del 1 de septiembre.
    expect(where.documentDate.lt.getUTCMonth()).toBe(8);
    expect(where.documentDate.lt.getUTCDate()).toBe(1);
  });

  it('aplana la respuesta de Prisma y agrega', async () => {
    db.consignmentSettlementLine.findMany.mockResolvedValue([
      {
        kind: 'SALE', producerId: 'p1', productId: 'a', soldNet: 1000, commissionAmount: 100, producerAmount: 900, settlementId: null,
        salesDocumentItem: { quantity: 2 }, reverses: null,
        producer: { contact: { razonSocial: 'Prod', rut: '1-9' } }, product: { sku: 'S', name: 'N' },
      },
    ]);
    const rows = await loadProducerSales('c1', { from: new Date(Date.UTC(2026, 7, 1)), to: new Date(Date.UTC(2026, 7, 2)) });
    expect(rows).toEqual([
      expect.objectContaining({ productor: 'Prod', rutProductor: '1-9', sku: 'S', unidades: 2, netoVendido: 1000, montoALiquidar: 900 }),
    ]);
  });

  it('con la tabla aún inexistente devuelve vacío sin reportar ruido', async () => {
    db.consignmentSettlementLine.findMany.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    await expect(loadProducerSales('c1', { from: new Date(), to: new Date() })).resolves.toEqual([]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('ante otro error devuelve vacío pero lo reporta', async () => {
    db.consignmentSettlementLine.findMany.mockRejectedValue(new Error('boom'));
    await expect(loadProducerSales('c1', { from: new Date(), to: new Date() })).resolves.toEqual([]);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe('hoja Excel "Ventas por productor"', () => {
  function baseDataset(extra: Partial<ReportDataset>): ReportDataset {
    return {
      empresa: { razonSocial: 'Empresa', rut: '76.543.210-K' },
      rango: { from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) },
      generadoEn: new Date(2026, 7, 17),
      productos: [], inventario: [], kardex: [], ventas: [], ventasDetalle: [], compras: [], comprasDetalle: [], pagos: [],
      resumenTributario: { ventasNetas: 0, ventasExentas: 0, costoVentas: 0, margenBruto: 0, ivaDebito: 0, ivaCredito: 0, ivaAPagarOFavor: 0, ppmEstimado: 0 },
      ...extra,
    };
  }

  async function open(dataset: ReportDataset) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(dataset)) as unknown as ArrayBuffer);
    return wb;
  }

  it('se agrega con sus columnas cuando hay datos', async () => {
    const rows = aggregateProducerSales([line(), line({ settlementId: 's1' })]);
    const wb = await open(baseDataset({ ventasPorProductor: rows }));
    const ws = wb.getWorksheet('Ventas por productor')!;
    expect(ws).toBeDefined();
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([
      'Productor', 'RUT', 'SKU', 'Producto', 'Unidades', 'Unidades estimadas',
      'Neto vendido', 'Comisión', 'Monto a liquidar', 'En liquidación', 'Sin liquidar',
    ]);
    expect(ws.getRow(2).getCell(5).value).toBe(10);
    expect(ws.getRow(2).getCell(9).value).toBe(16000);
    expect(ws.rowCount).toBe(2);
  });

  it('no se genera sin datos: el libro existente queda igual', async () => {
    for (const ventasPorProductor of [undefined, []]) {
      const wb = await open(baseDataset({ ventasPorProductor }));
      expect(wb.worksheets.map((w) => w.name)).not.toContain('Ventas por productor');
    }
  });
});
