'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Globe, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { CopyButton } from '@/components/hosting/DomainPanel';
import { checkDefaultDomainAction, removeDefaultDomainAction, setDefaultDomainAction } from '@/lib/actions/default-domain';
import type { DefaultDomainView } from '@/lib/hosting/default-domain.service';

interface Props {
  initial: DefaultDomainView;
}

type Busy = 'save' | 'check' | 'remove' | null;

const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';

/**
 * Configuración → Perfil de Empresa → Dominio predeterminado. El dominio que la empresa ya
 * compró: cada certamen, sitio web, tienda o academia que cree desde ahora nace en
 * `<dirección>.<dominio>` en vez de la dirección de la plataforma. Un dominio comprado para
 * una página en particular se sigue poniendo en esa página y manda sobre este.
 */
export default function DefaultDomainForm({ initial }: Props) {
  const confirm = useConfirm();
  const [view, setView] = useState<DefaultDomainView>(initial);
  const [input, setInput] = useState(initial.domain ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  // `null` = todavía no se ha revisado el DNS en esta visita.
  const [dnsOk, setDnsOk] = useState<boolean | null>(null);

  const unchanged = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '') === (view.domain ?? '');

  async function save() {
    setBusy('save');
    try {
      const result = await setDefaultDomainAction(input);
      if (!result.success) return void toast.error(result.error);
      setView(result.data);
      setInput(result.data.domain ?? '');
      setDnsOk(null);
      toast.success(result.message ?? 'Dominio guardado');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy('check');
    try {
      const result = await checkDefaultDomainAction();
      if (!result.success) return void toast.error(result.error);
      setDnsOk(result.data.dnsOk);
      if (result.data.dnsOk) toast.success('El DNS ya apunta a la plataforma');
      else toast.info('Todavía no: los DNS pueden tardar desde minutos hasta 24 horas en propagarse');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!view.domain) return;
    const ok = await confirm({
      title: `¿Quitar ${view.domain} como dominio predeterminado?`,
      description: 'Las páginas que ya creaste conservan su dominio. Las nuevas nacerán en la dirección de la plataforma.',
      confirmLabel: 'Quitar dominio',
    });
    if (!ok) return;
    setBusy('remove');
    try {
      const result = await removeDefaultDomainAction();
      if (!result.success) return void toast.error(result.error);
      setView(result.data);
      setInput('');
      setDnsOk(null);
      toast.success(result.message ?? 'Dominio quitado');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby="default-domain-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Globe className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="default-domain-title" className="text-sm font-semibold">Dominio predeterminado de la empresa</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Si ya compraste un dominio, escríbelo aquí y cada certamen, sitio web, tienda o academia que crees desde ahora se publicará en él (por ejemplo {view.example ?? 'mi-pagina.miempresa.cl'}) en vez de en la dirección de la plataforma. Si compras un dominio solo para una página, ponlo en esa página: ese manda sobre este.
            </p>
          </div>
        </div>
        {view.domain && dnsOk !== null && <StatusBadge tone={dnsOk ? 'success' : 'warning'}>{dnsOk ? 'DNS listo' : 'Falta el DNS'}</StatusBadge>}
      </div>

      <div>
        <Label htmlFor="default-domain-input">Dominio</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            id="default-domain-input"
            className="max-w-sm flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && busy === null && input.trim() && !unchanged) {
                e.preventDefault();
                void save();
              }
            }}
            placeholder="miempresa.cl"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            aria-describedby="default-domain-hint"
            disabled={busy !== null}
          />
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy !== null || !input.trim() || unchanged}>
            {busy === 'save' ? 'Guardando…' : 'Guardar dominio'}
          </Button>
        </div>
        <p id="default-domain-hint" className="mt-1 text-xs text-muted-foreground">
          Escríbelo sin https://. Debe estar comprado a nombre de tu empresa. Las páginas que ya existen no cambian de dirección.
        </p>
      </div>

      {view.domain && view.record && (
        <div className="space-y-3">
          <p className="text-sm">
            Entra al panel donde compraste el dominio y crea este registro DNS <strong>una sola vez</strong>; con él cada página nueva queda conectada sin tocar el DNS de nuevo:
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Registro DNS de comodín que debes crear para {view.domain}</caption>
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
                  <th scope="col" className="px-3 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{view.record.type}</td>
                  <td className="px-3 py-2">
                    <CopyButton value={view.record.name} label="nombre" />
                  </td>
                  <td className="px-3 py-2">
                    <CopyButton value={view.record.value} label="valor" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            El asterisco (*) hace que cualquier dirección de tu dominio, como {view.example}, apunte a la plataforma. Los cambios de DNS pueden tardar desde minutos hasta 24 horas.{' '}
            {view.automatic
              ? 'Cada página nueva se registra sola en el servidor de la plataforma.'
              : 'Además, el administrador de la plataforma debe agregar cada página nueva en Vercel (Settings → Domains), porque la conexión automática no está configurada.'}{' '}
            Si tu proveedor no acepta comodines, abre la página y conecta su dominio desde su propio panel de «Dominio propio».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void check()} disabled={busy !== null}>
              <RefreshCw className={busy === 'check' ? 'animate-spin' : undefined} aria-hidden="true" />
              {busy === 'check' ? 'Revisando…' : 'Revisar DNS'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void remove()} disabled={busy !== null}>
              <Trash2 aria-hidden="true" />
              Quitar dominio
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
