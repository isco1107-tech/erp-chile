'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Globe, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { getCustomDomainAction, removeCustomDomainAction, setCustomDomainAction } from '@/modules/projects/actions/projects.actions';
import type { CustomDomainView } from '@/modules/projects/services/custom-domain.service';

/**
 * Dominio propio del micrositio (ej. missuniversotemuco.cl). Guardar el
 * dominio lo registra en el servidor (si hay integración con Vercel) y
 * muestra los registros DNS que faltan en el proveedor donde se compró
 * (NIC Chile, GoDaddy, Cloudflare…). Cuando los DNS apuntan bien, el sitio
 * se publica en ese dominio y la dirección de la plataforma redirige a él.
 */
export function CustomDomainSection({ projectId, canWrite, siteEnabled }: { projectId: string; canWrite: boolean; siteEnabled: boolean }) {
  const confirm = useConfirm();
  const [view, setView] = useState<CustomDomainView | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'load' | 'save' | 'check' | 'remove' | null>('load');

  useEffect(() => {
    getCustomDomainAction(projectId).then((result) => {
      if (result.success) {
        setView(result.data);
        setInput(result.data.domain ?? '');
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  }, [projectId]);

  async function save() {
    setBusy('save');
    const result = await setCustomDomainAction(projectId, input);
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    setView(result.data);
    setInput(result.data.domain ?? '');
    toast.success(result.message ?? 'Dominio guardado');
  }

  async function check() {
    setBusy('check');
    const result = await getCustomDomainAction(projectId);
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    setView(result.data);
    if (result.data.verifiedAt) toast.success('El dominio está conectado');
    else toast.info('Todavía no: los DNS pueden tardar desde minutos hasta 24-48 horas en propagarse');
  }

  async function remove() {
    if (!view?.domain) return;
    const ok = await confirm({
      title: `¿Quitar ${view.domain}?`,
      description: 'El sitio vuelve a verse solo en su dirección de la plataforma. Los enlaces con el dominio dejarán de funcionar.',
      confirmLabel: 'Quitar dominio',
    });
    if (!ok) return;
    setBusy('remove');
    const result = await removeCustomDomainAction(projectId);
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    setView(result.data);
    setInput('');
    toast.success(result.message ?? 'Dominio quitado');
  }

  function copy(value: string) {
    void navigator.clipboard.writeText(value).then(() => toast.success('Copiado'));
  }

  const connected = Boolean(view?.verifiedAt);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
            Dominio propio
          </h2>
          <p className="text-xs text-muted-foreground">
            Publica el sitio en un dominio del certamen, por ejemplo missuniversotemuco.cl. Con el dominio conectado, la dirección de la plataforma redirige a él.
          </p>
        </div>
        {view?.domain && (
          <StatusBadge tone={connected ? 'success' : 'warning'}>{connected ? 'Conectado' : 'Pendiente de DNS'}</StatusBadge>
        )}
      </div>

      <div>
        <Label htmlFor="site-domain">Dominio</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="site-domain"
            className="max-w-sm flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="missuniversotemuco.cl"
            autoComplete="off"
            spellCheck={false}
            disabled={!canWrite || busy !== null}
          />
          {canWrite && (
            <Button type="button" size="sm" onClick={() => void save()} disabled={busy !== null || !input.trim() || input.trim() === view?.domain}>
              {busy === 'save' ? 'Guardando…' : view?.domain ? 'Cambiar dominio' : 'Conectar dominio'}
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Sin https:// ni www. El dominio debe estar comprado a nombre del certamen o de la organización.</p>
      </div>

      {view?.domain && (
        <div className="space-y-3">
          {!siteEnabled && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">El sitio está apagado: publícalo arriba para que el dominio muestre algo.</p>}

          {connected ? (
            <a href={`https://${view.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden="true" />
              https://{view.domain}
            </a>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                Entra al panel donde compraste el dominio (NIC Chile, GoDaddy, Cloudflare…) y crea {view.records.length === 1 ? 'este registro DNS' : 'estos registros DNS'}:
              </p>
              {view.records.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.records.map((record) => (
                        <tr key={`${record.type}-${record.name}-${record.value}`} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{record.type}</td>
                          <td className="px-3 py-2 font-mono">{record.name}</td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => copy(record.value)} className="inline-flex items-center gap-1.5 font-mono hover:text-primary" aria-label={`Copiar ${record.value}`}>
                              <span className="break-all">{record.value}</span>
                              <Copy className="size-3.5 shrink-0" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Los DNS ya apuntan bien; falta que el servidor confirme el dominio. Revisa el estado en unos minutos.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Si el panel no acepta &quot;@&quot;, deja el nombre vacío. Los cambios de DNS pueden tardar desde minutos hasta 24-48 horas; el sitio se conecta solo apenas el dominio responde.
              </p>
              {!view.automatic && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  El administrador de la plataforma también debe agregar {view.domain} en Vercel (Project → Settings → Domains), porque la conexión automática no está configurada.
                </p>
              )}
            </div>
          )}

          {view.turnstile === 'manual' && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Para que el formulario de postulación funcione en {view.domain}, agrega el dominio al widget de Turnstile en Cloudflare (Turnstile → el widget → Hostnames).
            </p>
          )}
          {view.statusError && <p className="text-xs text-danger">{view.statusError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void check()} disabled={busy !== null}>
              <RefreshCw className={busy === 'check' ? 'animate-spin' : undefined} aria-hidden="true" />
              {busy === 'check' ? 'Revisando…' : 'Revisar estado'}
            </Button>
            {canWrite && (
              <Button type="button" size="sm" variant="outline" onClick={() => void remove()} disabled={busy !== null}>
                <Trash2 aria-hidden="true" />
                Quitar dominio
              </Button>
            )}
          </div>
        </div>
      )}
      {busy === 'load' && <p className="text-xs text-muted-foreground">Cargando…</p>}
    </section>
  );
}
