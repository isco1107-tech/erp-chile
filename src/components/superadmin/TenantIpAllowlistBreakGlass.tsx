'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { disableTenantIpAllowlistAction } from '@/modules/platform/actions/platform.actions';

/** Válvula de emergencia: solo aparece si el cliente activó la restricción de IP — cubre el caso de que se haya bloqueado a sí mismo. */
export default function TenantIpAllowlistBreakGlass({ companyId, initialEnabled }: { companyId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [disabling, setDisabling] = useState(false);

  if (!enabled) return null;

  async function handleDisable() {
    if (!confirm('¿Desactivar la restricción por IP de esta empresa? Sus administradores podrán volver a entrar desde cualquier IP.')) return;
    setDisabling(true);
    try {
      const result = await disableTenantIpAllowlistAction(companyId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Desactivada');
      setEnabled(false);
    } finally {
      setDisabling(false);
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Esta empresa tiene restricción de acceso por IP activada.</p>
        <p className="text-amber-600/80">Si sus administradores quedaron bloqueados fuera de sus IPs permitidas, puedes desactivarla desde acá.</p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={disabling} onClick={handleDisable}>
        {disabling ? 'Desactivando...' : 'Desactivar restricción'}
      </Button>
    </div>
  );
}
