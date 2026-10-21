import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { settlementPeriodBounds } from '@/lib/consignment/period';

/**
 * Reporte "Ventas por productor" (consignación).
 *
 * Lee las líneas devengadas (`ConsignmentSettlementLine`), que ya traen los
 * montos congelados al momento de vender (venta neta, comisión y parte del
 * productor); aquí NO se recalcula ninguna comisión. Las reversas (notas de
 * crédito y anulaciones) vienen con signo negativo, así que sumar todo da el
 * neto real del período.
 *
 * Período: `range.from`/`range.to` se leen como DÍAS por sus componentes UTC y
 * se llevan al calendario de Santiago con `settlementPeriodBounds`, el mismo
 * criterio que la liquidación; una venta de las 23:30 del último día no cae en
 * el período siguiente.
 */

export interface ProducerSalesRow {
  productor: string;
  rutProductor: string;
  sku: string;
  producto: string;
  /** Unidades netas de devoluciones y anulaciones. */
  unidades: number;
  /** true si alguna reversa sin detalle propio (anulación) se prorrateó desde la venta original. */
  unidadesEstimadas: boolean;
  /** Venta neta (CLP, sin IVA), con reversas descontadas. */
  netoVendido: number;
  /** Comisión retenida por la empresa. */
  comision: number;
  /** Monto a liquidar al productor (venta neta menos comisión). */
  montoALiquidar: number;
  /** Parte del monto que ya está asignada a una liquidación. */
  enLiquidacion: number;
  /** Parte del monto aún sin liquidar. */
  sinLiquidar: number;
}

/** Línea ya leída de la base, aplanada para poder agregarla sin Prisma. */
export interface ProducerSaleLineInput {
  kind: 'SALE' | 'REVERSAL';
  producerId: string;
  producerName: string;
  producerRut: string;
  productId: string;
  sku: string;
  productName: string;
  soldNet: number;
  commissionAmount: number;
  producerAmount: number;
  settlementId: string | null;
  /** Cantidad del ítem de venta (o de nota de crédito) que originó la línea; null en anulaciones. */
  itemQuantity: number | null;
  /** Línea de venta que corrige esta reversa. */
  origin: { itemQuantity: number | null; soldNet: number } | null;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Unidades que aporta una línea:
 *  - Venta: la cantidad del ítem.
 *  - Reversa por nota de crédito (tiene ítem propio): resta esa cantidad.
 *  - Reversa sin ítem (anulación de documento o de una nota de crédito): la
 *    línea no guarda cantidad, así que se prorratea la de la venta original
 *    según la fracción de venta neta que revierte. Es exacto cuando el precio
 *    unitario no cambió; por eso se marca como estimada.
 */
function lineUnits(line: ProducerSaleLineInput): { units: number; estimated: boolean } {
  if (line.kind === 'SALE') return { units: line.itemQuantity ?? 0, estimated: false };
  if (line.itemQuantity !== null) return { units: -line.itemQuantity, estimated: false };
  const origin = line.origin;
  if (!origin || origin.itemQuantity === null || origin.soldNet === 0) return { units: 0, estimated: true };
  return { units: (origin.itemQuantity * line.soldNet) / origin.soldNet, estimated: true };
}

/** Agrupa por productor y producto. Pura: no toca la base. */
export function aggregateProducerSales(lines: readonly ProducerSaleLineInput[]): ProducerSalesRow[] {
  const groups = new Map<string, ProducerSalesRow>();
  for (const line of lines) {
    const key = `${line.producerId}|${line.productId}`;
    let row = groups.get(key);
    if (!row) {
      row = {
        productor: line.producerName,
        rutProductor: line.producerRut,
        sku: line.sku,
        producto: line.productName,
        unidades: 0,
        unidadesEstimadas: false,
        netoVendido: 0,
        comision: 0,
        montoALiquidar: 0,
        enLiquidacion: 0,
        sinLiquidar: 0,
      };
      groups.set(key, row);
    }
    const { units, estimated } = lineUnits(line);
    row.unidades += units;
    if (estimated && units !== 0) row.unidadesEstimadas = true;
    row.netoVendido += line.soldNet;
    row.comision += line.commissionAmount;
    row.montoALiquidar += line.producerAmount;
    if (line.settlementId) row.enLiquidacion += line.producerAmount;
    else row.sinLiquidar += line.producerAmount;
  }

  return [...groups.values()]
    .map((row) => ({ ...row, unidades: round3(row.unidades) }))
    .filter((row) => row.unidades !== 0 || row.netoVendido !== 0 || row.comision !== 0 || row.montoALiquidar !== 0)
    .sort((a, b) => a.productor.localeCompare(b.productor, 'es') || a.producto.localeCompare(b.producto, 'es'));
}

function isMissingSchemaError(error: unknown): boolean {
  // P2021: la tabla no existe. P2022: falta una columna. Pasa mientras la
  // migración de consignación no se haya aplicado en esa base.
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return code === 'P2021' || code === 'P2022';
}

/**
 * Carga el reporte de una empresa. Nunca lanza: el libro Excel completo no debe
 * caerse porque falle esta hoja. Si no hay datos (o el módulo no existe aún en
 * la base) devuelve una lista vacía y la hoja se omite.
 */
export async function loadProducerSales(companyId: string, range: { from: Date; to: Date }): Promise<ProducerSalesRow[]> {
  const bounds = settlementPeriodBounds(range.from, range.to);
  try {
    const lines = await prisma.consignmentSettlementLine.findMany({
      where: { companyId, documentDate: { gte: bounds.from, lt: bounds.toExclusive } },
      select: {
        kind: true,
        producerId: true,
        productId: true,
        soldNet: true,
        commissionAmount: true,
        producerAmount: true,
        settlementId: true,
        salesDocumentItem: { select: { quantity: true } },
        reverses: { select: { soldNet: true, salesDocumentItem: { select: { quantity: true } } } },
        producer: { select: { contact: { select: { razonSocial: true, rut: true } } } },
        product: { select: { sku: true, name: true } },
      },
    });

    return aggregateProducerSales(
      lines.map((line) => ({
        kind: line.kind,
        producerId: line.producerId,
        producerName: line.producer.contact.razonSocial,
        producerRut: line.producer.contact.rut,
        productId: line.productId,
        sku: line.product.sku,
        productName: line.product.name,
        soldNet: line.soldNet,
        commissionAmount: line.commissionAmount,
        producerAmount: line.producerAmount,
        settlementId: line.settlementId,
        itemQuantity: line.salesDocumentItem?.quantity ?? null,
        origin: line.reverses
          ? { itemQuantity: line.reverses.salesDocumentItem?.quantity ?? null, soldNet: line.reverses.soldNet }
          : null,
      }))
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      captureException(error, { module: 'reportes', companyId, extra: { reason: 'producer-sales-report' } });
    }
    return [];
  }
}
