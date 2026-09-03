import type { ReactNode } from 'react';
import type { DocumentStatus, PaymentStatus, PurchaseApprovalStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { TONE_SOFT_BG, TONE_TEXT, type Tone } from './tone';

export interface StatusBadgeProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
}

/** Pill de estado: fondo soft + texto del color semántico. Primitivo genérico. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONE_SOFT_BG[tone],
        TONE_TEXT[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Mapeos a los estados reales del dominio (enums de `prisma/schema.prisma`),
 * no estados inventados. "Vencido" no está en este archivo porque no es un
 * enum persistido: en Cuentas por Cobrar/Pagar se calcula comparando
 * `dueDate` con la fecha actual — cuando ese módulo tenga su propia UI,
 * usar `<StatusBadge tone="danger">Vencido</StatusBadge>` directamente.
 */
export const DOCUMENT_STATUS_BADGE: Record<DocumentStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  ISSUED: { label: 'Emitido', tone: 'success' },
  CANCELLED: { label: 'Anulado', tone: 'danger' },
};

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Pendiente', tone: 'warning' },
  PARTIAL: { label: 'Parcial', tone: 'info' },
  PAID: { label: 'Pagado', tone: 'success' },
};

export const PURCHASE_APPROVAL_STATUS_BADGE: Record<PurchaseApprovalStatus, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: 'No requiere aprobación', tone: 'neutral' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  APPROVED: { label: 'Aprobado', tone: 'success' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
};

export function DocumentStatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const config = DOCUMENT_STATUS_BADGE[status];
  return (
    <StatusBadge tone={config.tone} className={className}>
      {config.label}
    </StatusBadge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const config = PAYMENT_STATUS_BADGE[status];
  return (
    <StatusBadge tone={config.tone} className={className}>
      {config.label}
    </StatusBadge>
  );
}

export function PurchaseApprovalStatusBadge({ status, className }: { status: PurchaseApprovalStatus; className?: string }) {
  const config = PURCHASE_APPROVAL_STATUS_BADGE[status];
  return (
    <StatusBadge tone={config.tone} className={className}>
      {config.label}
    </StatusBadge>
  );
}
