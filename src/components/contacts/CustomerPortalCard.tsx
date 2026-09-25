'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, ExternalLink, Globe, Link2Off, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { createCustomerPortalLinkAction, revokeCustomerPortalLinkAction } from '@/modules/contacts/actions/customer-portal.actions';

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

/**
 * Portal del cliente desde su ficha: genera (o regenera) el enlace sin cuenta
 * donde el cliente ve su estado de cuenta, facturas, pagos y órdenes de
 * servicio. El enlace completo solo se muestra al generarlo.
 */
export default function CustomerPortalCard({ contactId, contactName, phone, active, createdAt }: { contactId: string; contactName: string; phone: string | null; active: boolean; createdAt: Date | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (active && !(await confirm({ title: '¿Generar un enlace nuevo?', description: 'El enlace anterior dejará de funcionar de inmediato.', confirmLabel: 'Generar nuevo' }))) return;
    setBusy(true);
    try {
      const result = await createCustomerPortalLinkAction(contactId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setUrl(result.data.url);
      toast.success(result.message ?? 'Enlace generado');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!(await confirm({ title: '¿Desactivar el portal del cliente?', description: 'El enlace dejará de funcionar. Podrás generar uno nuevo cuando quieras.', confirmLabel: 'Desactivar' }))) return;
    setBusy(true);
    try {
      const result = await revokeCustomerPortalLinkAction(contactId);
      if (!result.success) toast.error(result.error);
      else {
        setUrl(null);
        toast.success(result.message ?? 'Portal desactivado');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar: selecciónalo a mano');
    }
  }

  const digits = (phone ?? '').replace(/\D/g, '');
  const whatsapp = url ? `https://wa.me/${digits.length >= 8 ? digits : ''}?text=${encodeURIComponent(`Hola ${contactName}, aquí puedes ver tu estado de cuenta, facturas y pagos: ${url}`)}` : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
            <Globe className="size-4 text-accent-foreground" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Portal del cliente</h3>
            <p className="text-xs text-muted-foreground">
              {active && createdAt ? `Activo desde el ${formatDate(createdAt)}. ` : 'Sin portal activo. '}
              Un enlace sin contraseña donde el cliente ve su saldo, sus documentos (para descargar), sus pagos y sus órdenes de servicio.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={revoke}>
              <Link2Off className="size-3.5" aria-hidden="true" /> Desactivar
            </Button>
          )}
          <Button type="button" size="sm" variant={active ? 'outline' : 'default'} disabled={busy} onClick={generate}>
            <RefreshCw className="size-3.5" aria-hidden="true" /> {active ? 'Generar enlace nuevo' : 'Activar portal'}
          </Button>
        </div>
      </div>
      {url && (
        <div className="mt-4 space-y-2 rounded-md bg-muted p-3">
          <p className="text-xs font-medium">Comparte este enlace con el cliente (se muestra solo ahora):</p>
          <p className="break-all font-mono text-xs">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="xs" variant="outline" onClick={copy}>
              <Copy aria-hidden="true" /> Copiar
            </Button>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'outline' })}>
                WhatsApp
              </a>
            )}
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'ghost' })}>
              <ExternalLink aria-hidden="true" /> Abrir
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
