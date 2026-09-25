import { calculateIva } from '@/lib/chile/tax';

/**
 * Estados de una orden de servicio técnico y las transiciones permitidas.
 *
 * Recibido → En diagnóstico → Esperando aprobación (presupuesto enviado) →
 * Aprobado → En reparación → Listo para retiro → Entregado. Un presupuesto
 * rechazado deja el equipo listo para retiro sin reparar. La garantía salta
 * la aprobación (no hay nada que cobrar).
 */
export const SERVICE_STATUSES = ['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  RECEIVED: 'Recibido',
  DIAGNOSING: 'En diagnóstico',
  WAITING_APPROVAL: 'Esperando aprobación',
  APPROVED: 'Presupuesto aprobado',
  IN_REPAIR: 'En reparación',
  READY: 'Listo para retiro',
  DELIVERED: 'Entregado',
  CANCELLED: 'Anulado',
};

const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  RECEIVED: ['DIAGNOSING', 'CANCELLED'],
  DIAGNOSING: ['WAITING_APPROVAL', 'IN_REPAIR', 'READY', 'CANCELLED'],
  WAITING_APPROVAL: ['APPROVED', 'READY', 'DIAGNOSING', 'CANCELLED'],
  // Volver a diagnóstico = revisar el presupuesto (p. ej. aparece otra
  // falla): hay que reenviarlo y el cliente aprueba de nuevo.
  APPROVED: ['IN_REPAIR', 'DIAGNOSING', 'CANCELLED'],
  IN_REPAIR: ['READY', 'DIAGNOSING', 'CANCELLED'],
  READY: ['DELIVERED', 'IN_REPAIR'],
  DELIVERED: [],
  CANCELLED: [],
};

export function allowedTransitions(status: ServiceStatus, options: { warranty: boolean }): ServiceStatus[] {
  const next = TRANSITIONS[status];
  // Sin garantía, no se repara sin presupuesto aprobado.
  if (!options.warranty && status === 'DIAGNOSING') return next.filter((candidate) => candidate !== 'IN_REPAIR');
  return next;
}

export function canTransition(from: ServiceStatus, to: ServiceStatus, options: { warranty: boolean }): boolean {
  return allowedTransitions(from, options).includes(to);
}

/**
 * El presupuesto se edita mientras se diagnostica. Una vez enviado o
 * aprobado queda fijo; en garantía no hay cobro que proteger.
 */
export function canEditEstimate(status: ServiceStatus, warranty: boolean): boolean {
  if (status === 'DELIVERED' || status === 'CANCELLED') return false;
  return warranty || status === 'RECEIVED' || status === 'DIAGNOSING';
}

/** Pasos que ve el cliente en su enlace de seguimiento. */
export const PUBLIC_STEPS: { status: ServiceStatus; label: string }[] = [
  { status: 'RECEIVED', label: 'Recibido' },
  { status: 'DIAGNOSING', label: 'Diagnóstico' },
  { status: 'WAITING_APPROVAL', label: 'Presupuesto' },
  { status: 'IN_REPAIR', label: 'Reparación' },
  { status: 'READY', label: 'Listo para retiro' },
  { status: 'DELIVERED', label: 'Entregado' },
];

/** Índice del paso público alcanzado (APPROVED cuenta como presupuesto listo). */
export function publicStepIndex(status: ServiceStatus): number {
  const mapped: ServiceStatus = status === 'APPROVED' ? 'WAITING_APPROVAL' : status;
  return PUBLIC_STEPS.findIndex((step) => step.status === mapped);
}

export interface EstimateLine {
  quantity: number;
  unitPrice: number;
}

export function estimateTotals(lines: EstimateLine[]): { net: number; iva: number; total: number } {
  const net = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  const iva = calculateIva(net);
  return { net, iva, total: net + iva };
}

/** Días desde que se recibió, para destacar órdenes atrasadas. */
export function daysOpen(receivedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - receivedAt.getTime()) / (24 * 60 * 60 * 1000));
}
