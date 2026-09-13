import { prisma } from '@/lib/prisma';
import type { Prisma, SalesDocument, SalesDocumentItem } from '@prisma/client';
import { applyStockOut, type TxClient } from '@/modules/inventory/services/stock.service';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postSalesDocumentIssued } from '@/modules/accounting/posting-rules/sales-posting';
import { computeDocument } from '@/modules/sales/calc';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { assignSalesFolio, stampDocument } from '@/modules/dte/services/stamping.service';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type { WorkflowEventPayload } from '@/lib/workflows/types';
import { CASH_PAYMENT_METHODS, type PosSaleInput } from '../schema';

/**
 * RUT del receptor genérico de boletas. Es la convención del SII para ventas a
 * consumidor final que no se identifica, que es el caso normal en mostrador.
 */
const GENERIC_CUSTOMER_RUT = '66.666.666-6';
const GENERIC_CUSTOMER_NAME = 'Consumidor Final';

/**
 * Contacto usado como receptor cuando el cliente no entrega RUT. Se crea una
 * sola vez por empresa y se reutiliza: `SalesDocument.contactId` es obligatorio,
 * así que sin esto no se podría emitir una boleta anónima.
 */
async function getOrCreateGenericCustomer(tx: TxClient, companyId: string): Promise<string> {
  const rutClean = cleanRut(GENERIC_CUSTOMER_RUT);
  const existing = await tx.contact.findFirst({ where: { companyId, rutClean } });
  if (existing) return existing.id;

  const created = await tx.contact.create({
    data: {
      companyId,
      rut: GENERIC_CUSTOMER_RUT,
      rutClean,
      razonSocial: GENERIC_CUSTOMER_NAME,
      isCustomer: true,
      isSupplier: false,
    },
  });
  return created.id;
}

/** Resuelve el receptor: el cliente identificado por RUT, o el genérico. */
async function resolveCustomer(tx: TxClient, companyId: string, rawRut?: string): Promise<string> {
  const trimmed = rawRut?.trim();
  if (!trimmed) return getOrCreateGenericCustomer(tx, companyId);

  if (!validateRut(trimmed)) throw new Error('El RUT del cliente no es válido');

  const rutClean = cleanRut(trimmed);
  const existing = await tx.contact.findFirst({ where: { companyId, rutClean } });
  if (existing) return existing.id;

  // Cliente nuevo de mostrador: se registra con lo mínimo para no frenar la
  // venta. El vendedor puede completar sus datos después desde Contactos.
  const created = await tx.contact.create({
    data: {
      companyId,
      rut: formatRut(rutClean),
      rutClean,
      razonSocial: `Cliente ${formatRut(rutClean)}`,
      isCustomer: true,
      isSupplier: false,
    },
  });
  return created.id;
}

export type PosSaleResult = SalesDocument & {
  items: SalesDocumentItem[];
  changeDue: number;
};

/**
 * Registra una venta de mostrador completa en una sola transacción: emite la
 * boleta con folio, descuenta stock al PMP vigente, deja el cobro registrado y
 * la ata al turno de caja.
 *
 * Es una transacción única y no una secuencia de llamadas a los servicios de
 * ventas y tesorería a propósito: si el proceso muriera entre "emitir" y
 * "cobrar", quedaría una boleta emitida e impaga y un cajón descuadrado, y en
 * un mostrador nadie se entera hasta el arqueo.
 */
export async function createPosSale(
  companyId: string,
  userId: string,
  shiftId: string,
  input: PosSaleInput
): Promise<PosSaleResult> {
  // Mismo motivo que `sales.service.ts`: capturado dentro de la transacción,
  // emitido recién después de que confirme — el motor de automatizaciones es
  // I/O externo y no debe poder hacer rollback de un cobro de mostrador ya
  // efectuado. Queda `null` en el camino de idempotencia para no disparar el
  // evento dos veces ante un reintento del mismo `idempotencyKey`.
  let emittedSalePayload: WorkflowEventPayload | null = null;

  const result = await prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.salesDocument.findUnique({
        where: { companyId_idempotencyKey: { companyId, idempotencyKey: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) {
        const changeDue =
          CASH_PAYMENT_METHODS.includes(input.paymentMethod) && input.cashReceived !== undefined
            ? Math.max(0, input.cashReceived - existing.totalAmount)
            : 0;
        return { ...existing, changeDue };
      }
    }

    const shift = await tx.cashShift.findFirst({
      where: { id: shiftId, companyId, userId, status: 'OPEN' },
      include: { cashRegister: true },
    });
    if (!shift) throw new Error('No tienes un turno de caja abierto');

    const warehouseId = shift.cashRegister.warehouseId;
    const contactId = await resolveCustomer(tx, companyId, input.customerRut);
    // Se necesita el contacto completo (no solo el id) para el receptor del
    // timbre electrónico si la empresa tiene CAF cargado — ver más abajo.
    const contact = await tx.contact.findFirst({ where: { id: contactId, companyId } });
    if (!contact) throw new Error('Cliente no encontrado');

    // Los precios los pone el servidor desde el catálogo. Aceptar el precio del
    // cliente permitiría vender a $1 desde la consola del navegador.
    const lines = [];
    for (const item of input.items) {
      const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
      if (!product) throw new Error('Producto no encontrado en el catálogo');
      lines.push({
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: item.quantity,
        unitPrice: product.netPrice,
        // La condición de exento la fija el catálogo, no el terminal: es un
        // atributo tributario del producto y `computeDocument` lo necesita para
        // dejar la línea fuera de la base imponible.
        isExempt: product.isExempt,
        discountPercent: item.discountPercent ?? 0,
        unitCostPMP: product.costPricePMP,
        isTrackable: product.isTrackable,
      });
    }

    const { items: computedItems, totals } = computeDocument(lines);

    // El esquema ya exige `cashReceived` en efectivo; el `?? 0` deja la guarda
    // cerrada aunque alguien invoque el servicio sin pasar por el esquema.
    if (input.paymentMethod === 'EFECTIVO' && (input.cashReceived ?? 0) < totals.totalAmount) {
      throw new Error('El efectivo recibido es menor al total de la venta');
    }

    // Mismo camino que Ventas (`assignSalesFolio`): si la empresa tiene un CAF
    // vigente para Boleta, el folio sale del rango autorizado por el SII y el
    // documento se puede timbrar. Antes esta ruta llamaba directo a
    // `folioSequence.upsert`, así que una boleta de mostrador NUNCA obtenía
    // timbre válido aunque hubiera CAF cargado — y con Ventas usando el mismo
    // tipo de documento por el camino del CAF, quedaban dos contadores de
    // folio independientes para BOLETA_39, con riesgo real de duplicados ante
    // el SII.
    const folioAssignment = await assignSalesFolio(tx, companyId, 'BOLETA_39');
    const folio = folioAssignment.folio;
    const reference = `POS ${DTE_TYPE_LABELS.BOLETA_39} Folio #${folio}`;

    // El costo que se persiste en la línea se toma del movimiento de Kardex, no
    // de la lectura previa del catálogo: `applyStockOut` lee el PMP con lock de
    // fila, así que es el único valor garantizado como vigente. Copiar el de la
    // lectura suelta dejaba el margen del documento desalineado del Kardex si
    // una compra confirmaba entre ambas lecturas.
    const costByProduct = new Map<string, number>();
    const costedItemsForAccounting: { unitCostPMP: number; quantity: number }[] = [];
    for (const item of computedItems) {
      if (!item.isTrackable) continue;
      const movement = await applyStockOut(tx, companyId, {
        productId: item.productId,
        warehouseId,
        type: 'SALE_OUT',
        quantity: item.quantity,
        reference,
      });
      costByProduct.set(item.productId, movement.unitCost);
      costedItemsForAccounting.push({ unitCostPMP: movement.unitCost, quantity: item.quantity });
    }

    // Timbrado electrónico — mismo bloque que `sales.service.ts`. Solo ocurre
    // cuando el folio vino de un CAF (`folioAssignment.stamping` no nulo); sin
    // folio autorizado no hay nada que timbrar y la boleta sigue naciendo con
    // numeración interna, tal como ya documenta el fallback deliberado.
    const issuedAt = new Date();
    let stamped: { tedXml: string; signedXml: string } | null = null;

    if (folioAssignment.stamping) {
      const issuer = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          rut: true,
          businessName: true,
          giro: true,
          actividadEconomicaCodigo: true,
          address: true,
          comuna: true,
          ciudad: true,
        },
      });

      if (issuer) {
        stamped = stampDocument({
          siiCode: folioAssignment.stamping.siiCode,
          folio,
          issueDate: issuedAt,
          dueDate: null,
          paymentMethod: input.paymentMethod,
          issuer,
          receiver: {
            rut: contact.rut,
            businessName: contact.razonSocial,
            giro: contact.giro,
            address: contact.address,
            comuna: contact.comuna,
            ciudad: null,
          },
          lines: computedItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.total,
            isExempt: item.isExempt ?? false,
            discountPercent: item.discountPercent ?? 0,
            sku: item.sku,
          })),
          totals: {
            netAmount: totals.netAmount,
            exemptAmount: totals.exemptAmount,
            ivaAmount: totals.ivaAmount,
            totalAmount: totals.totalAmount,
          },
          cafBlockXml: folioAssignment.stamping.cafBlockXml,
          privateKeyPem: folioAssignment.stamping.privateKeyPem,
        });
      }
    }

    const document = await tx.salesDocument.create({
      data: {
        companyId,
        contactId,
        warehouseId,
        cashShiftId: shiftId,
        dteType: 'BOLETA_39',
        folio,
        status: 'ISSUED',
        issueDate: issuedAt,
        cafId: folioAssignment.cafId ?? undefined,
        tedXml: stamped?.tedXml,
        signedXml: stamped?.signedXml,
        // Timbrado pero aún no despachado al SII — mismo significado que en
        // Ventas: `null` cuando el documento no tiene timbre (numeración
        // interna), 'PENDING' cuando sí.
        siiStatus: stamped ? 'PENDING' : undefined,
        paymentMethod: input.paymentMethod,
        netAmount: totals.netAmount,
        exemptAmount: totals.exemptAmount,
        ivaAmount: totals.ivaAmount,
        totalAmount: totals.totalAmount,
        // La venta de mostrador se cobra en el acto: nace pagada.
        paidAmount: totals.totalAmount,
        paymentStatus: 'PAID',
        idempotencyKey: input.idempotencyKey,
        items: {
          create: computedItems.map((item) => ({
            companyId,
            productId: item.productId,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            isExempt: item.isExempt,
            discountPercent: item.discountPercent,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
            unitCostPMP: costByProduct.get(item.productId) ?? item.unitCostPMP,
          })),
        },
      },
      include: { items: true },
    });

    // El asiento nace junto con la boleta, dentro de la misma transacción —
    // una venta de mostrador siempre nace pagada al contado.
    await postSalesDocumentIssued(tx, companyId, document, costedItemsForAccounting, {
      isImmediatePayment: true,
      affectsStock: costedItemsForAccounting.length > 0,
    });

    await tx.payment.create({
      data: {
        companyId,
        type: 'INCOME',
        contactId,
        salesDocumentId: document.id,
        amount: totals.totalAmount,
        paymentMethod: input.paymentMethod,
        notes: reference,
      },
    });

    const changeDue =
      CASH_PAYMENT_METHODS.includes(input.paymentMethod) && input.cashReceived !== undefined
        ? input.cashReceived - totals.totalAmount
        : 0;

    emittedSalePayload = {
      documentId: document.id,
      dteType: 'BOLETA_39',
      folio,
      contactId: contact.id,
      contactName: contact.razonSocial,
      totalAmount: totals.totalAmount,
      paymentMethod: input.paymentMethod,
      isDte: stamped !== null,
    };

    return { ...document, changeDue };
  }, LOCKING_TX_OPTIONS);

  if (emittedSalePayload) {
    void emitWorkflowEvent(companyId, 'SALE_ISSUED', emittedSalePayload);
  }

  return result;
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  netPrice: number;
  grossPrice: number;
  stock: number;
  isTrackable: boolean;
  isExempt: boolean;
}

/**
 * Catálogo para el terminal, con el stock de la bodega de la caja. Se carga
 * completo una vez: el mostrador necesita que buscar por código de barras sea
 * instantáneo y no dependa de un round-trip por cada tecla.
 */
export async function listPosProducts(companyId: string, warehouseId: string): Promise<PosProduct[]> {
  const products = await prisma.product.findMany({
    where: { companyId },
    include: { stocks: { where: { warehouseId }, select: { quantity: true } } },
    orderBy: { name: 'asc' },
  });

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    netPrice: product.netPrice,
    grossPrice: product.grossPrice,
    stock: product.stocks.reduce((sum, s) => sum + s.quantity, 0),
    isTrackable: product.isTrackable,
    isExempt: product.isExempt,
  }));
}

export type PosSaleListItem = Pick<
  SalesDocument,
  'id' | 'folio' | 'totalAmount' | 'paymentMethod' | 'status' | 'createdAt'
> & { contact: { razonSocial: string } };

export async function listShiftSales(companyId: string, shiftId: string): Promise<PosSaleListItem[]> {
  return prisma.salesDocument.findMany({
    where: { companyId, cashShiftId: shiftId },
    select: {
      id: true,
      folio: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      createdAt: true,
      contact: { select: { razonSocial: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export type PosTicketData = Prisma.SalesDocumentGetPayload<{
  include: { items: true; contact: true; company: true };
}>;

export async function getTicket(companyId: string, documentId: string): Promise<PosTicketData | null> {
  return prisma.salesDocument.findFirst({
    where: { id: documentId, companyId },
    include: { items: true, contact: true, company: true },
  });
}
