import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import type {
  Company,
  Contact,
  DocumentStatus,
  DteType,
  Prisma,
  SalesDocument,
  SalesDocumentItem,
  Warehouse,
} from '@prisma/client';
import { applyStockIn, applyStockOut } from '@/modules/inventory/services/stock.service';
import { getContactOutstandingBalance } from '@/modules/treasury/services/treasury.service';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type { WorkflowEventPayload } from '@/lib/workflows/types';
import { postCreditNoteIssued, postSalesDocumentIssued, reverseSalesDocumentPosting } from '@/modules/accounting/posting-rules/sales-posting';
import { reverseDocumentEntries } from '@/modules/accounting/posting-rules/shared';
import { isExemptDocument, siiCode } from '@/lib/chile/dte/codes';
import { assignSalesFolio, stampDocument, type FolioAssignment } from '@/modules/dte/services/stamping.service';
import { computeDocument, exceedsCreditLimit } from '../calc';
import { applyOrderProgress, assertSellerInCompany } from './sales-orders.service';
import { CASH_ELIGIBLE_DTE_TYPES, DTE_TYPE_LABELS, NON_FOLIO_DTE_TYPES, STOCK_AFFECTING_DTE_TYPES } from '../schema';
import type { SalesDocumentCreateInput } from '../schema';

export type SalesDocumentWithItems = SalesDocument & { items: SalesDocumentItem[] };
export type SalesDocumentWithRelations = SalesDocument & {
  items: SalesDocumentItem[];
  contact: Contact;
  warehouse: Warehouse;
  company: Company;
};

/**
 * Busca el documento ISSUED referenciado por tipo+folio (N-02, N-04). Solo
 * `status: 'ISSUED'`: una referencia a un folio anulado o inexistente debe
 * comportarse como "no encontrado", nunca como si aún estuviera vigente —
 * es el mismo criterio que usa tanto la emisión (para decidir si descuenta
 * stock) como la anulación (para decidir si debe reponerlo), de modo que
 * ambas rutas siempre concuerden sobre si el documento movió stock.
 *
 * El filtro por `contactId` NO va en la consulta: solo se exige para
 * Notas de Crédito/Débito, y ahí se valida después de traer el documento
 * para poder distinguir "no existe" de "existe pero es de otro cliente" y
 * dar un mensaje explícito en ese segundo caso (N-04).
 */
async function findIssuedReferencedDocument(
  tx: Prisma.TransactionClient,
  companyId: string,
  referenceType: DteType,
  referenceFolio: number
): Promise<SalesDocumentWithItems | null> {
  return tx.salesDocument.findFirst({
    where: { companyId, dteType: referenceType, folio: referenceFolio, status: 'ISSUED' },
    include: { items: true },
  });
}

/**
 * Decide si un documento, al emitirse, descuenta stock de bodega — el mismo
 * criterio que usa tanto la emisión (`createSalesDocument`) como la
 * anulación (`cancelSalesDocument`) para saber si corresponde reponerlo
 * (N-02): una Factura/Boleta que solo formaliza una Guía de Despacho ya
 * ISSUED no mueve stock propio, porque la mercadería ya salió con la guía.
 */
function documentMovesStockOnIssue(
  dteType: DteType,
  referencedDocument: Pick<SalesDocument, 'dteType'> | null
): boolean {
  const referencesIssuedGuide = referencedDocument?.dteType === 'GUIA_DESPACHO_52';
  return STOCK_AFFECTING_DTE_TYPES.includes(dteType) && !referencesIssuedGuide;
}

export async function createSalesDocument(
  companyId: string,
  input: SalesDocumentCreateInput,
  status: 'DRAFT' | 'ISSUED'
): Promise<SalesDocumentWithItems> {
  // Capturado dentro de la transacción, emitido recién después de que
  // confirme (ver el final de la función): una automatización que envía
  // correo o llama un webhook es I/O externo y no debe poder hacer que la
  // venta haga rollback si falla. Queda en `null` en el camino de
  // idempotencia (documento ya existente) para no disparar el evento dos
  // veces ante un reintento del mismo `idempotencyKey`.
  let emittedSalePayload: WorkflowEventPayload | null = null;

  const result = await prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.salesDocument.findUnique({
        where: { companyId_idempotencyKey: { companyId, idempotencyKey: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) {
        return existing;
      }
    }

    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
    if (!contact) throw new Error('Cliente no encontrado');


    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new Error('Bodega no encontrada');

    const withCost = [];
    for (const item of input.items) {
      let unitCostPMP = 0;
      let isExempt = item.isExempt ?? false;
      if (item.productId) {
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
        unitCostPMP = product.costPricePMP;
        // La condición de exento la fija el catálogo, no el formulario: es un
        // atributo tributario del producto. Antes se tomaba `item.isExempt` del
        // cliente, así que vender un producto exento desde Ventas le cargaba el
        // 19% igual — sobrecobro al cliente y F29 mal declarado. El POS ya lo
        // resolvía así; esta ruta había quedado atrás.
        isExempt = product.isExempt;
      }
      withCost.push({ ...item, isExempt, unitCostPMP });
    }

    const { items: computedItems, totals } = computeDocument(withCost);
    const { netAmount, exemptAmount, ivaAmount, totalAmount } = totals;

    // Una Factura/Boleta Exenta no puede llevar líneas afectas: el propio
    // TipoDTE del SII declara el documento entero como exento de IVA. Sin este
    // chequeo, una línea con un producto no marcado exento en el catálogo
    // calculaba IVA igual, dejando un documento tipo 34/41 con `IVA` > 0 —
    // inconsistente con su propia naturaleza y candidato a rechazo del SII.
    if (isExemptDocument(input.dteType) && netAmount > 0) {
      throw new Error(
        `${DTE_TYPE_LABELS[input.dteType]} no puede incluir líneas afectas a IVA: revisa que todos los productos de esta venta estén marcados como exentos en el catálogo`
      );
    }

    let folio: number | null = null;
    const dteLabel = DTE_TYPE_LABELS[input.dteType];
    const isIssuing = status === 'ISSUED';
    const needsFolio = isIssuing && !NON_FOLIO_DTE_TYPES.includes(input.dteType);
    const isCreditNote = input.dteType === 'NOTA_CREDITO_61';

    // Límite de crédito: solo aplica a ventas a crédito que efectivamente
    // emiten deuda nueva. Una nota de crédito reduce lo que el cliente debe,
    // así que quedaría absurdo bloquearla por "exceder" el límite.
    if (isIssuing && !isCreditNote && input.paymentMethod === 'CREDITO_30' && contact.creditLimit != null) {
      // Lock sobre el cliente: sin él, dos ventas a crédito concurrentes leen
      // la misma deuda vigente antes de que cualquiera haga commit, pasan
      // ambas el chequeo por separado, y sumadas superan el límite igual —
      // el mismo tipo de condición de carrera que el kardex evita con
      // `FOR UPDATE` sobre el producto.
      await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contact.id} AND "companyId" = ${companyId} FOR UPDATE`;
      const outstanding = await getContactOutstandingBalance(companyId, contact.id, tx);
      if (exceedsCreditLimit({ creditLimit: contact.creditLimit, outstandingBalance: outstanding, documentTotal: totalAmount })) {
        const projected = outstanding + totalAmount;
        throw new Error(
          `Venta rechazada: supera el límite de crédito del cliente. Deuda actual ${formatCurrency(outstanding)} + esta venta ${formatCurrency(totalAmount)} = ${formatCurrency(projected)}, límite ${formatCurrency(contact.creditLimit ?? 0)}`
        );
      }
    }

    // El folio por sí solo no identifica al cliente correcto, solo el
    // tipo+número de DTE, así que se resuelve primero por tipo+folio+ISSUED
    // y el cliente se valida después según el caso (N-04):
    //   - Nota de Crédito/Débito: SIEMPRE debe ser del mismo cliente, o
    //     reduciría/aumentaría la deuda del cliente equivocado.
    //   - Factura/Boleta que formaliza una Guía de Despacho: si la guía
    //     encontrada es de OTRO cliente, se rechaza explícitamente en vez de
    //     tratarla como "no encontrada" — de lo contrario `affectsStock`
    //     daría true y la mercadería de esa guía se descontaría una segunda
    //     vez además de lo que ya descontó al emitirse.
    const referencedDocument = input.referenceFolio && input.referenceType
      ? await findIssuedReferencedDocument(tx, companyId, input.referenceType, input.referenceFolio)
      : null;
    const isCreditOrDebitNote = input.dteType === 'NOTA_CREDITO_61' || input.dteType === 'NOTA_DEBITO_56';
    if (isCreditOrDebitNote) {
      if (!referencedDocument || referencedDocument.contactId !== input.contactId) {
        throw new Error('El DTE de referencia no existe, no pertenece al cliente seleccionado, no pertenece a la empresa, o no está emitido');
      }
    } else if (referencedDocument?.dteType === 'GUIA_DESPACHO_52' && referencedDocument.contactId !== input.contactId) {
      throw new Error(
        `La Guía de Despacho #${input.referenceFolio} referenciada pertenece a otro cliente: no se puede formalizar con este documento`
      );
    }

    // Una Factura/Boleta que solo formaliza tributariamente una Guía de
    // Despacho ya emitida no debe volver a descontar stock: la mercadería ya
    // salió físicamente cuando se emitió la guía. Sin esta excepción, el ciclo
    // estándar chileno guía + factura diferida descontaba el mismo despacho
    // dos veces.
    const referencesIssuedGuide = referencedDocument?.dteType === 'GUIA_DESPACHO_52';
    const affectsStock = isIssuing && documentMovesStockOnIssue(input.dteType, referencedDocument);

    // Nota de venta: el documento avanza lo facturado/despachado de sus líneas
    // dentro de esta misma transacción (si la emisión falla, el avance vuelve
    // atrás). Un borrador solo queda vinculado; no avanza nada hasta emitirse.
    let orderSellerId: string | null = null;
    if (input.salesOrderId) {
      const order = await tx.salesOrder.findFirst({
        where: { id: input.salesOrderId, companyId },
        select: { id: true, contactId: true, sellerId: true, folio: true },
      });
      if (!order) throw new Error('Nota de venta no encontrada');
      if (order.contactId !== input.contactId) throw new Error(`La nota de venta #${order.folio} es de otro cliente`);
      orderSellerId = order.sellerId;
      if (isIssuing) {
        await applyOrderProgress(tx, companyId, {
          salesOrderId: order.id,
          contactId: input.contactId,
          dteType: input.dteType,
          formalizesIssuedGuide: referencesIssuedGuide,
          lines: input.items
            .filter((item): item is typeof item & { salesOrderItemId: string } => Boolean(item.salesOrderItemId))
            .map((item) => ({ salesOrderItemId: item.salesOrderItemId, quantity: item.quantity })),
          sign: 1,
        });
      }
    } else if (input.items.some((item) => item.salesOrderItemId)) {
      throw new Error('Las líneas de una nota de venta requieren indicar la nota');
    }

    const sellerId = input.sellerId ?? orderSellerId ?? null;
    if (sellerId) await assertSellerInCompany(tx, companyId, sellerId);

    // Folio: sale de un CAF autorizado por el SII si la empresa tiene folios
    // cargados, y del contador interno si no (ver `assignSalesFolio`). La
    // asignación va DENTRO de esta transacción para que, si la emisión falla
    // más abajo, el folio vuelva atrás y no quede un hueco en la numeración —
    // el SII exige justificar cada folio no utilizado.
    let folioAssignment: FolioAssignment | null = null;
    if (needsFolio) {
      folioAssignment = await assignSalesFolio(tx, companyId, input.dteType);
      folio = folioAssignment.folio;
    }

    // Cuánto ya se acreditó contra el documento original por notas de crédito
    // previas, para no poder devolver más unidades de las que realmente se
    // vendieron acumulando varias NC contra el mismo folio.
    let previouslyCreditedByProduct: Map<string, number> | null = null;
    if (isCreditNote && referencedDocument) {
      const priorCreditNotes = await tx.salesDocument.findMany({
        where: {
          companyId,
          dteType: 'NOTA_CREDITO_61',
          referenceType: referencedDocument.dteType,
          referenceFolio: referencedDocument.folio,
          status: 'ISSUED',
        },
        include: { items: true },
      });
      previouslyCreditedByProduct = new Map();
      for (const priorNote of priorCreditNotes) {
        for (const line of priorNote.items) {
          if (!line.productId) continue;
          previouslyCreditedByProduct.set(line.productId, (previouslyCreditedByProduct.get(line.productId) ?? 0) + line.quantity);
        }
      }

      // Tope monetario contra el documento original: la suma de todas las NC
      // ya emitidas contra este folio más la que se está emitiendo ahora no
      // puede superar el total del original MÁS las Notas de Débito ISSUED
      // que también referencian ese mismo documento — una ND aumenta lo que
      // el cliente debe por el original, así que el techo de lo acreditable
      // sube con ella. Sin este control, una NC de servicio libre (sin
      // `productId`, así que el tope de unidades de arriba no la limita)
      // podía acreditar cualquier monto (N-04).
      const priorDebitNotes = await tx.salesDocument.findMany({
        where: {
          companyId,
          dteType: 'NOTA_DEBITO_56',
          referenceType: referencedDocument.dteType,
          referenceFolio: referencedDocument.folio,
          status: 'ISSUED',
        },
      });
      const totalPreviouslyCredited = priorCreditNotes.reduce((sum, note) => sum + note.totalAmount, 0);
      const totalDebited = priorDebitNotes.reduce((sum, note) => sum + note.totalAmount, 0);
      const creditableCeiling = referencedDocument.totalAmount + totalDebited;
      const totalAfterThisNote = totalPreviouslyCredited + totalAmount;
      if (totalAfterThisNote > creditableCeiling) {
        const remaining = Math.max(0, creditableCeiling - totalPreviouslyCredited);
        throw new Error(
          `Esta Nota de Crédito de ${formatCurrency(totalAmount)} supera lo que queda por acreditar del documento original: ya se emitieron ${formatCurrency(totalPreviouslyCredited)} en notas de crédito previas sobre un total de ${formatCurrency(creditableCeiling)} (original ${formatCurrency(referencedDocument.totalAmount)} + notas de débito ${formatCurrency(totalDebited)}; quedan ${formatCurrency(remaining)} disponibles)`
        );
      }
    }

    // Costo de las unidades que vuelven a bodega por una Nota de Crédito, para
    // el reverso de `COSTO_VENTAS`/`EXISTENCIAS` que postea `postCreditNoteIssued`
    // — mismo costo que `applyStockIn` usa más abajo, capturado acá porque el
    // asiento se emite después de crear el documento.
    const restockedForAccounting: { unitCostPMP: number; quantity: number }[] = [];
    // Costo de venta para la regla contable: solo las líneas que en verdad
    // descontaron Kardex (`isTrackable`), nunca todas las líneas del
    // documento — una línea de servicio o producto no trackeable no tiene
    // `EXISTENCIAS` que descontar.
    const costedItemsForAccounting: { unitCostPMP: number; quantity: number }[] = [];
    // Costo real que devuelve cada movimiento de Kardex (`applyStockOut` lee
    // el PMP bajo lock de fila, así que es el único valor garantizado vigente
    // en el momento de la salida). Se usa para persistir `unitCostPMP` en la
    // línea del documento — igual que ya hace el POS — en vez del PMP leído
    // suelto al principio de la transacción, que puede haber quedado
    // desactualizado si una compra confirmó su propio PMP antes de que esta
    // venta tomara el lock del producto (N-10).
    const costByProduct = new Map<string, number>();

    // Una Nota de Crédito en borrador no devuelve mercadería: su asiento recién
    // nace al emitirse, y mover stock antes dejaba inventario sin respaldo
    // contable (N-01).
    if (affectsStock || (isCreditNote && isIssuing)) {
      const sourceItems = isCreditNote && referencedDocument ? referencedDocument.items : computedItems;
      for (const item of computedItems) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product || !product.isTrackable) continue;

        if (isCreditNote) {
          // Si la línea tiene cantidad <= 0 (Caso B: ajuste de precio / descuento sin devolución física), no movemos stock
          if (item.quantity <= 0) continue;

          // Todas las líneas del original con este producto, no solo la
          // primera; y lo acreditado incluye las líneas anteriores de ESTA
          // misma nota, o repetir el producto en dos líneas duplicaba lo
          // devolvible (N-05).
          const sourceItem = sourceItems.find((candidate) => candidate.productId === item.productId);
          const originalQuantity = sourceItems
            .filter((candidate) => candidate.productId === item.productId)
            .reduce((sum, candidate) => sum + candidate.quantity, 0);
          const alreadyCredited = previouslyCreditedByProduct?.get(item.productId) ?? 0;
          const remaining = originalQuantity - alreadyCredited;
          // Rechazar en vez de recortar en silencio: recortar la cantidad de
          // stock a devolver sin recortar también el monto/IVA del documento
          // dejaba la Nota de Crédito financiera declarando más de lo que en
          // verdad se devolvió a bodega.
          if (item.quantity > remaining) {
            throw new Error(
              `No se puede acreditar ${item.quantity} unidades de "${item.description}": el documento original tenía ${originalQuantity} y ya se acreditaron ${alreadyCredited} en notas de crédito previas (quedan ${Math.max(0, remaining)} disponibles)`
            );
          }
          previouslyCreditedByProduct?.set(item.productId, alreadyCredited + item.quantity);
          const restockUnitCost = sourceItem?.unitCostPMP ?? item.unitCostPMP;
          restockedForAccounting.push({ unitCostPMP: restockUnitCost, quantity: item.quantity });
          await applyStockIn(tx, companyId, {
            productId: item.productId,
            warehouseId: input.warehouseId,
            type: 'ADJUSTMENT_IN',
            quantity: item.quantity,
            unitCost: restockUnitCost,
            reference: `DTE ${dteLabel} Folio #${folio ?? '-'}`,
          });
        } else {
          // El costo contable y el que se persiste en la línea salen del
          // movimiento real (`movement.unitCost`), no del PMP leído antes del
          // lock (N-10): ese PMP pudo quedar obsoleto si una compra confirmó
          // su propio PMP entre la lectura y este `applyStockOut`.
          const movement = await applyStockOut(tx, companyId, {
            productId: item.productId,
            warehouseId: input.warehouseId,
            type: 'SALE_OUT',
            quantity: item.quantity,
            reference: `DTE ${dteLabel} Folio #${folio ?? '-'}`,
          });
          costByProduct.set(item.productId, movement.unitCost);
          costedItemsForAccounting.push({ unitCostPMP: movement.unitCost, quantity: item.quantity });
        }
      }
    }

    // Un documento emitido con forma de pago inmediata (todo menos crédito) se
    // cobra en el acto: sin esto quedaba en UNPAID/paidAmount=0 para siempre
    // hasta que alguien registrara el pago a mano en Tesorería, y mientras
    // tanto `getContactOutstandingBalance` lo contaba como deuda vigente —
    // inflando el saldo real del cliente y disparando el límite de crédito
    // sobre ventas que en realidad ya estaban pagadas. El POS ya hace este
    // mismo auto-cobro al crear (`pos.service.ts`); Ventas no lo hacía.
    const isImmediatePayment = isIssuing && input.paymentMethod !== 'CREDITO_30';

    // Timbrado electrónico. Solo ocurre cuando el folio vino de un CAF: sin
    // folio autorizado no hay nada que timbrar. La fecha se fija acá y se pasa
    // tanto al timbre como al documento para que no puedan discrepar (el TED
    // declara la fecha de emisión y el SII la contrasta con la del documento).
    const issuedAt = new Date();
    let stamped: { tedXml: string; signedXml: string } | null = null;

    if (folio !== null && folioAssignment?.stamping) {
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
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
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
          totals: { netAmount, exemptAmount, ivaAmount, totalAmount },
          references:
            referencedDocument && referencedDocument.folio !== null
              ? [
                  {
                    siiCode: siiCode(referencedDocument.dteType),
                    folio: referencedDocument.folio,
                    issueDate: referencedDocument.issueDate,
                    // 3 = "corrige montos". Es el código correcto para la nota
                    // de crédito parcial, que es el caso habitual; una
                    // anulación total (código 1) requiere que el usuario lo
                    // declare y todavía no hay campo para eso en el formulario.
                    reasonCode: isCreditNote ? 3 : undefined,
                  },
                ]
              : undefined,
          cafBlockXml: folioAssignment.stamping.cafBlockXml,
          privateKeyPem: folioAssignment.stamping.privateKeyPem,
        });
      }
    }

    const created = await tx.salesDocument.create({
      data: {
        companyId,
        contactId: input.contactId,
        warehouseId: input.warehouseId,
        dteType: input.dteType,
        folio,
        status,
        issueDate: issuedAt,
        cafId: folioAssignment?.cafId ?? undefined,
        tedXml: stamped?.tedXml,
        signedXml: stamped?.signedXml,
        // Timbrado pero aún no despachado al SII. `null` cuando el documento
        // no es un DTE (numeración interna): así se distingue "pendiente de
        // envío" de "no corresponde enviar".
        siiStatus: stamped ? 'PENDING' : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        paymentMethod: input.paymentMethod,
        netAmount,
        exemptAmount,
        ivaAmount,
        totalAmount,
        paidAmount: isImmediatePayment ? totalAmount : undefined,
        paymentStatus: isImmediatePayment ? 'PAID' : undefined,
        referenceFolio: input.referenceFolio,
        referenceType: input.referenceType,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        salesOrderId: input.salesOrderId,
        sellerId: sellerId ?? undefined,
        items: {
          create: computedItems.map((item) => ({
            companyId,
            salesOrderItemId: item.salesOrderItemId || undefined,
            productId: item.productId || undefined,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            isExempt: item.isExempt ?? false,
            discountPercent: item.discountPercent ?? 0,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
            unitCostPMP: (item.productId ? costByProduct.get(item.productId) : undefined) ?? item.unitCostPMP,
          })),
        },
      },
      include: { items: true },
    });

    if (isIssuing && input.dteType !== 'COTIZACION') {
      emittedSalePayload = {
        documentId: created.id,
        dteType: input.dteType,
        folio,
        contactId: contact.id,
        contactName: contact.razonSocial,
        totalAmount,
        paymentMethod: input.paymentMethod,
        isDte: stamped !== null,
      };
    }

    // El asiento nace junto con el documento, dentro de esta misma
    // transacción: si falla, la venta no se emite. Las Notas de Crédito
    // postean aparte, más abajo, con su propia regla de reverso.
    if (isIssuing && !isCreditNote) {
      await postSalesDocumentIssued(tx, companyId, created, costedItemsForAccounting, { isImmediatePayment, affectsStock });
    }

    // Espejo de `pos.service.ts`: una venta al contado que nace pagada debe
    // dejar un `Payment` real, o Tesorería (flujo de caja, `getCashFlow`) no
    // ve nunca ese cobro — solo el POS creaba esta fila; esta ruta marcaba
    // `paidAmount`/`paymentStatus` en el propio documento pero no generaba el
    // movimiento de caja correspondiente. Restringido a `CASH_ELIGIBLE_DTE_TYPES`
    // (no basta con excluir la Nota de Crédito): una Guía de Despacho pagada al
    // contado NO debe generar su propio `Payment` porque la Factura que la
    // formaliza después ya registra el cobro real — sin este filtro, el mismo
    // dinero quedaría contado dos veces. Una Cotización tampoco es una venta.
    if (isImmediatePayment && CASH_ELIGIBLE_DTE_TYPES.includes(input.dteType) && input.paymentMethod !== 'CREDITO_30') {
      await tx.payment.create({
        data: {
          companyId,
          type: 'INCOME',
          contactId: input.contactId,
          salesDocumentId: created.id,
          amount: totalAmount,
          paymentMethod: input.paymentMethod,
          notes: `DTE ${dteLabel} Folio #${folio ?? '-'}`,
        },
      });
    }

    // Una Nota de Crédito no es su propia cuenta por cobrar: es un crédito que
    // se aplica de inmediato contra lo que el cliente debía por el documento
    // original. Sin esto, Tesorería mostraba la Factura Y la NC como saldos
    // pendientes por separado — el cliente aparecía debiendo el doble.
    if (isCreditNote && referencedDocument && status === 'ISSUED') {
      await postCreditNoteIssued(tx, companyId, created, restockedForAccounting, {});
      const pendingOnOriginal = referencedDocument.totalAmount - referencedDocument.paidAmount;
      const creditApplied = Math.min(created.totalAmount, Math.max(0, pendingOnOriginal));
      if (creditApplied > 0) {
        const newPaidAmount = referencedDocument.paidAmount + creditApplied;
        await tx.salesDocument.updateMany({
          where: { id: referencedDocument.id, companyId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newPaidAmount >= referencedDocument.totalAmount ? 'PAID' : 'PARTIAL',
          },
        });
      }
      // La NC en sí queda saldada: su efecto ya se aplicó arriba.
      await tx.salesDocument.updateMany({
        where: { id: created.id, companyId },
        data: { paidAmount: created.totalAmount, paymentStatus: 'PAID' },
      });
      return { ...created, paidAmount: created.totalAmount, paymentStatus: 'PAID' as const };
    }

    return created;
  }, LOCKING_TX_OPTIONS);

  if (emittedSalePayload) {
    void emitWorkflowEvent(companyId, 'SALE_ISSUED', emittedSalePayload);
  }

  return result;
}

export async function cancelSalesDocument(companyId: string, id: string, reason?: string): Promise<SalesDocument> {
  let emittedCancelPayload: WorkflowEventPayload | null = null;

  const cancelResult = await prisma.$transaction(async (tx) => {
    // Lock de la fila: dos anulaciones simultáneas (doble clic, dos pestañas)
    // leían ambas ISSUED y reponían stock y revertían pagos dos veces (N-09).
    await tx.$queryRaw`SELECT id FROM "SalesDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const document = await tx.salesDocument.findFirst({
      where: { id, companyId },
      include: { items: true, cashShift: { select: { id: true, status: true, closedAt: true } } },
    });
    if (!document) throw new Error('Documento no encontrado');
    if (document.status !== 'ISSUED') throw new Error('Solo se pueden anular documentos emitidos');

    // El arqueo de un turno cerrado quedó congelado con esta venta dentro. Al
    // anularla, el esperado histórico pasaría a ser falso y el efectivo saldría
    // de un cajón distinto al que lo recibió, sin rastro en ninguno de los dos.
    // Lock del turno antes de mirar su estado (N-07): sin él, un cierre
    // concurrente podía congelar el arqueo con esta venta adentro justo antes de
    // anularla. Mismo orden que el POS y el cierre: turno primero, productos después.
    let shiftStatus = document.cashShift?.status;
    if (document.cashShift) {
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "CashShift" WHERE id = ${document.cashShift.id} AND "companyId" = ${companyId} FOR UPDATE`;
      shiftStatus = (locked[0]?.status as typeof shiftStatus) ?? shiftStatus;
    }
    if (document.cashShift && shiftStatus === 'CLOSED') {
      throw new Error(
        'Esta boleta pertenece a un turno de caja ya cerrado. Emite una Nota de Crédito en vez de anularla, para que la devolución quede registrada en el turno actual'
      );
    }

    const dteLabel = DTE_TYPE_LABELS[document.dteType];
    const cancellationNote = reason
      ? `Anulación (${reason}): DTE ${dteLabel} Folio #${document.folio ?? '-'}`
      : `Anulación DTE ${dteLabel} Folio #${document.folio ?? '-'}`;

    // Recalculado acá, no persistido, para que la anulación sepa si el
    // documento de verdad movió stock en vez de asumirlo solo por su tipo de
    // DTE — antes se reponía SIEMPRE que el tipo fuera `STOCK_AFFECTING_DTE_TYPES`,
    // duplicando el despacho vigente de la guía cuando se anulaba la factura
    // que solo la formalizó (N-02). Usa exactamente el mismo criterio que la
    // emisión (`findIssuedReferencedDocument` + `documentMovesStockOnIssue`):
    // si el folio referenciado ya no está ISSUED (anulado, o nunca existió),
    // se trata igual que "no encontrado" — igual que decidió la emisión en su
    // momento — para que emisión y anulación jamás discrepen sobre si este
    // documento movió stock.
    const referencedDocumentAtCancel = document.referenceFolio && document.referenceType
      ? await findIssuedReferencedDocument(tx, companyId, document.referenceType, document.referenceFolio)
      : null;
    const documentMovedStockOnIssue = documentMovesStockOnIssue(document.dteType, referencedDocumentAtCancel);

    // Devuelve a la nota de venta lo que este documento había facturado o
    // despachado, con el mismo criterio de la emisión (¿formalizaba una guía?).
    if (document.salesOrderId) {
      await applyOrderProgress(tx, companyId, {
        salesOrderId: document.salesOrderId,
        contactId: document.contactId,
        dteType: document.dteType,
        formalizesIssuedGuide: referencedDocumentAtCancel?.dteType === 'GUIA_DESPACHO_52',
        lines: document.items
          .filter((item): item is typeof item & { salesOrderItemId: string } => Boolean(item.salesOrderItemId))
          .map((item) => ({ salesOrderItemId: item.salesOrderItemId, quantity: item.quantity })),
        sign: -1,
      });
    }

    if (documentMovedStockOnIssue) {
      for (const item of document.items) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product || !product.isTrackable) continue;
        await applyStockIn(tx, companyId, {
          productId: item.productId,
          warehouseId: document.warehouseId,
          type: 'ADJUSTMENT_IN',
          quantity: item.quantity,
          unitCost: item.unitCostPMP,
          reference: cancellationNote,
        });
      }
    } else if (document.dteType === 'NOTA_CREDITO_61') {
      // La NC había reingresado stock (applyStockIn) al emitirse solo para las
      // líneas con `quantity > 0` (Caso B, ajuste de precio sin devolución
      // física, no movió nada — mismo criterio que `createSalesDocument`).
      // Anularla debe sacar de bodega únicamente lo que en verdad volvió a
      // entrar.
      for (const item of document.items) {
        if (!item.productId) continue;
        if (item.quantity <= 0) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product || !product.isTrackable) continue;
        await applyStockOut(tx, companyId, {
          productId: item.productId,
          warehouseId: document.warehouseId,
          type: 'ADJUSTMENT_OUT',
          quantity: item.quantity,
          reference: cancellationNote,
        });
      }

      // Y había saldado el documento original: revertir ese crédito también,
      // o la Factura original quedaría marcada como pagada sin que el cliente
      // haya pagado ni exista ya la NC que lo justificaba.
      if (document.referenceFolio && document.referenceType) {
        const referencedDocument = await tx.salesDocument.findFirst({
          where: { companyId, dteType: document.referenceType, folio: document.referenceFolio },
        });
        if (referencedDocument) {
          const revertedPaid = Math.max(0, referencedDocument.paidAmount - document.totalAmount);
          await tx.salesDocument.updateMany({
            where: { id: referencedDocument.id, companyId },
            data: {
              paidAmount: revertedPaid,
              paymentStatus:
                revertedPaid <= 0 ? 'UNPAID' : revertedPaid >= referencedDocument.totalAmount ? 'PAID' : 'PARTIAL',
            },
          });
        }
      }
    }

    // Reversa cualquier `Payment` que este documento haya generado (venta al
    // contado, o un cobro registrado manualmente vía Tesorería): sin esto,
    // anular una venta ya cobrada dejaba el ingreso de caja vivo en
    // `getCashFlow` aunque el documento quedara CANCELLED — Tesorería seguiría
    // contando ese dinero como cobrado para siempre. Se inserta una
    // contrapartida EXPENSE en vez de borrar las filas originales: igual que
    // el resto del sistema (kardex, notas de crédito), el rastro de auditoría
    // nunca se elimina, solo se revierte con un movimiento nuevo.
    const linkedPayments = await tx.payment.findMany({ where: { companyId, salesDocumentId: document.id } });

    // Un cobro posterior registrado en Tesorería (`registerSalesPayment`, para
    // una venta a crédito que se pagó después de emitida) generó su propio
    // asiento `D CAJA/BANCO / H CLIENTES` con `sourceType PAYMENT` y
    // `sourceId` del pago (`treasury-posting.ts`), independiente del asiento
    // de la venta. `reverseSalesDocumentPosting` (más abajo) solo reversa lo
    // que quedó bajo `sourceType SALES_DOCUMENT`, así que ese asiento del
    // cobro seguía vivo tras anular la venta: efectivo contable retenido sin
    // dinero y saldo acreedor de cliente ficticio (N-11). El `Payment` que
    // `createSalesDocument` crea para una venta al contado NO tiene este
    // asiento propio — su efecto de caja ya viaja dentro del asiento
    // SALES_DOCUMENT, que sí se reversa abajo — así que reversar acá para ese
    // pago es un no-op seguro y no duplica el reverso.
    for (const payment of linkedPayments) {
      await reverseDocumentEntries(tx, companyId, 'PAYMENT', payment.id, cancellationNote);
    }

    const netCollected = linkedPayments.reduce((sum, p) => sum + (p.type === 'INCOME' ? p.amount : -p.amount), 0);
    if (netCollected > 0) {
      await tx.payment.create({
        data: {
          companyId,
          type: 'EXPENSE',
          contactId: document.contactId,
          salesDocumentId: document.id,
          amount: netCollected,
          paymentMethod: 'OTRO',
          notes: `Reversa por anulación: ${cancellationNote}`,
        },
      });
    }

    // Reversa cualquier asiento POSTED que este documento haya generado
    // (venta + costo de venta, o el asiento propio de una Nota de Crédito) —
    // nunca se edita ni se borra, solo se reversa, igual que el resto del
    // sistema.
    await reverseSalesDocumentPosting(tx, companyId, document.id, cancellationNote);

    const updated = await tx.salesDocument.updateMany({
      where: { id: document.id, companyId, status: 'ISSUED' },
      data: { status: 'CANCELLED' },
    });
    if (updated.count !== 1) throw new Error('El documento ya no está emitido: puede que otra persona lo haya anulado recién');

    const result = await tx.salesDocument.findFirst({ where: { id: document.id, companyId } });
    if (!result) throw new Error('Documento no encontrado');

    emittedCancelPayload = {
      documentId: result.id,
      dteType: result.dteType,
      folio: result.folio,
      totalAmount: result.totalAmount,
      reason: reason ?? null,
    };

    return result;
  }, LOCKING_TX_OPTIONS);

  if (emittedCancelPayload) {
    void emitWorkflowEvent(companyId, 'SALE_CANCELLED', emittedCancelPayload);
  }

  return cancelResult;
}

export async function duplicateSalesDocument(companyId: string, id: string): Promise<SalesDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.salesDocument.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!original) throw new Error('Documento no encontrado');

    return tx.salesDocument.create({
      data: {
        companyId,
        contactId: original.contactId,
        warehouseId: original.warehouseId,
        dteType: original.dteType,
        status: 'DRAFT',
        paymentMethod: original.paymentMethod,
        netAmount: original.netAmount,
        exemptAmount: original.exemptAmount,
        ivaAmount: original.ivaAmount,
        totalAmount: original.totalAmount,
        notes: original.notes,
        items: {
          create: original.items.map((item) => ({
            companyId,
            productId: item.productId ?? undefined,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            isExempt: item.isExempt,
            discountPercent: item.discountPercent,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
            unitCostPMP: item.unitCostPMP,
          })),
        },
      },
      include: { items: true },
    });
  }, LOCKING_TX_OPTIONS);
}

// El listado de ventas solo pinta RUT y razón social por fila (ver
// `SalesHistoryClient`) — el contacto completo nunca se usa, así que se trae
// con `select` anidado en vez de `include: { contact: true }`.
export type SalesDocumentListItem = SalesDocument & { contact: Pick<Contact, 'rut' | 'razonSocial'> };

export interface ListSalesDocumentsResult {
  items: SalesDocumentListItem[];
  total: number;
}

const SALES_DOCUMENTS_DEFAULT_PAGE_SIZE = 25;

export async function listSalesDocuments(
  companyId: string,
  options?: {
    dteTypes?: DteType[];
    status?: DocumentStatus;
    query?: string;
    contactId?: string;
    page?: number;
    pageSize?: number;
    sortField?: 'issueDate' | 'totalAmount';
    sortDir?: 'asc' | 'desc';
  }
): Promise<ListSalesDocumentsResult> {
  const where: Prisma.SalesDocumentWhereInput = { companyId };
  if (options?.dteTypes && options.dteTypes.length > 0) where.dteType = { in: options.dteTypes };
  if (options?.status) where.status = options.status;
  if (options?.contactId) where.contactId = options.contactId;
  const trimmed = options?.query?.trim();
  if (trimmed) {
    where.contact = {
      OR: [
        { razonSocial: { contains: trimmed, mode: 'insensitive' } },
        { rut: { contains: trimmed, mode: 'insensitive' } },
      ],
    };
  }

  const page = options?.page && options.page > 0 ? options.page : 1;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : SALES_DOCUMENTS_DEFAULT_PAGE_SIZE;

  let orderBy: Prisma.SalesDocumentOrderByWithRelationInput = { createdAt: 'desc' };
  if (options?.sortField === 'issueDate') orderBy = { issueDate: options.sortDir ?? 'desc' };
  else if (options?.sortField === 'totalAmount') orderBy = { totalAmount: options.sortDir ?? 'desc' };

  const [items, total] = await Promise.all([
    prisma.salesDocument.findMany({
      where,
      include: { contact: { select: { rut: true, razonSocial: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesDocument.count({ where }),
  ]);

  return { items, total };
}

export async function getSalesDocument(companyId: string, id: string): Promise<SalesDocumentWithRelations | null> {
  return prisma.salesDocument.findFirst({
    where: { id, companyId },
    include: { items: true, contact: true, warehouse: true, company: true },
  });
}
