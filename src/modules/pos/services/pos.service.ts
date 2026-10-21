import { prisma } from '@/lib/prisma';
import type { DteType, Prisma, SalesDocument, SalesDocumentItem } from '@prisma/client';
import { applyStockOut, type TxClient } from '@/modules/inventory/services/stock.service';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { constraintInvolves } from '@/lib/prisma-errors';
import { postSalesDocumentIssued } from '@/modules/accounting/posting-rules/sales-posting';
import { computeDocument } from '@/modules/sales/calc';
import { resolveUnitPrice } from '@/modules/sales/pricing';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { cancelSalesDocument, createSalesDocument, type SalesDocumentWithItems } from '@/modules/sales/services/sales.service';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { calculateTotal } from '@/lib/chile/tax';
import { isExemptDocument } from '@/lib/chile/dte/codes';
import { tedPdf417DataUri } from '@/lib/chile/dte/barcode';
import { assignSalesFolio, stampDocument } from '@/modules/dte/services/stamping.service';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { applyConsignmentToIssuedDocument } from '@/modules/consignment/services/consignment-hook.service';
import type { WorkflowEventPayload } from '@/lib/workflows/types';
import {
  computeCashChangeChile,
  computeCashRoundingDiff,
  isCashPaymentSufficientChile,
  roundCashChile,
} from '../calc';
import { registerCashMovement } from './cash.service';
import { CASH_PAYMENT_METHODS, type PosCreditNoteInput, type PosSaleInput } from '../schema';

/**
 * RUT del receptor genérico de boletas. Es la convención del SII para ventas a
 * consumidor final que no se identifica, que es el caso normal en mostrador.
 */
const GENERIC_CUSTOMER_RUT = '66.666.666-6';
const GENERIC_CUSTOMER_NAME = 'Consumidor Final';

interface CustomerExtraInput {
  name?: string;
  giro?: string;
  address?: string;
  comuna?: string;
}

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
async function resolveCustomer(
  tx: TxClient,
  companyId: string,
  rawRut?: string,
  extra?: CustomerExtraInput
): Promise<string> {
  const trimmed = rawRut?.trim();
  if (!trimmed) return getOrCreateGenericCustomer(tx, companyId);

  if (!validateRut(trimmed)) throw new Error('El RUT del cliente no es válido');

  const rutClean = cleanRut(trimmed);
  const existing = await tx.contact.findFirst({ where: { companyId, rutClean } });

  const name = extra?.name?.trim();
  const giro = extra?.giro?.trim();
  const address = extra?.address?.trim();
  const comuna = extra?.comuna?.trim();

  if (existing) {
    // Si el cajero completó datos de facturación (Razón Social, Giro, Dirección, Comuna)
    // en la venta con Factura, actualiza la ficha del cliente en el acto.
    const updateData: Prisma.ContactUpdateManyMutationInput = {};
    if (name && (existing.razonSocial.startsWith('Cliente ') || existing.razonSocial !== name)) {
      updateData.razonSocial = name;
    }
    if (giro && !existing.giro) updateData.giro = giro;
    if (address && !existing.address) updateData.address = address;
    if (comuna && !existing.comuna) updateData.comuna = comuna;

    if (
      Object.keys(updateData).length > 0 &&
      typeof (tx.contact as { updateMany?: unknown }).updateMany === 'function'
    ) {
      await tx.contact.updateMany({
        where: { id: existing.id, companyId },
        data: updateData,
      });
    }
    return existing.id;
  }

  // Cliente nuevo de mostrador: se registra con los datos entregados o lo mínimo
  // para no frenar la fila de caja.
  const created = await tx.contact.create({
    data: {
      companyId,
      rut: formatRut(rutClean),
      rutClean,
      razonSocial: name || `Cliente ${formatRut(rutClean)}`,
      giro: giro || undefined,
      address: address || undefined,
      comuna: comuna || undefined,
      isCustomer: true,
      isSupplier: false,
    },
  });
  return created.id;
}

export type PosSaleResult = SalesDocument & {
  items: SalesDocumentItem[];
  changeDue: number;
  /** Monto redondeado a decena según Ley N° 20.956 para cobros en efectivo. */
  cashRoundedTotal?: number;
  /** Diferencia por redondeo Ley 20.956 (ej. -3 o +4). */
  cashRoundingDiff?: number;
  /** Data URI SVG del timbre electrónico PDF417 del SII para impresión térmica 80mm. */
  timbrePdf417?: string | null;
  contact?: {
    rut: string;
    razonSocial: string;
    giro?: string | null;
    address?: string | null;
    comuna?: string | null;
  };
};

/**
 * Registra una venta de mostrador completa en una sola transacción: emite la
 * boleta o factura con folio, descuenta stock al PMP vigente (y lotes FEFO),
 * deja el cobro registrado, genera asiento contable y la ata al turno de caja.
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
        const isCash = CASH_PAYMENT_METHODS.includes(input.paymentMethod);
        const cashRoundedTotal = isCash ? roundCashChile(existing.totalAmount) : existing.totalAmount;
        const cashRoundingDiff = isCash ? computeCashRoundingDiff(existing.totalAmount) : 0;
        const changeDue =
          isCash && input.cashReceived !== undefined
            ? computeCashChangeChile(input.cashReceived, existing.totalAmount)
            : 0;
        return { ...existing, changeDue, cashRoundedTotal, cashRoundingDiff };
      }
    }

    // Lock del turno ANTES de leer su estado y ANTES de cualquier lock de
    // producto (mismo orden en todas las rutas de caja, para no cruzarse con
    // el lock de Kardex y generar deadlocks). Sin este lock, la venta puede
    // leer OPEN un instante antes de que `closeShift` congele el resumen y
    // confirmar después de que el turno ya quedó CLOSED, dejando la venta
    // fuera del arqueo aunque el dinero entró al cajón.
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} AND "companyId" = ${companyId} FOR UPDATE`;
    const shift = await tx.cashShift.findFirst({
      where: { id: shiftId, companyId, userId, status: 'OPEN' },
      include: { cashRegister: true },
    });
    if (!shift) throw new Error('No tienes un turno de caja abierto');

    const warehouseId = shift.cashRegister.warehouseId;
    const contactId = await resolveCustomer(tx, companyId, input.customerRut, {
      name: input.customerName,
      giro: input.customerGiro,
      address: input.customerAddress,
      comuna: input.customerComuna,
    });
    // Se necesita el contacto completo (no solo el id) para el receptor del
    // timbre electrónico si la empresa tiene CAF cargado — ver más abajo.
    const contact = await tx.contact.findFirst({ where: { id: contactId, companyId } });
    if (!contact) throw new Error('Cliente no encontrado');

    const contactPriceListId =
      (contact as typeof contact & { priceListId?: string | null }).priceListId ?? null;

    // Los precios los pone el servidor desde el catálogo (o el tramo mayorista
    // activo que corresponda a la cantidad llevada). Aceptar el precio del
    // cliente permitiría vender a $1 desde la consola del navegador.
    const lines = [];
    for (const item of input.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId },
        include: {
          priceListItems: {
            where: { priceList: { isActive: true } },
            select: { minQuantity: true, netPrice: true, priceListId: true },
          },
        },
      });
      if (!product) throw new Error('Producto no encontrado en el catálogo');

      const rawTiers =
        (
          product as typeof product & {
            priceListItems?: { minQuantity: number; netPrice: number; priceListId: string }[];
          }
        ).priceListItems ?? [];

      const applicableTiers = contactPriceListId
        ? rawTiers.filter((t) => t.priceListId === contactPriceListId)
        : rawTiers.filter((t) => t.minQuantity > 1);

      const unitPrice = resolveUnitPrice(product.netPrice, applicableTiers, item.quantity);

      lines.push({
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: item.quantity,
        unitPrice,
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

    const dteType: DteType = input.dteType ?? 'BOLETA_39';
    if (isExemptDocument(dteType) && totals.netAmount > 0) {
      throw new Error(
        'Un documento exento no puede incluir productos afectos a IVA. Usa Boleta Electrónica (39) o Factura Electrónica (33).'
      );
    }

    // Validación de efectivo recibido con redondeo legal chileno (Ley N° 20.956):
    // en pagos en efectivo, los finales 1..5 redondean a 0 hacia abajo.
    if (
      input.paymentMethod === 'EFECTIVO' &&
      !isCashPaymentSufficientChile(input.cashReceived ?? 0, totals.totalAmount)
    ) {
      throw new Error('El efectivo recibido es menor al total de la venta');
    }

    // Mismo camino que Ventas (`assignSalesFolio`): si la empresa tiene un CAF
    // vigente para el tipo de DTE, el folio sale del rango autorizado por el SII
    // y el documento se puede timbrar.
    const folioAssignment = await assignSalesFolio(tx, companyId, dteType);
    const folio = folioAssignment.folio;
    const dteLabel = DTE_TYPE_LABELS[dteType] ?? dteType;
    const reference = `POS ${dteLabel} Folio #${folio}`;

    // El costo que se persiste en la línea se toma del movimiento de Kardex, no
    // de la lectura previa del catálogo: `applyStockOut` lee el PMP con lock de
    // fila, así que es el único valor garantizado como vigente.
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
        // La cajera del turno es la vendedora de la boleta (comisiones).
        sellerId: userId,
        dteType,
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
        notes: input.notes?.trim() || undefined,
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

    // Productores en consignación: devenga la venta dentro de la misma
    // transacción (no-op sin el módulo activo; un fallo revierte la boleta).
    await applyConsignmentToIssuedDocument(tx, companyId, {
      id: document.id,
      dteType: document.dteType,
      referenceType: document.referenceType,
      referenceFolio: document.referenceFolio,
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

    const isCash = CASH_PAYMENT_METHODS.includes(input.paymentMethod);
    const cashRoundedTotal = isCash ? roundCashChile(totals.totalAmount) : totals.totalAmount;
    const cashRoundingDiff = isCash ? computeCashRoundingDiff(totals.totalAmount) : 0;
    const changeDue =
      isCash && input.cashReceived !== undefined
        ? computeCashChangeChile(input.cashReceived, totals.totalAmount)
        : 0;

    emittedSalePayload = {
      documentId: document.id,
      dteType,
      folio,
      contactId: contact.id,
      contactName: contact.razonSocial,
      totalAmount: totals.totalAmount,
      paymentMethod: input.paymentMethod,
      isDte: stamped !== null,
    };

    return {
      ...document,
      changeDue,
      cashRoundedTotal,
      cashRoundingDiff,
      contact: {
        rut: contact.rut,
        razonSocial: contact.razonSocial,
        giro: contact.giro ?? null,
        address: contact.address ?? null,
        comuna: contact.comuna ?? null,
      },
    };
  }, LOCKING_TX_OPTIONS).catch(async (error: unknown) => {
    // Mismo caso que en `createSalesDocument`: el reintento simultáneo que
    // pierde la carrera devuelve la venta ya cobrada en vez de un error.
    if (input.idempotencyKey && constraintInvolves(error, 'idempotencyKey')) {
      const existing = await prisma.salesDocument.findUnique({
        where: { companyId_idempotencyKey: { companyId, idempotencyKey: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) {
        emittedSalePayload = null;
        const isCash = CASH_PAYMENT_METHODS.includes(input.paymentMethod);
        const cashRoundedTotal = isCash ? roundCashChile(existing.totalAmount) : existing.totalAmount;
        const cashRoundingDiff = isCash ? computeCashRoundingDiff(existing.totalAmount) : 0;
        const changeDue =
          isCash && input.cashReceived !== undefined
            ? computeCashChangeChile(input.cashReceived, existing.totalAmount)
            : 0;
        return { ...existing, changeDue, cashRoundedTotal, cashRoundingDiff };
      }
    }
    throw error;
  });

  if (emittedSalePayload) {
    void emitWorkflowEvent(companyId, 'SALE_ISSUED', emittedSalePayload);
  }

  const timbrePdf417 = result.tedXml ? tedPdf417DataUri(result.tedXml) : null;
  return { ...result, timbrePdf417 };
}

export interface PosPriceTier {
  minQuantity: number;
  netPrice: number;
  grossPrice: number;
}

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  brand: string | null;
  imageUrl: string | null;
  netPrice: number;
  grossPrice: number;
  stock: number;
  minStock: number;
  isTrackable: boolean;
  isExempt: boolean;
  tracksLots: boolean;
  /** Próximo vencimiento FEFO en la bodega de la caja (`YYYY-MM-DD`), si aplica. */
  nextExpiryDate: string | null;
  barcode: string | null;
  /** Códigos de empaques: escanear uno agrega `factor` unidades. */
  packagings: { barcode: string; factor: number; name: string }[];
  /** Tramos de precio por volumen (ej. Mayorista desde 3 o 6 unidades). */
  priceTiers: PosPriceTier[];
}

/**
 * Catálogo para el terminal, con el stock de la bodega de la caja, categorías,
 * empaques, vencimiento FEFO y tramos de precio por volumen. Se carga completo
 * una vez: el mostrador necesita que buscar o pistolear un código de barras
 * (incluyendo balanzas EAN-13 prefijo 20–29) sea instantáneo.
 */
export async function listPosProducts(companyId: string, warehouseId: string): Promise<PosProduct[]> {
  const products = await prisma.product.findMany({
    where: { companyId, isActive: true },
    include: {
      category: { select: { id: true, name: true } },
      stocks: { where: { warehouseId }, select: { quantity: true } },
      packagings: { where: { barcode: { not: null } }, select: { barcode: true, factor: true, name: true } },
      lots: {
        where: { warehouseId, quantity: { gt: 0 }, expiryDate: { not: null } },
        select: { expiryDate: true },
        orderBy: { expiryDate: 'asc' },
        take: 1,
      },
      priceListItems: {
        where: { priceList: { isActive: true }, minQuantity: { gt: 1 } },
        select: { minQuantity: true, netPrice: true },
        orderBy: { minQuantity: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return products.map((product) => {
    // Consolidar tramos por `minQuantity` eligiendo el menor precio neto activo.
    const tierMap = new Map<number, number>();
    for (const item of product.priceListItems) {
      const prev = tierMap.get(item.minQuantity);
      if (prev === undefined || item.netPrice < prev) {
        tierMap.set(item.minQuantity, item.netPrice);
      }
    }
    const priceTiers: PosPriceTier[] = Array.from(tierMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minQuantity, netPrice]) => ({
        minQuantity,
        netPrice,
        grossPrice: product.isExempt ? netPrice : calculateTotal(netPrice),
      }));

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      brand: product.brand ?? null,
      imageUrl: product.imageUrl ?? null,
      netPrice: product.netPrice,
      grossPrice: product.grossPrice,
      stock: product.stocks.reduce((sum, s) => sum + s.quantity, 0),
      minStock: product.minStock,
      isTrackable: product.isTrackable,
      isExempt: product.isExempt,
      tracksLots: product.tracksLots,
      nextExpiryDate: product.lots[0]?.expiryDate
        ? product.lots[0].expiryDate.toISOString().slice(0, 10)
        : null,
      barcode: product.barcode,
      packagings: product.packagings.map((p) => ({
        barcode: p.barcode as string,
        factor: p.factor,
        name: p.name,
      })),
      priceTiers,
    };
  });
}

export type PosSaleListItem = Pick<
  SalesDocument,
  | 'id'
  | 'dteType'
  | 'folio'
  | 'netAmount'
  | 'exemptAmount'
  | 'ivaAmount'
  | 'totalAmount'
  | 'paymentMethod'
  | 'status'
  | 'siiStatus'
  | 'createdAt'
> & {
  contact: { rut: string; razonSocial: string };
  items: { id: string; productId: string | null; sku: string | null; description: string; quantity: number; unitPrice: number; total: number }[];
};

export async function listShiftSales(companyId: string, shiftId: string): Promise<PosSaleListItem[]> {
  return prisma.salesDocument.findMany({
    where: { companyId, cashShiftId: shiftId },
    select: {
      id: true,
      dteType: true,
      folio: true,
      netAmount: true,
      exemptAmount: true,
      ivaAmount: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      siiStatus: true,
      createdAt: true,
      contact: { select: { rut: true, razonSocial: true } },
      items: {
        select: {
          id: true,
          productId: true,
          sku: true,
          description: true,
          quantity: true,
          unitPrice: true,
          total: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  });
}

export type PosTicketData = Prisma.SalesDocumentGetPayload<{
  include: { items: true; contact: true; company: true };
}> & {
  timbrePdf417?: string | null;
};

export async function getTicket(companyId: string, documentId: string): Promise<PosTicketData | null> {
  const doc = await prisma.salesDocument.findFirst({
    where: { id: documentId, companyId },
    include: { items: true, contact: true, company: true },
  });
  if (!doc) return null;
  const timbrePdf417 = doc.tedXml ? tedPdf417DataUri(doc.tedXml) : null;
  return { ...doc, timbrePdf417 };
}

export interface PosCustomerLookupResult {
  id: string;
  rut: string;
  razonSocial: string;
  giro: string | null;
  address: string | null;
  comuna: string | null;
  email: string | null;
  priceListId: string | null;
  priceListName: string | null;
}

/**
 * Busca un cliente existente por RUT desde la caja para autocompletar Razón
 * Social, Giro y Dirección al emitir Factura Electrónica (33) o Boleta nominativa.
 */
export async function lookupPosCustomerByRut(
  companyId: string,
  rawRut: string
): Promise<PosCustomerLookupResult | null> {
  const trimmed = rawRut.trim();
  if (!trimmed || !validateRut(trimmed)) return null;
  const rutClean = cleanRut(trimmed);
  const contact = await prisma.contact.findFirst({
    where: { companyId, rutClean },
    select: {
      id: true,
      rut: true,
      razonSocial: true,
      giro: true,
      address: true,
      comuna: true,
      email: true,
      priceList: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!contact) return null;
  return {
    id: contact.id,
    rut: contact.rut,
    razonSocial: contact.razonSocial,
    giro: contact.giro,
    address: contact.address,
    comuna: contact.comuna,
    email: contact.email,
    priceListId: contact.priceList?.isActive ? contact.priceList.id : null,
    priceListName: contact.priceList?.isActive ? contact.priceList.name : null,
  };
}

/**
 * Anula una venta emitida en el turno actual (si aún no fue enviada al SII),
 * reponiendo stock en bodega y reversando pagos/asientos contables.
 */
export async function cancelPosSale(
  companyId: string,
  shiftId: string,
  documentId: string,
  reason: string
): Promise<SalesDocument> {
  const doc = await prisma.salesDocument.findFirst({
    where: { id: documentId, companyId, cashShiftId: shiftId },
    select: { id: true },
  });
  if (!doc) throw new Error('La venta no pertenece a este turno de caja');
  return cancelSalesDocument(companyId, documentId, reason);
}

/**
 * Emite una Nota de Crédito Electrónica (Tipo 61) desde el POS para devolver
 * total o parcialmente una Boleta o Factura, reponiendo stock en la bodega de
 * la caja y registrando un egreso de caja si se devuelve efectivo del cajón.
 */
export async function createPosCreditNote(
  companyId: string,
  userId: string,
  shiftId: string,
  input: PosCreditNoteInput
): Promise<SalesDocumentWithItems & { timbrePdf417: string | null }> {
  const shift = await prisma.cashShift.findFirst({
    where: { id: shiftId, companyId, status: 'OPEN' },
    include: { cashRegister: true },
  });
  if (!shift) throw new Error('Debes tener un turno de caja abierto para emitir una devolución');

  const original = await prisma.salesDocument.findFirst({
    where: { id: input.originalDocumentId, companyId },
    include: { items: true },
  });
  if (!original) throw new Error('Documento original no encontrado');
  if (original.status !== 'ISSUED' || original.folio === null) {
    throw new Error('Solo se puede emitir Nota de Crédito sobre un documento vigente con folio');
  }

  const creditItems =
    input.items && input.items.length > 0
      ? input.items.map((reqItem) => {
          const origLine = original.items.find((line) => line.productId === reqItem.productId);
          if (!origLine) {
            throw new Error('Uno de los productos seleccionados no pertenece a la venta original');
          }
          return {
            productId: origLine.productId ?? undefined,
            sku: origLine.sku ?? undefined,
            description: origLine.description,
            quantity: reqItem.quantity,
            unitPrice: origLine.unitPrice,
            isExempt: origLine.isExempt,
            discountPercent: origLine.discountPercent,
          };
        })
      : original.items.map((origLine) => ({
          productId: origLine.productId ?? undefined,
          sku: origLine.sku ?? undefined,
          description: origLine.description,
          quantity: origLine.quantity,
          unitPrice: origLine.unitPrice,
          isExempt: origLine.isExempt,
          discountPercent: origLine.discountPercent,
        }));

  const dteLabel = DTE_TYPE_LABELS[original.dteType] ?? original.dteType;
  const creditNote = await createSalesDocument(
    companyId,
    {
      contactId: original.contactId,
      warehouseId: shift.cashRegister.warehouseId,
      dteType: 'NOTA_CREDITO_61',
      paymentMethod: original.paymentMethod as 'EFECTIVO' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA' | 'CREDITO_30',
      referenceType: original.dteType,
      referenceFolio: original.folio,
      notes: `Devolución POS (${dteLabel} #${original.folio}): ${input.reason.trim()}`,
      items: creditItems,
    },
    'ISSUED'
  );

  // Si se devolvió dinero en efectivo desde la gaveta, registramos el egreso
  // en el turno de caja para que el arqueo refleje la salida de billetes.
  if (input.refundCashFromDrawer && creditNote.totalAmount > 0) {
    const refundAmount = roundCashChile(creditNote.totalAmount);
    if (refundAmount > 0) {
      await registerCashMovement(companyId, shiftId, userId, {
        type: 'OUTFLOW',
        amount: refundAmount,
        reason: `Devolución efectivo NC #${creditNote.folio ?? '-'} (Ref. ${dteLabel} #${original.folio}): ${input.reason.trim()}`,
      });
    }
  }

  const timbrePdf417 = creditNote.tedXml ? tedPdf417DataUri(creditNote.tedXml) : null;
  return { ...creditNote, timbrePdf417 };
}
