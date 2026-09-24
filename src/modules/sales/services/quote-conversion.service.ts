import 'server-only';

import { prisma } from '@/lib/prisma';
import { DTE_TYPE_LABELS, PAYMENT_METHODS, salesDocumentCreateSchema, type QUOTE_TARGET_DTE_TYPES, type SalesDocumentCreateInput } from '../schema';
import { createSalesDocument, type SalesDocumentWithItems } from './sales.service';

export type QuoteTargetDteType = (typeof QUOTE_TARGET_DTE_TYPES)[number];

/**
 * Convierte una cotización en un BORRADOR del documento elegido, con el mismo
 * cliente, bodega y líneas. Queda en borrador a propósito: precios y exención
 * se recalculan desde el catálogo vigente (la exención nunca se toma de la
 * cotización) y la persona revisa antes de emitir con "Emitir documento".
 * La cotización original no se toca.
 */
export async function convertQuoteToDraft(companyId: string, quoteId: string, target: QuoteTargetDteType): Promise<SalesDocumentWithItems> {
  const quote = await prisma.salesDocument.findFirst({ where: { id: quoteId, companyId }, include: { items: true } });
  if (!quote) throw new Error('La cotización no existe');
  if (quote.dteType !== 'COTIZACION') throw new Error('Solo se pueden convertir cotizaciones');
  if (quote.status === 'CANCELLED') throw new Error('La cotización está anulada');

  const input: SalesDocumentCreateInput = {
    contactId: quote.contactId,
    warehouseId: quote.warehouseId,
    dteType: target,
    // La forma de pago de la cotización se conserva si es una del formulario; si no, crédito.
    paymentMethod: PAYMENT_METHODS.find((method) => method === quote.paymentMethod) ?? 'CREDITO_30',
    dueDate: quote.dueDate ? quote.dueDate.toISOString() : undefined,
    notes: [`Desde ${DTE_TYPE_LABELS.COTIZACION} N° ${quote.folio ?? quote.id.slice(-6)}`, quote.notes].filter(Boolean).join(' — '),
    items: quote.items.map((item) => ({
      productId: item.productId ?? undefined,
      sku: item.sku ?? undefined,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      // Solo cuenta en líneas libres: con producto, `createSalesDocument` usa el catálogo.
      isExempt: item.productId ? undefined : item.isExempt,
      discountPercent: item.discountPercent ?? undefined,
    })),
  };
  const parsed = salesDocumentCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'La cotización tiene datos incompletos');
  return createSalesDocument(companyId, parsed.data, 'DRAFT');
}
