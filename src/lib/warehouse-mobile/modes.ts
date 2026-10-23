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
  },
  RETURN: {
    mode: 'RETURN',
    label: 'Devolución de cliente',
    hint: 'Un cliente devolvió productos.',
    movement: 'ADJUSTMENT_IN',
    direction: 'in',
    asksReason: false,
    asksReference: true,
  },
  SURPLUS: {
    mode: 'SURPLUS',
    label: 'Sobrante',
    hint: 'Hay más de lo que dice el sistema.',
    movement: 'ADJUSTMENT_IN',
    direction: 'in',
    asksReason: false,
    asksReference: false,
  },
  WASTE: {
    mode: 'WASTE',
    label: 'Merma o bote',
    hint: 'Se venció, se dañó o se botó.',
    movement: 'ADJUSTMENT_OUT',
    direction: 'out',
    asksReason: true,
    asksReference: false,
  },
  SHORTAGE: {
    mode: 'SHORTAGE',
    label: 'Faltante',
    hint: 'Hay menos de lo que dice el sistema.',
    movement: 'ADJUSTMENT_OUT',
    direction: 'out',
    asksReason: false,
    asksReference: false,
  },
  TRANSFER: {
    mode: 'TRANSFER',
    label: 'Traslado entre bodegas',
    hint: 'Mover productos a otra bodega.',
    movement: 'TRANSFER',
    direction: 'transfer',
    asksReason: false,
    asksReference: false,
  },
};

export const WASTE_REASONS = ['EXPIRED', 'DAMAGED', 'LOST', 'INTERNAL_USE', 'OTHER'] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  EXPIRED: 'Vencido',
  DAMAGED: 'Dañado',
  LOST: 'Perdido o robado',
  INTERNAL_USE: 'Consumo interno',
  OTHER: 'Otro motivo',
};

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
