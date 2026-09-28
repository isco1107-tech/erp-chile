'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { switchActiveCompanyAction } from '@/lib/auth/actions/switch-company.actions';

/**
 * La sesión apuntaba a otra empresa y ese acceso se cerró (se quitó la
 * membresía o se apagó Multiempresa): el panel ya muestra la empresa hogar.
 * Se avisa en vez de cambiar en silencio, y "Seguir en…" reemite la sesión
 * para que el aviso no vuelva en cada pantalla.
 */
export function ActiveCompanyLostNotice({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-foreground">
        Ya no tienes acceso a la empresa en la que estabas trabajando. Ahora estás en{' '}
        <span className="font-medium">{companyName}</span>.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await switchActiveCompanyAction(companyId);
            if (!result.success) toast.error(result.error);
          })
        }
      >
        Seguir en {companyName}
      </Button>
    </div>
  );
}
