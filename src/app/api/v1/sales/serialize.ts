import type { SalesDocument, SalesDocumentItem } from '@prisma/client';

type SaleWithContact = SalesDocument & { contact: { id: string; rut: string; razonSocial: string }; items?: SalesDocumentItem[] };

/**
 * Forma pública de un documento de venta. Campo por campo a propósito: el
 * costo PMP de cada línea, el XML firmado o la llave de idempotencia interna
 * no salen por la API.
 */
export function serializeSale(doc: SaleWithContact) {
  return {
    id: doc.id,
    dteType: doc.dteType,
    folio: doc.folio,
    status: doc.status,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    customer: doc.contact,
    paymentMethod: doc.paymentMethod,
    netAmount: doc.netAmount,
    exemptAmount: doc.exemptAmount,
    ivaAmount: doc.ivaAmount,
    totalAmount: doc.totalAmount,
    paidAmount: doc.paidAmount,
    paymentStatus: doc.paymentStatus,
    stamped: doc.tedXml !== null,
    notes: doc.notes,
    ...(doc.items
      ? {
          items: doc.items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            isExempt: item.isExempt,
            subtotal: item.subtotal,
            iva: item.iva,
            total: item.total,
          })),
        }
      : {}),
  };
}
