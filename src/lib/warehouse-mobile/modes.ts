/**
 * Qué puede hacer el bodeguero desde el celular y cómo se traduce al kardex.
 *
 * La app habla en el idioma de la bodega ("llegó mercadería", "se botó"); el
 * ERP habla en tipos de movimiento. Esta tabla es el único puente entre ambos,
 * para que la pantalla, el servidor y el manual digan lo mismo.
 *
 * Las ventas NO están acá a propósito: una salida por venta nace del documento
 * de venta o del POS, nunca de un toque en el celular.
 */

export type MovementKind = 'PURCHASE_IN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER';

export const MOBILE_MODES = ['RECEIVE', 'RETURN', 'SURPLUS', 'WASTE', 'SHORTAGE', 'TRANSFER'] as const;
export type MobileMode = (typeof MOBILE_MODES)[number];

export interface ModeDefinition {
  mode: MobileMode;
  /** Texto del botón de inicio. */
  label: string;
  /** Una línea para el bodeguero. */
  hint: string;
  movement: MovementKind;
  direction: 'in' | 'out' | 'transfer';
  /** Pide un motivo de una lista (merma, faltante). */
  asksReason: boolean;
  /** Pide el documento que respalda la llegada (guía o factura). */
  asksReference: boolean;
  /**
   * Proveedor de quien llega la mercadería: `required` (llegada) obliga a elegirlo cuando la
   * empresa tiene proveedores, `optional` lo deja elegir, `none` no lo pregunta.
   */
  supplier: 'required' | 'optional' | 'none';
  /** Pide una foto del producto en cuestión que queda adjunta al movimiento (merma, daño…). */
  requiresEvidence: boolean;
}

export const MODE_DEFINITIONS: Record<MobileMode, ModeDefinition> = {
  RECEIVE: {
    mode: 'RECEIVE',
    label: 'Llegada de mercadería',
    hint: 'Llegó un pedido o un camión.',
    movement: 'PURCHASE_IN',
    direction: 'in',
    asksReason: false,
    asksReference: true,
    supplier: 'required',
    requiresEvidence: false,
  },
  RETURN: {
    mode: 'RETURN',
    label: 'Devolución de cliente',
    hint: 'Un cliente devolvió productos.',
    movement: 'ADJUSTMENT_IN',
    direction: 'in',
    asksReason: false,
    asksReference: true,
    supplier: 'none',
    requiresEvidence: false,
  },
  SURPLUS: {
    mode: 'SURPLUS',
    label: 'Sobrante',
    hint: 'Hay más de lo que dice el sistema.',
    movement: 'ADJUSTMENT_IN',
    direction: 'in',
    asksReason: false,
    asksReference: false,
    supplier: 'optional',
    requiresEvidence: false,
  },
  WASTE: {
    mode: 'WASTE',
    label: 'Salida o merma',
    hint: 'Se venció, se dañó, se usó para degustar o se perdió.',
    movement: 'ADJUSTMENT_OUT',
    direction: 'out',
    asksReason: true,
    asksReference: false,
    supplier: 'none',
    requiresEvidence: true,
  },
  SHORTAGE: {
    mode: 'SHORTAGE',
    label: 'Faltante',
    hint: 'Hay menos de lo que dice el sistema.',
    movement: 'ADJUSTMENT_OUT',
    direction: 'out',
    asksReason: false,
    asksReference: false,
    supplier: 'none',
    requiresEvidence: false,
  },
  TRANSFER: {
    mode: 'TRANSFER',
    label: 'Traslado entre bodegas',
    hint: 'Mover productos a otra bodega.',
    movement: 'TRANSFER',
    direction: 'transfer',
    asksReason: false,
    asksReference: false,
    supplier: 'none',
    requiresEvidence: false,
  },
};

/**
 * Motivos de una salida de bodega. El orden es el de la lista que ve el bodeguero.
 * Los códigos se guardan en `InventoryMovement.reasonCode` y viajan en la cola del
 * celular: NO se renombran ni se quitan (un teléfono sin señal puede tener
 * operaciones guardadas con un código viejo); solo se agregan.
 */
export const WASTE_REASONS = ['EXPIRED', 'DAMAGED', 'SHRINKAGE', 'TASTING', 'INTERNAL_USE', 'DONATION', 'SUPPLIER_RETURN', 'LOST', 'OTHER'] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  EXPIRED: 'Vencido',
  DAMAGED: 'Mal estado o dañado',
  SHRINKAGE: 'Merma de manipulación o proceso',
  TASTING: 'Degustación o muestra',
  INTERNAL_USE: 'Consumo interno',
  DONATION: 'Donación',
  SUPPLIER_RETURN: 'Devolución al proveedor',
  LOST: 'Pérdida o robo',
  OTHER: 'Otro motivo',
};

/** Una línea para que el bodeguero elija bien entre motivos parecidos. */
export const WASTE_REASON_HINTS: Record<WasteReason, string> = {
  EXPIRED: 'Pasó su fecha de vencimiento.',
  DAMAGED: 'Roto, abollado, mojado, en mal estado.',
  SHRINKAGE: 'Se perdió al manipularlo, fraccionarlo o procesarlo.',
  TASTING: 'Se abrió para probar o se entregó como muestra.',
  INTERNAL_USE: 'Lo usó la propia empresa.',
  DONATION: 'Se regaló o se donó.',
  SUPPLIER_RETURN: 'Se devolvió al proveedor.',
  LOST: 'No aparece o se lo llevaron.',
  OTHER: 'Cuéntalo en el detalle.',
};

/** "Otro motivo" no dice nada por sí solo: obliga a explicarlo. */
export function reasonRequiresNote(reason: WasteReason | null | undefined): boolean {
  return reason === 'OTHER';
}

export function wasteReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return (WASTE_REASON_LABELS as Record<string, string>)[code] ?? null;
}

export function isInboundMode(mode: MobileMode): boolean {
  return MODE_DEFINITIONS[mode].direction === 'in';
}

export function isTransferMode(mode: MobileMode): boolean {
  return MODE_DEFINITIONS[mode].direction === 'transfer';
}

export interface MovementNoteInput {
  mode: MobileMode;
  reason?: WasteReason | null;
  note?: string | null;
  /** Cuándo se hizo en el celular (ISO). Solo se menciona si difiere del envío. */
  capturedAt?: string | null;
  /** Cuándo llegó al servidor. */
  now?: Date;
}

/** Diferencia mínima entre captura y envío para que valga la pena avisarla. */
const LATE_NOTE_AFTER_MS = 10 * 60_000;

/** Máximo del texto libre del bodeguero (el servidor lo vuelve a cortar). */
export const MAX_NOTE_LENGTH = 300;

/**
 * Texto que queda en el kardex. Siempre empieza con "App bodega" para que quien
 * revise el movimiento en el escritorio sepa de dónde vino, y dice la hora de
 * captura cuando el envío se retrasó (sin señal en la bodega).
 */
export function buildMovementNote(input: MovementNoteInput): string {
  const parts = ['App bodega', MODE_DEFINITIONS[input.mode].label];
  if (input.reason) parts.push(WASTE_REASON_LABELS[input.reason]);
  let text = parts.join(' · ');
  const extra = input.note?.trim().slice(0, MAX_NOTE_LENGTH);
  if (extra) text += ` — ${extra}`;

  if (input.capturedAt) {
    const captured = new Date(input.capturedAt);
    const now = input.now ?? new Date();
    if (!Number.isNaN(captured.getTime()) && now.getTime() - captured.getTime() > LATE_NOTE_AFTER_MS) {
      const stamp = captured.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      text += ` (registrado en bodega el ${stamp})`;
    }
  }
  return text;
}
