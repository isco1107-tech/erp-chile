'use client';

import * as React from 'react';
import { ConfirmDialog } from './alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `true` (por defecto) pinta el botón de confirmar en rojo: acciones que borran, anulan o revocan. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const DESTRUCTIVE_WORDS = /eliminar|anular|revocar|regenerar|desactiv|suspend|vaciar|forzar|cortar|cerrar/i;
const ACTION_VERBS = [
  'Eliminar', 'Anular', 'Emitir', 'Aprobar', 'Regenerar', 'Enviar', 'Marcar', 'Finalizar', 'Reabrir',
  'Forzar', 'Vaciar', 'Cerrar', 'Generar', 'Revocar', 'Desactivar',
];

/**
 * Convierte el texto suelto de un `confirm('…')` heredado en un diálogo con
 * título corto, botón con el verbo de la acción ("Eliminar", "Emitir") y el
 * color correcto (rojo solo si la acción destruye o revoca algo).
 */
export function optionsFromMessage(message: string): ConfirmOptions {
  const verb = ACTION_VERBS.find((candidate) => message.startsWith(`¿${candidate}`));
  const long = message.length > 72;
  return {
    title: long ? '¿Confirmas esta acción?' : message,
    description: long ? message : undefined,
    confirmLabel: verb ?? 'Continuar',
    destructive: DESTRUCTIVE_WORDS.test(message),
  };
}

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Confirmaciones del panel con el diálogo del sistema de diseño, en vez de
 * `window.confirm()` (un popup del sistema operativo, sin marca y que bloquea
 * el hilo). Se monta una vez en el layout del dashboard; cualquier componente
 * cliente hace:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: '¿Anular la venta?', description: '…' }))) return;
 *
 * Misma forma de uso que `confirm()` nativo (devuelve booleano), así migrar
 * un llamado existente es cambiar una línea.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);
  const pendingRef = React.useRef<PendingConfirm | null>(null);
  React.useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const confirm = React.useCallback<ConfirmFn>((input) => {
    const options: ConfirmOptions = typeof input === 'string' ? optionsFromMessage(input) : input;
    return new Promise<boolean>((resolve) => {
      // Si quedó otra confirmación abierta (no debería), se resuelve como cancelada.
      pendingRef.current?.resolve(false);
      setPending({ options, resolve });
    });
  }, []);

  function settle(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={pending?.options.title ?? ''}
        description={pending?.options.description}
        confirmLabel={pending?.options.confirmLabel ?? 'Confirmar'}
        cancelLabel={pending?.options.cancelLabel}
        destructive={pending?.options.destructive ?? true}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Fuera del `ConfirmProvider` (p. ej. una pantalla pública) cae al
 * `window.confirm` nativo: nunca deja una acción sin confirmar.
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  return React.useMemo<ConfirmFn>(
    () =>
      ctx ??
      ((input) => {
        if (typeof input === 'string') return Promise.resolve(window.confirm(input));
        const text = typeof input.description === 'string' ? `${input.title}\n\n${input.description}` : input.title;
        return Promise.resolve(window.confirm(text));
      }),
    [ctx]
  );
}
