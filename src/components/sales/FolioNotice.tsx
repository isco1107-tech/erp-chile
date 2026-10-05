import Link from 'next/link';
import type { DteType } from '@prisma/client';
import { isDte } from '@/lib/chile/dte/codes';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';

interface Props {
  dteType: DteType;
  /** La empresa tiene Facturación Electrónica (folios del SII) contratada. */
  hasDteBilling: boolean;
  /** Quedan folios autorizados por el SII para este tipo de documento. */
  hasFolios: boolean;
  /** Quien mira puede cargar folios (permiso `dte:manage_caf`). */
  canManageFolios: boolean;
  className?: string;
}

/**
 * Avisa ANTES de emitir qué numeración llevará el documento. Sin CAF la emisión
 * sigue funcionando (contador interno), pero el documento no tiene validez
 * ante el SII: quien emite tiene que saberlo antes, no descubrirlo en una
 * fiscalización.
 */
export default function FolioNotice({ dteType, hasDteBilling, hasFolios, canManageFolios, className = '' }: Props) {
  if (!isDte(dteType) || (hasDteBilling && hasFolios)) return null;

  if (!hasDteBilling) {
    return (
      <p role="note" className={`rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className}`}>
        Los documentos de esta empresa son internos: llevan numeración propia y no se envían al SII.
      </p>
    );
  }

  return (
    <div role="alert" className={`rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning ${className}`}>
      <p className="font-medium">Se emitirá con numeración interna, sin validez ante el SII.</p>
      <p className="mt-0.5 text-xs">
        No hay folios autorizados disponibles para {DTE_TYPE_LABELS[dteType as keyof typeof DTE_TYPE_LABELS] ?? 'este documento'}.{' '}
        {canManageFolios ? (
          <>
            Carga un CAF en{' '}
            <Link href="/dashboard/settings/folios" className="font-semibold underline underline-offset-2">
              Configuración → Folios del SII
            </Link>{' '}
            para emitir con folio válido.
          </>
        ) : (
          <>Pídele a quien administra la cuenta que cargue un CAF en Configuración → Folios del SII.</>
        )}
      </p>
    </div>
  );
}
