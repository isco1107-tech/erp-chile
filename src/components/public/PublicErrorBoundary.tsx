'use client';

import { useEffect } from 'react';
import { PublicButton, PublicStatus } from '@/components/public/PublicShell';

/**
 * `error.tsx` compartido por las 6 páginas públicas sin sesión (inscripción de
 * candidata, jurado, portal de auspiciador, entradas, votación, verificación
 * de acreditación). Reutiliza `PublicStatus` en su variante `error` — el mismo
 * primitivo que ya usan `TicketPurchaseClient`/`VotePurchaseClient` para un
 * link inválido — así que un error no controlado se ve como parte del mismo
 * producto en vez de la pantalla genérica de Next.js.
 *
 * El reporte a observabilidad NO se hace acá: el servidor ya capturó esta
 * excepción en `src/instrumentation.ts` (`onRequestError`) con el stack real,
 * antes de que React la enviara al cliente (mismo criterio que
 * `(dashboard)/error.tsx`). El mensaje queda deliberadamente genérico y sin
 * `error.digest` en pantalla: quien ve esto es un visitante externo sin
 * sesión, no alguien del equipo que necesite cruzar el código con un log.
 */
export default function PublicErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <PublicStatus
      variant="error"
      title="Algo salió mal"
      message="Ocurrió un error inesperado. Intenta de nuevo en unos segundos; si el problema persiste, contacta a la organización del evento."
    >
      <PublicButton type="button" onClick={reset}>
        Reintentar
      </PublicButton>
    </PublicStatus>
  );
}
