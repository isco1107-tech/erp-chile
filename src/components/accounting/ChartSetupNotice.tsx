'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { initializeChartOfAccountsAction } from '@/modules/accounting/actions/chart-setup.actions';

/**
 * Aviso para una empresa con Contabilidad encendida pero sin plan de cuentas:
 * sin él no se genera ningún asiento, así que los libros aparecerían vacíos
 * sin explicación.
 */
export function ChartSetupNotice({ canInitialize }: { canInitialize: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function initialize() {
    setBusy(true);
    try {
      const result = await initializeChartOfAccountsAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Plan de cuentas creado');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-warning/30 bg-warning-soft p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card">
        <BookPlus className="size-5 text-warning" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Falta el plan de cuentas</p>
        <p className="text-sm text-muted-foreground">
          La contabilidad está activa, pero sin plan de cuentas no se registra ningún asiento. Al crearlo, cada venta, compra, pago y ajuste de stock se
          contabilizará automáticamente desde ese momento.
        </p>
      </div>
      {canInitialize ? (
        <Button type="button" disabled={busy} onClick={() => void initialize()}>
          {busy ? 'Creando…' : 'Crear plan de cuentas base'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Pídele al Dueño o al Contador que lo cree.</p>
      )}
    </div>
  );
}
