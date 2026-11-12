/**
 * Documentos que originan un movimiento de bodega (`InventoryMovement.sourceKind`).
 * Lista cerrada: los códigos se agregan, NUNCA se renombran ni se quitan, porque
 * quedan guardados en la base y la genealogía los lee.
 */
export const MOVEMENT_SOURCE_KINDS = ['SALES_DOCUMENT', 'GOODS_RECEIPT', 'PURCHASE_DOCUMENT', 'PRODUCTION_ORDER', 'INVENTORY_COUNT'] as const;
export type MovementSourceKind = (typeof MOVEMENT_SOURCE_KINDS)[number];

export interface MovementSource {
  kind: MovementSourceKind;
  id: string;
}

export const MOVEMENT_SOURCE_LABELS: Record<MovementSourceKind, string> = {
  SALES_DOCUMENT: 'Documento de venta',
  GOODS_RECEIPT: 'Recepción de mercadería',
  PURCHASE_DOCUMENT: 'Documento de compra',
  PRODUCTION_ORDER: 'Orden de producción',
  INVENTORY_COUNT: 'Toma de inventario',
};

export function isMovementSourceKind(value: unknown): value is MovementSourceKind {
  return typeof value === 'string' && (MOVEMENT_SOURCE_KINDS as readonly string[]).includes(value);
}
