import type { DteType, PurchaseDocumentType } from '@prisma/client';

/**
 * Tipos de venta que son hechos tributarios reales para el IVA. Deja fuera
 * `GUIA_DESPACHO_52` y `COTIZACION` a propósito: una guía no declara IVA por
 * sí sola (lo hace la factura diferida que la formaliza), y sumarla aparte
 * duplicaba la venta cuando ambas quedaban `ISSUED` al mismo tiempo.
 */
export const TAXABLE_SALES_DTE_TYPES: DteType[] = [
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'BOLETA_EXENTA_41',
  'NOTA_CREDITO_61',
  'NOTA_DEBITO_56',
];

/** Tipos de compra que son hechos tributarios reales para el crédito fiscal. */
export const TAXABLE_PURCHASE_DOCUMENT_TYPES: PurchaseDocumentType[] = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];

/**
 * Signo tributario de un documento de venta: una Nota de Crédito revierte lo
 * que declaró el documento que referencia, así que sus montos deben restar,
 * no sumar, en cualquier agregación de IVA, neto o margen. Fuente única para
 * el motor F29 (`f29.ts`) y para los reportes (`dataset.service.ts`,
 * `workbook.service.ts`) — antes cada uno lo reinventaba (o lo omitía), y una
 * Nota de Crédito terminaba duplicando la deuda y el IVA declarado en vez de
 * cancelarlos.
 */
export function signForSalesDteType(dteType: DteType | string): 1 | -1 {
  return dteType === 'NOTA_CREDITO_61' ? -1 : 1;
}

/**
 * Signo tributario de un documento de compra: una Nota de Crédito de
 * proveedor resta del crédito fiscal (se devolvió mercadería o se corrigió
 * precio a la baja); una Nota de Débito suma (cobro adicional del proveedor,
 * ej. flete), igual que una Factura.
 */
export function signForPurchaseDocumentType(documentType: PurchaseDocumentType | string): 1 | -1 {
  return documentType === 'NOTA_CREDITO' ? -1 : 1;
}
