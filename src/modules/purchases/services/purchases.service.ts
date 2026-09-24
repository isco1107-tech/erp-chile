import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import type {
  Company,
  Contact,
  DocumentStatus,
  Prisma,
  PurchaseDocument,
  PurchaseDocumentItem,
} from '@prisma/client';
import { computeDocument } from '@/modules/sales/calc';
import { applyStockIn, applyStockOut, type TxClient } from '@/modules/inventory/services/stock.service';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import {
  postPurchaseCreditNoteIssued,
  postPurchaseDocumentIssued,
  reversePurchaseDocumentPosting,
} from '@/modules/accounting/posting-rules/purchases-posting';
import { PURCHASE_STOCK_DIRECTION, type PurchaseDocumentCreateInput, type PurchaseDocumentItemInput } from '../schema';
import { QUANTITY_EPSILON } from './goods-receipt.service';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type { WorkflowEventPayload } from '@/lib/workflows/types';

async function resolveDefaultWarehouse(tx: TxClient, companyId: string): Promise<string | undefined> {
  const warehouse =
    (await tx.warehouse.findFirst({ where: { companyId, isDefault: true } })) ??
    (await tx.warehouse.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } }));
  return warehouse?.id;
}

export type PurchaseDocumentWithItems = PurchaseDocument & { items: PurchaseDocumentItem[] };
export type PurchaseDocumentWithRelations = PurchaseDocument & {
  items: PurchaseDocumentItem[];
  contact: Contact;
  company: Company;
  approvedByUser: { name: string; email: string } | null;
};

export async function createPurchaseDocument(
  companyId: string,
  input: PurchaseDocumentCreateInput,
  status: 'DRAFT' | 'ISSUED',
  /**
   * Salta el umbral de aprobación por monto — SOLO para el importador
   * histórico (`commitHistoricalRows`), nunca expuesto a un formulario: un
   * documento que ya ocurrió en la realidad no tiene sentido "aprobar" hoy, y
   * antes se forzaba el estado a ISSUED después de crear el documento vía un
   * segundo paso (`approvePurchaseDocument`) en una transacción separada —
   * si ese segundo paso fallaba (bodega faltante, producto borrado
   * entretanto), el documento de la primera transacción quedaba huérfano en
   * DRAFT/PENDING, sin stock movido, y sin aparecer como "fila fallida" para
   * el usuario. Saltarse el gate acá, dentro de la misma transacción que crea
   * el documento y mueve el stock, elimina ese caso: o se crea completo, o no
   * se crea nada.
   */
  skipApprovalGate = false
): Promise<PurchaseDocumentWithItems> {
  // Igual que en ventas: se emite después de confirmar la transacción, nunca
  // dentro — evita que un correo/webhook de la automatización pueda influir
  // en el resultado de la compra.
  let emittedApprovalPayload: WorkflowEventPayload | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
    if (!contact) throw new Error('Proveedor no encontrado');
    // Sin este chequeo se podía elegir cualquier contacto (incluso uno marcado
    // solo como cliente) como proveedor de una compra — el catálogo de
    // Contactos ya distingue `isCustomer`/`isSupplier` para esto.
    if (!contact.isSupplier) throw new Error('El contacto seleccionado no está marcado como proveedor');

    const { items: computedItems, totals } = computeDocument(
      input.items.map((item) => ({
        ...item,
        unitPrice: item.unitCost,
        quantity: item.quantity,
        isExempt: item.isExempt,
      }))
    );
    const { netAmount, exemptAmount, ivaAmount, totalAmount } = totals;

    // La bodega se valida contra la empresa siempre, no solo al emitir: un
    // borrador persiste el FK en sus líneas y no debe poder apuntar a la bodega
    // de otro tenant.
    let receptionWarehouseId = input.warehouseId;
    if (receptionWarehouseId) {
      const warehouse = await tx.warehouse.findFirst({ where: { id: receptionWarehouseId, companyId } });
      if (!warehouse) throw new Error('Bodega no encontrada');
    } else {
      receptionWarehouseId = await resolveDefaultWarehouse(tx, companyId);
    }

    const direction = PURCHASE_STOCK_DIRECTION[input.documentType];
    const hasProductLines = computedItems.some((item) => item.productId);
    if (direction === 'NONE' && hasProductLines) {
      throw new Error(
        'Una Nota de Débito u "Otro" no mueve inventario: registre estas líneas como gasto, sin enlazar producto'
      );
    }

    // Cada `productId` de línea debe pertenecer a esta empresa — SIEMPRE, sin
    // importar si el documento termina ISSUED o cae a DRAFT/PENDING por
    // superar `purchaseApprovalThreshold`. Antes esta validación vivía solo
    // dentro del bloque de movimiento de stock más abajo (`finalStatus ===
    // 'ISSUED'` en `createPurchaseDocument`), así que un documento que cayera
    // en DRAFT persistía `PurchaseDocumentItem.productId` sin validar contra
    // `companyId` — un id de otra empresa quedaba guardado tal cual, y de ahí
    // se filtraba vía reportes (`dataset.service.ts` incluye `product` sin
    // re-filtrar por tenant). Validar acá, antes de cualquier `create`/`update`,
    // cierra el hueco para los tres estados (ISSUED directo, DRAFT por umbral,
    // DRAFT explícito).
    for (const item of computedItems) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
      if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
    }

    const isCreditNote = input.documentType === 'NOTA_CREDITO';
    const referencedDocument = isCreditNote && input.referenceFolio
      ? await tx.purchaseDocument.findFirst({
          where: { companyId, contactId: input.contactId, folio: input.referenceFolio, status: 'ISSUED' },
          include: { items: true },
        })
      : null;
    if (isCreditNote && !referencedDocument) {
      throw new Error('El documento de compra referenciado no existe, no es de este proveedor o no está emitido');
    }

    // Orden de Compra referenciada: el stock ya se movió al confirmar la
    // Recepción de Mercadería, así que esta factura NO vuelve a tocarlo —
    // solo formaliza y dispara el matching de 3 vías más abajo. Lock antes de
    // leer receivedQuantity/invoicedQuantity: sin él, dos facturas
    // concurrentes contra la misma OC podían leer el mismo acumulado "antes"
    // y ambas pasar el chequeo de matching, sobre-facturando lo recibido —
    // mismo motivo por el que createGoodsReceipt ya toma este lock.
    if (input.purchaseOrderId && status === 'ISSUED') {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${input.purchaseOrderId} AND "companyId" = ${companyId} FOR UPDATE`;
    }
    const purchaseOrder = input.purchaseOrderId
      ? await tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, companyId }, include: { items: true } })
      : null;
    if (input.purchaseOrderId && !purchaseOrder) throw new Error('Orden de compra no encontrada');
    if (purchaseOrder && purchaseOrder.contactId !== input.contactId) {
      throw new Error('Esta orden de compra pertenece a otro proveedor');
    }
    if (purchaseOrder && input.documentType === 'NOTA_CREDITO') {
      throw new Error('Una Nota de Crédito no puede referenciar una Orden de Compra: use "referenceFolio" para corregir la factura original');
    }

    // Jerarquía de aprobación: una compra que supera el umbral configurado no
    // se emite directo — queda como DRAFT/PENDING sin tocar stock/PMP hasta
    // que alguien con `purchases:approve` la revise. Quedan afuera las Notas
    // de Crédito (reducen deuda, no la generan) y las facturas que
    // referencian una OC: ahí el control real es el matching de 3 vías, que
    // ya bloquea el pago si algo no cuadra — duplicar el gate confundiría
    // más de lo que protege, porque el stock de esas facturas ya se movió en
    // la Recepción, sin nada que "diferir" hasta la aprobación.
    let finalStatus: DocumentStatus = status;
    let approvalStatus: 'NOT_REQUIRED' | 'PENDING' = 'NOT_REQUIRED';
    if (status === 'ISSUED' && !isCreditNote && !purchaseOrder && !skipApprovalGate) {
      const settings = await tx.companySettings.findUnique({
        where: { companyId },
        select: { purchaseApprovalThreshold: true },
      });
      if (settings?.purchaseApprovalThreshold != null && totalAmount > settings.purchaseApprovalThreshold) {
        finalStatus = 'DRAFT';
        approvalStatus = 'PENDING';
      }
    }

    // Cuánto ya se devolvió al proveedor contra ese mismo folio por NC previas,
    // para no poder devolver más unidades de las que en verdad se compraron.
    let previouslyCreditedByProduct: Map<string, number> | null = null;
    if (isCreditNote && referencedDocument) {
      const priorCreditNotes = await tx.purchaseDocument.findMany({
        where: { companyId, contactId: input.contactId, documentType: 'NOTA_CREDITO', referenceFolio: referencedDocument.folio, status: 'ISSUED' },
        include: { items: true },
      });
      previouslyCreditedByProduct = new Map();
      for (const priorNote of priorCreditNotes) {
        for (const line of priorNote.items) {
          if (!line.productId) continue;
          previouslyCreditedByProduct.set(line.productId, (previouslyCreditedByProduct.get(line.productId) ?? 0) + line.quantity);
        }
      }
    }

    // Movimiento de mercadería: cada línea enlazada a un producto ajusta stock y
    // PMP. Antes esto no ocurría en absoluto — una compra dejaba el inventario
    // valorizado en $0 pese a haberse pagado y recibido. Se salta por completo
    // cuando la factura referencia una OC: ese movimiento ya ocurrió al
    // confirmar la Recepción de Mercadería, y volver a aplicarlo aquí
    // duplicaría el stock y el PMP.
    if (finalStatus === 'ISSUED' && direction !== 'NONE' && !purchaseOrder) {
      const warehouseId = receptionWarehouseId;
      for (const item of computedItems) {
        if (!item.productId) continue;
        if (!warehouseId) throw new Error('Seleccione una bodega de recepción para las líneas con producto');
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
        if (!product.isTrackable) continue;

        const reference = `Compra ${input.documentType} Folio ${input.folio}`;
        if (direction === 'IN') {
          await applyStockIn(tx, companyId, {
            productId: item.productId,
            warehouseId,
            type: 'PURCHASE_IN',
            quantity: item.quantity,
            unitCost: item.unitCost,
            reference,
          });
        } else {
          if (referencedDocument) {
            const sourceItem = referencedDocument.items.find((candidate) => candidate.productId === item.productId);
            const originalQuantity = sourceItem?.quantity ?? 0;
            const alreadyCredited = previouslyCreditedByProduct?.get(item.productId) ?? 0;
            const remaining = originalQuantity - alreadyCredited;
            if (item.quantity > remaining) {
              throw new Error(
                `No se puede devolver ${item.quantity} unidades de "${item.description}": la compra original tenía ${originalQuantity} y ya se devolvieron ${alreadyCredited} en notas de crédito previas (quedan ${Math.max(0, remaining)} disponibles)`
              );
            }
          }
          await applyStockOut(tx, companyId, {
            productId: item.productId,
            warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity: item.quantity,
            reference,
            notes: 'Devolución al proveedor (Nota de Crédito)',
          });
        }
      }
    }

    // Matching de 3 vías: por cada línea que apunta a una OC, compara la
    // cantidad facturada contra lo recibido-y-no-facturado-todavía de esa
    // línea, y el costo facturado contra el pactado en la OC. Cualquier
    // diferencia marca todo el documento como MISMATCHED — sin tolerancia de
    // precio (es CLP entero, un peso de diferencia ya es una diferencia
    // real), con tolerancia de epsilon solo en cantidad (arrastre de punto
    // flotante entre recepciones/facturas parciales sucesivas).
    let matchStatus: 'NOT_APPLICABLE' | 'MATCHED' | 'MISMATCHED' = 'NOT_APPLICABLE';
    const matchIssues: string[] = [];
    if (purchaseOrder && finalStatus === 'ISSUED') {
      matchStatus = 'MATCHED';
      const orderItemsById = new Map(purchaseOrder.items.map((item) => [item.id, item]));
      for (const item of computedItems) {
        const orderItemId = item.purchaseOrderItemId;
        if (!orderItemId) continue;
        const orderItem = orderItemsById.get(orderItemId);
        if (!orderItem) {
          matchStatus = 'MISMATCHED';
          matchIssues.push(`"${item.description}" no corresponde a ninguna línea de la orden de compra`);
          continue;
        }
        if (item.productId !== orderItem.productId) {
          matchStatus = 'MISMATCHED';
          matchIssues.push(`"${item.description}": el producto facturado no es el mismo que el de la línea de la OC`);
          continue;
        }
        const availableToInvoice = orderItem.receivedQuantity - orderItem.invoicedQuantity;
        if (item.quantity > availableToInvoice + QUANTITY_EPSILON) {
          matchStatus = 'MISMATCHED';
          matchIssues.push(
            `"${item.description}": factura ${item.quantity}, pero solo hay ${availableToInvoice} recibidas y no facturadas`
          );
        }
        if (item.unitCost !== orderItem.unitCost) {
          matchStatus = 'MISMATCHED';
          matchIssues.push(
            `"${item.description}": costo facturado $${item.unitCost} no coincide con el pactado en la OC ($${orderItem.unitCost})`
          );
        }
      }
    }

    const created = await tx.purchaseDocument.create({
      data: {
        companyId,
        contactId: input.contactId,
        documentType: input.documentType,
        folio: input.folio,
        referenceFolio: input.referenceFolio,
        status: finalStatus,
        approvalStatus,
        purchaseOrderId: purchaseOrder?.id,
        matchStatus,
        matchNotes: matchIssues.length > 0 ? matchIssues.join('; ') : undefined,
        issueDate: new Date(input.issueDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        paymentMethod: input.paymentMethod,
        netAmount,
        exemptAmount,
        ivaAmount,
        totalAmount,
        notes: input.notes,
        items: {
          create: computedItems.map((item) => ({
            companyId,
            productId: item.productId,
            warehouseId: item.productId ? receptionWarehouseId : undefined,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            isExempt: item.isExempt ?? false,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });

    if (approvalStatus === 'PENDING') {
      emittedApprovalPayload = {
        documentId: created.id,
        contactName: contact.razonSocial,
        totalAmount: created.totalAmount,
      };
    }

    // El asiento nace junto con el documento, dentro de la misma transacción.
    // Postea igual aunque la compra referencie una OC (el stock ya se movió
    // en la Recepción): la Factura, no la Recepción, es el hecho contable que
    // genera la deuda con el proveedor.
    if (finalStatus === 'ISSUED') {
      if (isCreditNote && referencedDocument) {
        await postPurchaseCreditNoteIssued(tx, companyId, created, referencedDocument.items);
      } else {
        await postPurchaseDocumentIssued(tx, companyId, created, created.items);
      }
    }

    // Acumula lo facturado en cada línea de OC, aunque haya quedado
    // MISMATCHED: el documento existe y bloqueará el pago hasta resolverse,
    // pero el acumulado debe reflejar la realidad para que la próxima
    // factura contra esta misma OC compare contra el número correcto.
    // `purchaseOrderItemId` viene del cliente sin más validación que la del
    // matching de arriba (que solo decide MATCHED/MISMATCHED, no filtra qué
    // se escribe) — sin `orderId`+`companyId` en el `where`, alguien podía
    // mandar el id de una línea de OC de OTRA empresa y corromper su
    // `invoicedQuantity` desde acá.
    if (purchaseOrder && finalStatus === 'ISSUED') {
      const orderItemIds = new Set(purchaseOrder.items.map((item) => item.id));
      for (const item of computedItems) {
        const orderItemId = item.purchaseOrderItemId;
        if (!orderItemId || !orderItemIds.has(orderItemId)) continue;
        await tx.purchaseOrderItem.updateMany({
          where: { id: orderItemId, orderId: purchaseOrder.id, companyId },
          data: { invoicedQuantity: { increment: item.quantity } },
        });
      }
    }

    // Igual que en Ventas: una NC de proveedor no es su propia cuenta por
    // pagar, es un crédito que se aplica de inmediato contra lo que se le
    // debía por la compra original. Sin esto, Tesorería mostraba la Factura Y
    // la NC como pendientes por separado, duplicando la deuda.
    if (isCreditNote && referencedDocument && finalStatus === 'ISSUED') {
      const pendingOnOriginal = referencedDocument.totalAmount - referencedDocument.paidAmount;
      const creditApplied = Math.min(created.totalAmount, Math.max(0, pendingOnOriginal));
      if (creditApplied > 0) {
        const newPaidAmount = referencedDocument.paidAmount + creditApplied;
        await tx.purchaseDocument.updateMany({
          where: { id: referencedDocument.id, companyId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newPaidAmount >= referencedDocument.totalAmount ? 'PAID' : 'PARTIAL',
          },
        });
      }
      await tx.purchaseDocument.updateMany({
        where: { id: created.id, companyId },
        data: { paidAmount: created.totalAmount, paymentStatus: 'PAID' },
      });
      return { ...created, paidAmount: created.totalAmount, paymentStatus: 'PAID' as const };
    }

    return created;
  }, LOCKING_TX_OPTIONS);

  if (emittedApprovalPayload) {
    void emitWorkflowEvent(companyId, 'PURCHASE_PENDING_APPROVAL', emittedApprovalPayload);
  }

  return result;
}

/**
 * Enriquece con detalle de productos un documento de compra histórico que se
 * importó solo con el total (línea sintética, sin `productId`) — el caso
 * real es "subí la boleta/factura solo con el monto, ahora quiero
 * agregarle el desglose producto/cantidad/precio sin duplicar el
 * documento". Reemplaza las líneas y recalcula neto/IVA/total desde ellas
 * (`computeDocument`, igual que `createPurchaseDocument`), y recién ahí
 * mueve stock/PMP — la primera vez que este documento lo hace.
 *
 * Blindado contra doble aplicación de stock: rechaza si el documento ya
 * tiene alguna línea vinculada a un producto real (ya fue enriquecido antes)
 * o si no está `ISSUED`. No pasa por el umbral de aprobación ni el matching
 * de 3 vías: es exclusivo del importador histórico, nunca alcanzable desde
 * una Orden de Compra (`HISTORICAL_PURCHASE_DOCUMENT_TYPES` no incluye Nota
 * de Crédito/Débito, así que `direction` acá solo puede ser `IN` o `NONE`).
 */
export async function enrichPurchaseDocumentWithItems(
  companyId: string,
  documentId: string,
  items: PurchaseDocumentItemInput[]
): Promise<PurchaseDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    // Lock: sin él, dos confirmaciones concurrentes de la misma fila (doble
    // clic, dos pestañas) podían pasar ambas el chequeo "sin detalle todavía"
    // y aplicar el movimiento de stock dos veces.
    await tx.$queryRaw`SELECT id FROM "PurchaseDocument" WHERE id = ${documentId} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.purchaseDocument.findFirst({ where: { id: documentId, companyId }, include: { items: true } });
    if (!doc) throw new Error('Documento no encontrado');
    if (doc.status !== 'ISSUED') throw new Error('Solo se puede agregar detalle a un documento emitido');
    if (doc.items.some((item) => item.productId)) {
      throw new Error('Este documento ya tiene detalle de productos vinculado — no se puede sobreescribir de nuevo');
    }

    const direction = PURCHASE_STOCK_DIRECTION[doc.documentType];
    // Esta función solo implementa el caso `IN` (Factura/Boleta/Guía — los
    // únicos tipos que llega a producir el importador histórico). Una Nota de
    // Crédito (`direction === 'OUT'`) tiene su propia lógica de aplicar el
    // crédito contra el documento referenciado (`createPurchaseDocument`) que
    // acá NO se replica — sin este rechazo explícito, el match por folio
    // podía encontrar una NC real emitida por el flujo normal (comparte
    // espacio de folios con Factura dentro de `{companyId, contactId}`) y
    // reemplazarle las líneas/totales sin aplicar ningún movimiento de stock
    // ni la reversión de crédito correspondiente.
    if (direction === 'OUT') {
      throw new Error(
        'Este documento es una Nota de Crédito — el importador histórico no puede agregarle detalle de productos'
      );
    }
    const hasProductLines = items.some((item) => item.productId);
    if (direction === 'NONE' && hasProductLines) {
      throw new Error(
        'Una Nota de Débito u "Otro" no mueve inventario: registre estas líneas como gasto, sin enlazar producto'
      );
    }

    // Si el documento ya tenía un pago registrado, un cambio de monto no
    // trivial al recalcular desde el detalle dejaría `paidAmount` inconsistente
    // con el nuevo `totalAmount` (incluso `paidAmount > totalAmount`) sin que
    // nada lo detecte — el chequeo de tolerancia del importador solo compara
    // contra el neto/total que la MISMA fila reimportada declare, y esa fila
    // puede perfectamente no volver a escribirlo. Se bloquea para revisión
    // humana en vez de dejarlo pasar en silencio, mismo criterio que ya usa
    // el resto del importador para el detalle de productos.
    const { items: computedItems, totals } = computeDocument(
      items.map((item) => ({ ...item, unitPrice: item.unitCost, quantity: item.quantity, isExempt: item.isExempt }))
    );
    const { netAmount, exemptAmount, ivaAmount, totalAmount } = totals;

    if (doc.paidAmount > 0) {
      const tolerance = Math.max(50, Math.round(doc.totalAmount * 0.02));
      if (Math.abs(totalAmount - doc.totalAmount) > tolerance) {
        throw new Error(
          `Este documento ya tiene un pago registrado (${formatCurrency(doc.paidAmount)}) pero el total recalculado desde el detalle (${formatCurrency(totalAmount)}) difiere demasiado del anterior (${formatCurrency(doc.totalAmount)}). Revisa el detalle antes de confirmar.`
        );
      }
    }

    const warehouseId = await resolveDefaultWarehouse(tx, companyId);
    if (hasProductLines && !warehouseId) {
      throw new Error('La empresa no tiene ninguna bodega creada; no se puede recibir mercadería');
    }

    await tx.purchaseDocumentItem.deleteMany({ where: { documentId: doc.id, companyId } });

    const updated = await tx.purchaseDocument.update({
      where: { id: doc.id },
      data: {
        netAmount,
        exemptAmount,
        ivaAmount,
        totalAmount,
        items: {
          create: computedItems.map((item) => ({
            companyId,
            productId: item.productId,
            warehouseId: item.productId ? warehouseId : undefined,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            isExempt: item.isExempt ?? false,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });

    // El documento ya posteó un asiento al crearse (línea sintética, sin
    // producto → contra GASTOS_OPERACIONALES). Ahora que tiene detalle real y
    // mueve stock, ese asiento quedó mal clasificado — se reversa y se postea
    // de nuevo con el detalle correcto, en vez de dejar ambos asientos
    // sumando la deuda con el proveedor dos veces.
    await reversePurchaseDocumentPosting(tx, companyId, doc.id, 'Detalle de productos agregado: re-posteo con costeo correcto');

    if (direction === 'IN') {
      for (const item of computedItems) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product || !product.isTrackable) continue;
        await applyStockIn(tx, companyId, {
          productId: item.productId,
          warehouseId: warehouseId!,
          type: 'PURCHASE_IN',
          quantity: item.quantity,
          unitCost: item.unitCost,
          reference: `Detalle agregado: Compra ${doc.documentType} Folio ${doc.folio}`,
        });
      }
    }

    await postPurchaseDocumentIssued(tx, companyId, updated, updated.items);

    return updated;
  }, LOCKING_TX_OPTIONS);
}

/**
 * Edita un documento de compra mientras siga en DRAFT. Antes de esto un
 * borrador era un callejón sin salida: sin ruta de edición, la única forma de
 * corregir algo era cancelarlo (si no había recibido mercadería) y crear uno
 * nuevo. Reemplaza los ítems por completo (no hay parche parcial) y recalcula
 * los totales — sin efectos de stock/PMP, porque el documento sigue sin
 * emitirse.
 */
export async function updatePurchaseDocument(
  companyId: string,
  id: string,
  input: PurchaseDocumentCreateInput
): Promise<PurchaseDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseDocument.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Documento no encontrado');
    if (existing.status !== 'DRAFT') throw new Error('Solo se pueden editar documentos en borrador');

    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
    if (!contact) throw new Error('Proveedor no encontrado');
    if (!contact.isSupplier) throw new Error('El contacto seleccionado no está marcado como proveedor');

    const { items: computedItems, totals } = computeDocument(
      input.items.map((item) => ({
        ...item,
        unitPrice: item.unitCost,
        quantity: item.quantity,
        isExempt: item.isExempt,
      }))
    );
    const { netAmount, exemptAmount, ivaAmount, totalAmount } = totals;

    let receptionWarehouseId = input.warehouseId;
    if (receptionWarehouseId) {
      const warehouse = await tx.warehouse.findFirst({ where: { id: receptionWarehouseId, companyId } });
      if (!warehouse) throw new Error('Bodega no encontrada');
    } else {
      receptionWarehouseId = await resolveDefaultWarehouse(tx, companyId);
    }

    const direction = PURCHASE_STOCK_DIRECTION[input.documentType];
    const hasProductLines = computedItems.some((item) => item.productId);
    if (direction === 'NONE' && hasProductLines) {
      throw new Error(
        'Una Nota de Débito u "Otro" no mueve inventario: registre estas líneas como gasto, sin enlazar producto'
      );
    }

    // Cada `productId` de línea debe pertenecer a esta empresa — SIEMPRE, sin
    // importar si el documento termina ISSUED o cae a DRAFT/PENDING por
    // superar `purchaseApprovalThreshold`. Antes esta validación vivía solo
    // dentro del bloque de movimiento de stock más abajo (`finalStatus ===
    // 'ISSUED'` en `createPurchaseDocument`), así que un documento que cayera
    // en DRAFT persistía `PurchaseDocumentItem.productId` sin validar contra
    // `companyId` — un id de otra empresa quedaba guardado tal cual, y de ahí
    // se filtraba vía reportes (`dataset.service.ts` incluye `product` sin
    // re-filtrar por tenant). Validar acá, antes de cualquier `create`/`update`,
    // cierra el hueco para los tres estados (ISSUED directo, DRAFT por umbral,
    // DRAFT explícito).
    for (const item of computedItems) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
      if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
    }

    // Reemplazo completo de ítems: más simple y menos propenso a error que un
    // diff línea por línea, y no hay stock/PMP que reconciliar todavía porque
    // el documento sigue en DRAFT.
    await tx.purchaseDocumentItem.deleteMany({ where: { documentId: id, companyId } });

    return tx.purchaseDocument.update({
      where: { id },
      data: {
        contactId: input.contactId,
        documentType: input.documentType,
        folio: input.folio,
        referenceFolio: input.referenceFolio,
        purchaseOrderId: input.purchaseOrderId,
        issueDate: new Date(input.issueDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        paymentMethod: input.paymentMethod,
        netAmount,
        exemptAmount,
        ivaAmount,
        totalAmount,
        notes: input.notes,
        items: {
          create: computedItems.map((item) => ({
            companyId,
            productId: item.productId,
            warehouseId: item.productId ? receptionWarehouseId : undefined,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            isExempt: item.isExempt ?? false,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });
  }, LOCKING_TX_OPTIONS);
}

/**
 * Emite un documento que quedó guardado como DRAFT (no por haber superado el
 * umbral de aprobación — ese caso ya lo resuelve `approvePurchaseDocument` —
 * sino porque el usuario eligió "Guardar Borrador" al crearlo). Aplica
 * exactamente los mismos efectos que `createPurchaseDocument` aplicaría si se
 * hubiera emitido directo: movimiento de stock/PMP y aplicación de crédito si
 * es una Nota de Crédito.
 *
 * NO soporta documentos que referencian una Orden de Compra: el matching de 3
 * vías necesita, por ítem, a qué línea de la OC corresponde
 * (`purchaseOrderItemId`), y ese dato solo vive en el input del formulario al
 * crear el documento — nunca se persiste en `PurchaseDocumentItem`. Un
 * documento así debe emitirse directo al crearlo; si se guardó como DRAFT
 * pese a tener `purchaseOrderId`, esta función lo rechaza explícitamente en
 * vez de intentar un matching con datos que ya no existen.
 *
 * Es lógica deliberadamente espejada (no compartida) con
 * `createPurchaseDocument`: acá se opera sobre ítems YA PERSISTIDOS de un
 * documento existente, allá sobre ítems recién computados de un input nuevo.
 * Cualquier cambio a las reglas de emisión debe replicarse en ambos lugares.
 */
export async function issuePurchaseDocument(companyId: string, id: string): Promise<PurchaseDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    // Lock: sin él, dos clics de "Emitir" concurrentes sobre el mismo borrador
    // podían aplicar el movimiento de stock dos veces.
    await tx.$queryRaw`SELECT id FROM "PurchaseDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.purchaseDocument.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!doc) throw new Error('Documento no encontrado');
    if (doc.status !== 'DRAFT') throw new Error('Solo se pueden emitir documentos en borrador');
    if (doc.approvalStatus === 'PENDING') {
      throw new Error('Este documento está pendiente de aprobación: debe aprobarse o rechazarse desde esa cola, no emitirse directamente');
    }

    const isCreditNote = doc.documentType === 'NOTA_CREDITO';
    const direction = PURCHASE_STOCK_DIRECTION[doc.documentType];

    // El matching de 3 vías necesita, por cada ítem, a qué línea de la OC
    // corresponde (`purchaseOrderItemId`) — ese dato solo existe en el input
    // del formulario al crear el documento, nunca se persiste en
    // `PurchaseDocumentItem`. Un documento ligado a una OC que se guardó como
    // borrador perdió esa información y no se puede re-matchear después, así
    // que ese caso queda fuera de esta ruta: debe emitirse directo al crearlo.
    if (doc.purchaseOrderId) {
      throw new Error(
        'Este documento referencia una Orden de Compra: debe emitirse directo al crearlo, no se puede guardar como borrador y emitir después'
      );
    }

    // Mismo umbral que al crear directo ISSUED: la configuración pudo cambiar
    // desde que se guardó el borrador.
    if (!isCreditNote) {
      const settings = await tx.companySettings.findUnique({
        where: { companyId },
        select: { purchaseApprovalThreshold: true },
      });
      if (settings?.purchaseApprovalThreshold != null && doc.totalAmount > settings.purchaseApprovalThreshold) {
        await tx.purchaseDocument.updateMany({ where: { id, companyId }, data: { approvalStatus: 'PENDING' } });
        return tx.purchaseDocument.findFirstOrThrow({ where: { id, companyId }, include: { items: true } });
      }
    }

    const referencedDocument =
      isCreditNote && doc.referenceFolio
        ? await tx.purchaseDocument.findFirst({
            where: { companyId, contactId: doc.contactId, folio: doc.referenceFolio, status: 'ISSUED' },
            include: { items: true },
          })
        : null;
    if (isCreditNote && !referencedDocument) {
      throw new Error('El documento de compra referenciado no existe, no es de este proveedor o no está emitido');
    }

    let previouslyCreditedByProduct: Map<string, number> | null = null;
    if (isCreditNote && referencedDocument) {
      const priorCreditNotes = await tx.purchaseDocument.findMany({
        where: {
          companyId,
          contactId: doc.contactId,
          documentType: 'NOTA_CREDITO',
          referenceFolio: referencedDocument.folio,
          status: 'ISSUED',
          NOT: { id: doc.id },
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
    }

    if (direction !== 'NONE') {
      for (const item of doc.items) {
        if (!item.productId) continue;
        if (!item.warehouseId) throw new Error(`Falta la bodega de recepción para "${item.description}"`);
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
        if (!product.isTrackable) continue;

        const reference = `Compra ${doc.documentType} Folio ${doc.folio}`;
        if (direction === 'IN') {
          await applyStockIn(tx, companyId, {
            productId: item.productId,
            warehouseId: item.warehouseId,
            type: 'PURCHASE_IN',
            quantity: item.quantity,
            unitCost: item.unitCost,
            reference,
          });
        } else {
          if (referencedDocument) {
            const sourceItem = referencedDocument.items.find((candidate) => candidate.productId === item.productId);
            const originalQuantity = sourceItem?.quantity ?? 0;
            const alreadyCredited = previouslyCreditedByProduct?.get(item.productId) ?? 0;
            const remaining = originalQuantity - alreadyCredited;
            if (item.quantity > remaining) {
              throw new Error(
                `No se puede devolver ${item.quantity} unidades de "${item.description}": la compra original tenía ${originalQuantity} y ya se devolvieron ${alreadyCredited} en notas de crédito previas (quedan ${Math.max(0, remaining)} disponibles)`
              );
            }
          }
          await applyStockOut(tx, companyId, {
            productId: item.productId,
            warehouseId: item.warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity: item.quantity,
            reference,
            notes: 'Devolución al proveedor (Nota de Crédito)',
          });
        }
      }
    }

    // Sin OC vinculada (validado arriba), no hay matching de 3 vías que
    // aplicar: `matchStatus` se queda en su valor de creación (NOT_APPLICABLE).
    await tx.purchaseDocument.updateMany({
      where: { id, companyId },
      data: { status: 'ISSUED', approvalStatus: 'NOT_REQUIRED' },
    });

    if (isCreditNote && referencedDocument) {
      await postPurchaseCreditNoteIssued(tx, companyId, doc, referencedDocument.items);
    } else {
      await postPurchaseDocumentIssued(tx, companyId, doc, doc.items);
    }

    if (isCreditNote && referencedDocument) {
      const pendingOnOriginal = referencedDocument.totalAmount - referencedDocument.paidAmount;
      const creditApplied = Math.min(doc.totalAmount, Math.max(0, pendingOnOriginal));
      if (creditApplied > 0) {
        const newPaidAmount = referencedDocument.paidAmount + creditApplied;
        await tx.purchaseDocument.updateMany({
          where: { id: referencedDocument.id, companyId },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus: newPaidAmount >= referencedDocument.totalAmount ? 'PAID' : 'PARTIAL',
          },
        });
      }
      await tx.purchaseDocument.updateMany({
        where: { id, companyId },
        data: { paidAmount: doc.totalAmount, paymentStatus: 'PAID' },
      });
    }

    return tx.purchaseDocument.findFirstOrThrow({ where: { id, companyId }, include: { items: true } });
  }, LOCKING_TX_OPTIONS);
}

/**
 * Fuerza el pago de una factura con matching MISMATCHED — la única salida
 * cuando la diferencia es real y explicable (ej. el proveedor cobró un flete
 * que no estaba en la OC) y no un error de digitación a corregir. Queda
 * registrada como `OVERRIDDEN`, nunca vuelve a `MATCHED`: el desacuerdo
 * ocurrió, esto no lo borra, solo autoriza a pagar igual.
 */
export async function overridePurchaseMatch(
  companyId: string,
  id: string,
  overriddenByUserId: string,
  notes: string | undefined
): Promise<PurchaseDocument> {
  const doc = await prisma.purchaseDocument.findFirst({ where: { id, companyId } });
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.matchStatus !== 'MISMATCHED') throw new Error('Este documento no tiene una diferencia pendiente de forzar');

  const result = await prisma.purchaseDocument.updateMany({
    where: { id, companyId, matchStatus: 'MISMATCHED' },
    data: {
      matchStatus: 'OVERRIDDEN',
      matchOverriddenByUserId: overriddenByUserId,
      matchOverriddenAt: new Date(),
      matchNotes: notes ?? doc.matchNotes,
    },
  });
  if (result.count === 0) throw new Error('Este documento no tiene una diferencia pendiente de forzar');
  return prisma.purchaseDocument.findFirstOrThrow({ where: { id, companyId } });
}

/**
 * Aprueba una compra pendiente: recién acá se aplican los efectos de stock/PMP
 * que `createPurchaseDocument` ya aplicaría de inmediato si no hubiera
 * superado el umbral. Usa las líneas YA PERSISTIDAS (cantidad, costo, bodega)
 * en vez de recalcular nada — se aprueba exactamente lo que se envió a
 * revisión, no una versión recién recalculada.
 */
export async function approvePurchaseDocument(
  companyId: string,
  id: string,
  approverId: string
): Promise<PurchaseDocumentWithItems> {
  return prisma.$transaction(async (tx) => {
    // Lock: sin él, dos aprobaciones concurrentes del mismo documento (doble
    // clic, dos gerentes a la vez) podían pasar ambas el chequeo de estado y
    // aplicar el movimiento de stock dos veces.
    await tx.$queryRaw`SELECT id FROM "PurchaseDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.purchaseDocument.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!doc) throw new Error('Documento no encontrado');
    if (doc.approvalStatus !== 'PENDING') throw new Error('Este documento no está pendiente de aprobación');
    // Un documento anulado mientras esperaba aprobación puede seguir marcado
    // PENDING (datos anteriores a que la anulación lo limpiara). Aprobarlo lo
    // revivía como ISSUED y volvía a mover stock y PMP (N-08).
    if (doc.status === 'CANCELLED') throw new Error('Este documento fue anulado y ya no se puede aprobar');

    const direction = PURCHASE_STOCK_DIRECTION[doc.documentType];
    // `direction === 'OUT'` solo puede darse en Notas de Crédito, que nunca
    // quedan pendientes de aprobación (ver createPurchaseDocument) — así que
    // acá solo hace falta manejar 'IN' (recepción) y 'NONE' (sin efecto).
    if (direction === 'IN') {
      for (const item of doc.items) {
        if (!item.productId) continue;
        if (!item.warehouseId) throw new Error(`Falta la bodega de recepción para "${item.description}"`);
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw new Error(`Producto no encontrado: ${item.description}`);
        if (!product.isTrackable) continue;

        await applyStockIn(tx, companyId, {
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: 'PURCHASE_IN',
          quantity: item.quantity,
          unitCost: item.unitCost,
          reference: `Compra ${doc.documentType} Folio ${doc.folio}`,
        });
      }
    }

    await postPurchaseDocumentIssued(tx, companyId, doc, doc.items, { createdByUserId: approverId });

    await tx.purchaseDocument.updateMany({
      where: { id, companyId },
      data: { status: 'ISSUED', approvalStatus: 'APPROVED', approvedByUserId: approverId, approvedAt: new Date() },
    });
    return tx.purchaseDocument.findFirstOrThrow({ where: { id, companyId }, include: { items: true } });
  }, LOCKING_TX_OPTIONS);
}

/** Rechazar deja el documento como DRAFT con el motivo registrado: quien lo envió puede editarlo y volver a enviarlo. */
export async function rejectPurchaseDocument(
  companyId: string,
  id: string,
  approverId: string,
  notes: string | undefined
): Promise<PurchaseDocument> {
  const doc = await prisma.purchaseDocument.findFirst({ where: { id, companyId } });
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.approvalStatus !== 'PENDING') throw new Error('Este documento no está pendiente de aprobación');

  const result = await prisma.purchaseDocument.updateMany({
    where: { id, companyId, approvalStatus: 'PENDING' },
    data: { approvalStatus: 'REJECTED', approvedByUserId: approverId, approvedAt: new Date(), approvalNotes: notes },
  });
  if (result.count === 0) throw new Error('Este documento no está pendiente de aprobación');
  return prisma.purchaseDocument.findFirstOrThrow({ where: { id, companyId } });
}

export type PendingApprovalItem = PurchaseDocument & { contact: Contact };

export async function listPendingApprovals(companyId: string): Promise<PendingApprovalItem[]> {
  return prisma.purchaseDocument.findMany({
    where: { companyId, approvalStatus: 'PENDING', status: { not: 'CANCELLED' } },
    include: { contact: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}

export async function cancelPurchaseDocument(companyId: string, id: string): Promise<PurchaseDocument> {
  return prisma.$transaction(async (tx) => {
    // Mismo lock que la aprobación: sin él, anular y aprobar a la vez podían
    // cruzarse y dejar un documento anulado con stock recibido.
    await tx.$queryRaw`SELECT id FROM "PurchaseDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const document = await tx.purchaseDocument.findFirst({
      where: { id, companyId },
      include: { items: { select: { productId: true } } },
    });
    if (!document) throw new Error('Documento no encontrado');
    if (document.status === 'CANCELLED') throw new Error('El documento ya se encuentra anulado');
    if (document.paidAmount > 0) throw new Error('No se puede anular un documento con pagos registrados');

    // Anular no revierte el Kardex, y revertir un PMP ya promediado con ventas
    // posteriores no tiene solución exacta. Si la mercadería entró, el camino
    // tributario correcto es la Nota de Crédito del proveedor, que sí descuenta
    // stock. Sin esta guarda, el inventario quedaba inflado de forma permanente
    // mientras el documento figuraba anulado.
    if (document.status === 'ISSUED' && document.items.some((item) => item.productId)) {
      throw new Error(
        'Este documento ya recibió mercadería en bodega. Registre una Nota de Crédito del proveedor para devolverla en vez de anularlo'
      );
    }

    // El único caso ISSUED que llega hasta acá es un documento sin líneas de
    // producto (gasto puro, o una Nota de Crédito sin stock que revertir):
    // si posteó un asiento al emitirse, se reversa acá — nunca se edita ni se
    // borra, solo se reversa, igual que el resto del sistema.
    if (document.status === 'ISSUED') {
      await reversePurchaseDocumentPosting(tx, companyId, document.id, `Anulación compra Folio ${document.folio}`);
    }

    const updated = await tx.purchaseDocument.updateMany({
      where: { id: document.id, companyId },
      // Anulado deja de esperar aprobación: sale de la bandeja de pendientes y
      // nadie puede aprobarlo después (N-08).
      data: {
        status: 'CANCELLED',
        ...(document.approvalStatus === 'PENDING' ? { approvalStatus: 'NOT_REQUIRED' as const } : {}),
      },
    });
    if (updated.count !== 1) throw new Error('No se pudo anular el documento');
    return tx.purchaseDocument.findFirstOrThrow({ where: { id: document.id, companyId } });
  }, LOCKING_TX_OPTIONS);
}

// Igual que en ventas: la fila de la tabla solo pinta RUT y razón social del
// proveedor (ver `PurchaseHistoryClient`), así que el contacto se trae con
// `select` anidado en vez de `include: { contact: true }`.
export type PurchaseDocumentListItem = PurchaseDocument & { contact: Pick<Contact, 'rut' | 'razonSocial'> };

export interface ListPurchaseDocumentsResult {
  items: PurchaseDocumentListItem[];
  total: number;
}

const PURCHASE_DOCUMENTS_DEFAULT_PAGE_SIZE = 25;

export async function listPurchaseDocuments(
  companyId: string,
  options?: { status?: DocumentStatus; query?: string; contactId?: string; page?: number; pageSize?: number }
): Promise<ListPurchaseDocumentsResult> {
  const where: Prisma.PurchaseDocumentWhereInput = { companyId };
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
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : PURCHASE_DOCUMENTS_DEFAULT_PAGE_SIZE;

  const [items, total] = await Promise.all([
    prisma.purchaseDocument.findMany({
      where,
      include: { contact: { select: { rut: true, razonSocial: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseDocument.count({ where }),
  ]);

  return { items, total };
}

export async function getPurchaseDocument(companyId: string, id: string): Promise<PurchaseDocumentWithRelations | null> {
  return prisma.purchaseDocument.findFirst({
    where: { id, companyId },
    include: { items: true, contact: true, company: true, approvedByUser: { select: { name: true, email: true } } },
  });
}
