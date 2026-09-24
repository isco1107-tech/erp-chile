import { prisma } from '@/lib/prisma';
import type { DteType, SalesDocument, SalesDocumentItem } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { applyStockOut } from '@/modules/inventory/services/stock.service';
import { computeDocument } from '../calc';
import { DTE_TYPE_LABELS, STOCK_AFFECTING_DTE_TYPES } from '../schema';

export type SalesDocumentWithItems = SalesDocument & { items: SalesDocumentItem[] };

/** Línea real de producto, vinculada por el usuario al revisar la extracción de IA. */
export interface HistoricalSalesImportItem {
  productId: string | null;
  description: string;
  quantity: number;
  /** Neto en CLP entero. */
  unitPrice: number;
}

export interface HistoricalSalesImportInput {
  contactId: string;
  warehouseId: string;
  dteType: DteType;
  /** `null` cuando el papel original no traía folio o no era legible. */
  folio: number | null;
  /** ISO `YYYY-MM-DD`. */
  issueDate: string;
  /** Neto ya resuelto (venía directo en la fila, o se derivó del total con `calculateNeto`). Se ignora si `items` trae al menos una línea: el documento se calcula desde las líneas, igual que una venta normal. */
  netAmount: number;
  isExempt: boolean;
  /** `true` si la fila indicaba que el documento ya estaba pagado/cobrado. */
  paid: boolean;
  notes?: string;
  /**
   * Detalle de productos vinculado por el usuario (foto/prompt escaneado por
   * IA). Vacío o ausente = comportamiento histórico de siempre (una sola línea
   * sintética, sin stock). Las líneas CON `productId` mueven stock/PMP como
   * una venta real; las líneas sin coincidencia quedan como detalle
   * informativo (suman al total, no tocan inventario) — igual que la línea
   * sintética de siempre.
   */
  items?: HistoricalSalesImportItem[];
}

/**
 * Inserta — o enriquece, ver más abajo — un documento de venta histórico
 * (importado desde Excel/CSV o desde una foto escaneada por IA), con folio
 * explícito.
 *
 * Existe separado de `createSalesDocument` a propósito: ese camino SIEMPRE
 * asigna folio automático vía `FolioSequence` y nunca acepta uno explícito —
 * es la regla correcta para emisión real, pero un documento histórico ya tenía
 * su folio asignado en el mundo real cuando se emitió en papel. Este servicio
 * es exclusivo del importador masivo; el flujo normal de emisión no cambia.
 *
 * Sin `items` (línea sintética, sin `productId`): no toca Stock/InventoryMovement/PMP,
 * porque esos movimientos ya ocurrieron en la realidad antes de que la empresa
 * empezara a usar el sistema (la carga de Stock Inicial es la única fuente de
 * verdad para el PMP de partida — ver `stock.service.ts`). Con `items`
 * vinculados a productos reales, SÍ descuenta stock/PMP como una venta normal
 * — decisión explícita del usuario al extender el escaneo por IA con detalle
 * de productos.
 *
 * **Enriquecer un documento ya importado**: si ya existe un documento ISSUED
 * con el mismo folio y esta llamada trae `items`, en vez de rechazar por
 * folio duplicado se REEMPLAZAN sus líneas por las nuevas (recalculando neto/
 * IVA/total y aplicando el movimiento de stock que antes no se aplicó) — el
 * caso real es "subí la boleta solo con el total, ahora quiero agregarle el
 * detalle de productos sin duplicar el documento". Blindado contra doble
 * aplicación de stock: solo se permite si el documento existente NINGUNA
 * línea vinculada a un producto real todavía (si ya tiene detalle, se
 * rechaza — enriquecer dos veces movería stock dos veces).
 */
export async function importHistoricalSalesDocument(
  companyId: string,
  input: HistoricalSalesImportInput
): Promise<SalesDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
    if (!contact) throw new Error('Cliente no encontrado');

    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new Error('Bodega no encontrada');

    const hasRealItems = (input.items?.length ?? 0) > 0;

    let existing: (SalesDocument & { items: SalesDocumentItem[] }) | null = null;
    if (input.folio !== null) {
      const existingRef = await tx.salesDocument.findFirst({
        where: { companyId, dteType: input.dteType, folio: input.folio },
        select: { id: true },
      });
      if (existingRef) {
        // Lock ANTES de leer `items` y decidir si se puede enriquecer: sin
        // esto, dos confirmaciones concurrentes del mismo folio (doble clic,
        // reintento de red) podían ambas leer "sin detalle todavía", pasar el
        // chequeo de abajo, y aplicar el movimiento de stock dos veces —
        // mismo motivo por el que `enrichPurchaseDocumentWithItems` ya toma
        // este lock del lado de compras.
        await tx.$queryRaw`SELECT id FROM "SalesDocument" WHERE id = ${existingRef.id} AND "companyId" = ${companyId} FOR UPDATE`;
        existing = await tx.salesDocument.findFirst({
          where: { id: existingRef.id },
          include: { items: true },
        });
      }
      if (existing) {
        if (!hasRealItems) {
          throw new Error(
            `Ya existe un documento ${DTE_TYPE_LABELS[input.dteType]} con folio ${input.folio} en tu empresa`
          );
        }
        if (existing.status !== 'ISSUED') {
          throw new Error(
            `Ya existe un documento ${DTE_TYPE_LABELS[input.dteType]} con folio ${input.folio}, pero no está emitido (no se puede enriquecer con detalle)`
          );
        }
        if (existing.items.some((item) => item.productId)) {
          throw new Error(
            `El documento ${DTE_TYPE_LABELS[input.dteType]} folio ${input.folio} ya tiene detalle de productos vinculado — no se puede sobreescribir de nuevo`
          );
        }
      }
    }

    // Con detalle de productos: cada línea se resuelve contra el catálogo real
    // (igual que `createSalesDocument`) para leer `isExempt`/`costPricePMP`
    // SIEMPRE del producto, nunca de lo que la IA haya adivinado en la foto —
    // mismo motivo que ya documenta CLAUDE.md para el flujo normal de ventas.
    // Sin detalle: una sola línea sintética, igual que siempre (nadie tiene el
    // desglose SKU por SKU de una boleta en papel de hace años).
    const linesWithCost: Array<{ unitPrice: number; quantity: number; isExempt: boolean; productId?: string; description?: string; unitCostPMP: number }> = [];
    if (hasRealItems) {
      for (const item of input.items!) {
        let isExempt = input.isExempt;
        let unitCostPMP = 0;
        if (item.productId) {
          const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
          if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
          isExempt = product.isExempt;
          unitCostPMP = product.costPricePMP;
        }
        linesWithCost.push({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          isExempt,
          productId: item.productId ?? undefined,
          description: item.description,
          unitCostPMP,
        });
      }
    } else {
      linesWithCost.push({ unitPrice: input.netAmount, quantity: 1, isExempt: input.isExempt, unitCostPMP: 0 });
    }

    // `computeDocument` es la única fuente del reparto de IVA, igual que en el
    // flujo normal de emisión — así el neto/IVA/total quedan consistentes con
    // el resto del sistema (F29 incluido) en vez de recalcularse a mano acá.
    const { items: computedItems, totals } = computeDocument(linesWithCost);
    const { netAmount, exemptAmount, ivaAmount, totalAmount } = totals;

    // Si el documento ya tenía un pago registrado, un cambio de monto no
    // trivial al recalcular desde el detalle dejaría `paidAmount` inconsistente
    // con el nuevo `totalAmount` (incluso `paidAmount > totalAmount`) sin que
    // nada lo detecte — el chequeo de tolerancia de la fila reimportada solo
    // corre si esa fila vuelve a declarar neto/total, y puede perfectamente no
    // hacerlo. Se bloquea para revisión humana en vez de dejarlo pasar en
    // silencio.
    if (existing && existing.paidAmount > 0) {
      const tolerance = Math.max(50, Math.round(existing.totalAmount * 0.02));
      if (Math.abs(totalAmount - existing.totalAmount) > tolerance) {
        throw new Error(
          `Este documento ya tiene un pago registrado ($${existing.paidAmount.toLocaleString('es-CL')}) pero el total recalculado desde el detalle ($${totalAmount.toLocaleString('es-CL')}) difiere demasiado del anterior ($${existing.totalAmount.toLocaleString('es-CL')}). Revisa el detalle antes de confirmar.`
        );
      }
    }

    const itemsCreateData = computedItems.map((item) => ({
      companyId,
      productId: item.productId,
      description: item.description ?? 'Importación histórica',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      isExempt: item.isExempt ?? false,
      discountPercent: 0,
      subtotal: item.subtotal,
      iva: item.iva,
      total: item.total,
      unitCostPMP: item.unitCostPMP,
    }));

    let created: SalesDocumentWithItems;
    if (existing) {
      // Enriquecer: reemplaza las líneas (la sintética, sin producto) por las
      // nuevas y recalcula neto/IVA/total desde ellas. El folio/contador ya
      // se contabilizó la primera vez — no se vuelve a tocar `FolioSequence`.
      await tx.salesDocumentItem.deleteMany({ where: { salesDocumentId: existing.id, companyId } });
      created = await tx.salesDocument.update({
        where: { id: existing.id },
        data: {
          warehouseId: input.warehouseId,
          netAmount,
          exemptAmount,
          ivaAmount,
          totalAmount,
          // Nunca más pagado que el total recalculado (N-18): dentro de la
          // tolerancia de arriba el total puede bajar por debajo de lo ya pagado.
          paidAmount: input.paid ? totalAmount : Math.min(existing.paidAmount, totalAmount),
          paymentStatus: input.paid ? 'PAID' : paymentStatusFor(Math.min(existing.paidAmount, totalAmount), totalAmount),
          notes: input.notes ?? existing.notes,
          items: { create: itemsCreateData },
        },
        include: { items: true },
      });
    } else {
      created = await tx.salesDocument.create({
        data: {
          companyId,
          contactId: input.contactId,
          warehouseId: input.warehouseId,
          dteType: input.dteType,
          folio: input.folio,
          status: 'ISSUED',
          issueDate: new Date(input.issueDate),
          // No hay forma de pago real conocida del papel original: se deja
          // constancia explícita de que el dato es histórico en vez de inventar
          // una forma de pago que nunca ocurrió.
          paymentMethod: 'HISTORICO',
          netAmount,
          exemptAmount,
          ivaAmount,
          totalAmount,
          paidAmount: input.paid ? totalAmount : 0,
          paymentStatus: input.paid ? 'PAID' : 'UNPAID',
          notes: input.notes,
          items: { create: itemsCreateData },
        },
        include: { items: true },
      });
    }

    // Detalle vinculado a productos reales: mueve stock/PMP exactamente como
    // una venta emitida normal (`createSalesDocument`) — el papel ya reflejó
    // esta salida en la realidad, y el usuario pidió explícitamente que la
    // carga histórica también descuente inventario cuando hay línea real.
    // Las líneas sin `productId` (sin coincidencia confirmada) se saltan: son
    // detalle informativo, igual que la línea sintética de siempre.
    if (hasRealItems && STOCK_AFFECTING_DTE_TYPES.includes(input.dteType)) {
      for (const item of computedItems) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product || !product.isTrackable) continue;
        await applyStockOut(tx, companyId, {
          productId: item.productId,
          warehouseId: input.warehouseId,
          type: 'SALE_OUT',
          quantity: item.quantity,
          reference: `Importación histórica DTE ${DTE_TYPE_LABELS[input.dteType]} Folio #${input.folio ?? '-'}`,
        });
      }
    }

    // El próximo folio REAL que emita el sistema no debe chocar con folios
    // históricos ya cargados: el contador sube al mayor de los dos, nunca
    // retrocede (otro documento histórico con folio menor pudo importarse
    // después, dentro del mismo lote o en uno posterior). Si `existing` ya
    // existía, este folio ya se contabilizó la primera vez — nada que hacer.
    if (!existing && input.folio !== null) {
      const existingSeq = await tx.folioSequence.findUnique({
        where: { companyId_dteType: { companyId, dteType: input.dteType } },
      });
      if (!existingSeq) {
        await tx.folioSequence.create({ data: { companyId, dteType: input.dteType, currentFolio: input.folio } });
      } else if (existingSeq.currentFolio < input.folio) {
        await tx.folioSequence.update({
          where: { companyId_dteType: { companyId, dteType: input.dteType } },
          data: { currentFolio: input.folio },
        });
      }
    }

    return created;
  }, LOCKING_TX_OPTIONS);
}

function paymentStatusFor(paidAmount: number, totalAmount: number): 'UNPAID' | 'PARTIAL' | 'PAID' {
  if (paidAmount <= 0) return 'UNPAID';
  return paidAmount >= totalAmount ? 'PAID' : 'PARTIAL';
}
