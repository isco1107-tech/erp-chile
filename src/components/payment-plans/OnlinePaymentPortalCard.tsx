'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  getInstallmentPortalPanelAction,
  regenerateInstallmentPortalAction,
  saveKhipuCredentialAction,
  shareInstallmentPortalAction,
  type InstallmentPortalPanelData,
} from '@/modules/payment-plans/actions/online-payment.actions';

/**
 * Tarjeta "Pago en línea" de Cuotas & Mensualidades: el link del portal
 * público que se comparte con las familias y la conexión con la cuenta de
 * Khipu de la empresa (solo quien tiene `settings:company`, porque decide a
 * qué cuenta llega el dinero).
 */
export default function OnlinePaymentPortalCard() {
  const confirm = useConfirm();
  const [data, setData] = useState<InstallmentPortalPanelData | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInstallmentPortalPanelAction().then((result) => {
      if (result.success) setData(result.data);
      else toast.error(result.error);
    });
  }, []);

  if (!data) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el link y cópialo a mano.');
    }
  }

  async function handleShare() {
    setBusy(true);
    try {
      const result = await shareInstallmentPortalAction();
      if (!result.success) return toast.error(result.error);
      setData((d) => (d ? { ...d, portalUrl: result.data } : d));
      await copy(result.data);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    const ok = await confirm({
      title: 'Regenerar link de pago',
      description: 'El link actual dejará de funcionar y tendrás que enviar el nuevo a las familias. Los pagos ya hechos no se ven afectados.',
      confirmLabel: 'Regenerar',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await regenerateInstallmentPortalAction();
      if (!result.success) return toast.error(result.error);
      setData((d) => (d ? { ...d, portalUrl: result.data } : d));
      toast.success(result.message ?? 'Link regenerado');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveKey(value: string | null) {
    if (value === null) {
      const ok = await confirm({
        title: 'Desconectar Khipu',
        description: 'El portal seguirá mostrando las cuotas, pero ya no se podrá pagar en línea hasta que conectes una cuenta de nuevo.',
        confirmLabel: 'Desconectar',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await saveKhipuCredentialAction({ apiKey: value });
      if (!result.success) return toast.error(result.error);
      setData((d) => (d ? { ...d, khipuConfigured: result.data.khipuConfigured } : d));
      setApiKey('');
      toast.success(result.message ?? 'Guardado');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Pago en línea de cuotas</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Comparte este link con las familias: ingresan el RUT de la candidata, eligen las cuotas y pagan por transferencia vía Khipu. Al
            confirmarse, la cuota queda pagada acá y a quien pagó le llega el comprobante por correo.
          </p>
        </div>
        <StatusBadge tone={data.khipuConfigured ? 'success' : 'warning'}>
          {data.khipuConfigured ? 'Khipu conectado' : 'Khipu sin conectar'}
        </StatusBadge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {data.portalUrl ? (
          <>
            <code className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">{data.portalUrl}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => data.portalUrl && copy(data.portalUrl)}>
              <Copy className="size-3.5" /> Copiar
            </Button>
            <a href={data.portalUrl} target="_blank" rel="noopener" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              <ExternalLink className="size-3.5" /> Abrir
            </a>
            {data.canWrite && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={handleRegenerate}>
                <RefreshCw className="size-3.5" /> Regenerar
              </Button>
            )}
          </>
        ) : data.canWrite ? (
          <Button type="button" size="sm" disabled={busy} onClick={handleShare}>
            <Link2 className="size-3.5" /> Generar link del portal
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no se genera el link del portal.</p>
        )}
      </div>

      {data.canManageCredential && (
        <div className="mt-5 border-t border-border pt-4">
          <Label htmlFor="khipuApiKey">API key de Khipu</Label>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            Está en tu cuenta de cobro de Khipu, en la sección de integración para desarrolladores (API 3.0). Se guarda cifrada y define a qué cuenta llega el dinero.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="khipuApiKey"
              type="password"
              autoComplete="off"
              className="max-w-md"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data.khipuConfigured ? '•••••••• (guardada — escribe para reemplazar)' : 'Pega la API key de tu cuenta de cobro'}
            />
            <Button type="button" size="sm" disabled={busy || apiKey.trim().length === 0} onClick={() => handleSaveKey(apiKey.trim())}>
              Guardar
            </Button>
            {data.khipuConfigured && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => handleSaveKey(null)} className="text-destructive hover:text-destructive">
                Desconectar
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
