'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Globe, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import type { DnsRecord } from '@/lib/hosting/vercel-domains';

/**
 * Panel «Dominio propio», común a todo sitio público de la plataforma (sitios
 * web, academia…): guardar el dominio comprado, ver los registros DNS a crear,
 * revisar el estado y quitarlo. Cada pantalla le pasa sus propias acciones de
 * servidor; el mecanismo (Vercel, DNS, unicidad) vive en `domain-lifecycle.ts`.
 */

export interface DomainPanelView {
  domain: string | null;
  verifiedAt: string | null;
  automatic: boolean;
  records: DnsRecord[];
  dnsOk: boolean;
  statusError: string | null;
}

type Result<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export interface DomainPanelProps {
  /** Prefijo para los `id` de los campos (único en la página). */
  idPrefix: string;
  /** Solo quien publica (dueño y administradores) puede cambiar el dominio. */
  canPublish: boolean;
  /** Dominio guardado al abrir la pantalla; se refresca al montar con el estado real. */
  initialDomain: string | null;
  /** Dirección pública del sitio en la plataforma (donde se ve mientras no haya dominio propio). */
  platformUrl: string;
  /** Ejemplo para el campo, p. ej. «miacademia.cl». */
  example?: string;
  load: () => Promise<Result<DomainPanelView>>;
  save: (domain: string) => Promise<Result<DomainPanelView>>;
  remove: () => Promise<Result<DomainPanelView>>;
}

type Busy = 'load' | 'save' | 'check' | 'remove' | null;

const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Copiado');
  } catch {
    toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyToClipboard(value)}
      className="inline-flex items-center gap-1.5 rounded font-mono outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`Copiar ${label}: ${value}`}
    >
      <span className="break-all">{value}</span>
      <Copy className="size-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}

export default function DomainPanel({ idPrefix, canPublish, initialDomain, platformUrl, example = 'minegocio.cl', load, save: saveDomain, remove: removeDomain }: DomainPanelProps) {
  const confirm = useConfirm();
  const [view, setView] = useState<DomainPanelView | null>(null);
  const [input, setInput] = useState(initialDomain ?? '');
  const [busy, setBusy] = useState<Busy>('load');

  useEffect(() => {
    // Consultar el estado puede registrar el dominio en el servidor y marcarlo
    // verificado: es una acción de quien publica, no de quien solo mira.
    if (!canPublish) {
      setBusy(null);
      return;
    }
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setView(result.data);
          setInput(result.data.domain ?? '');
        } else {
          toast.error(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('No pudimos consultar el estado del dominio. Intenta de nuevo en unos minutos.');
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
    // `load` cambia en cada render del padre: el estado se pide solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish]);

  async function save() {
    setBusy('save');
    try {
      const result = await saveDomain(input);
      if (!result.success) return void toast.error(result.error);
      setView(result.data);
      setInput(result.data.domain ?? '');
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
      const result = await load();
      if (!result.success) return void toast.error(result.error);
      setView(result.data);
      if (result.data.verifiedAt) toast.success('El dominio está conectado');
      else toast.info('Todavía no: los DNS pueden tardar desde minutos hasta 24 horas en propagarse');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const current = view?.domain ?? initialDomain;
    if (!current) return;
    const ok = await confirm({
      title: `¿Quitar ${current}?`,
      description: 'El sitio vuelve a verse solo en su dirección de la plataforma. Los enlaces que usen este dominio dejarán de funcionar.',
      confirmLabel: 'Quitar dominio',
    });
    if (!ok) return;
    setBusy('remove');
    try {
      const result = await removeDomain();
      if (!result.success) return void toast.error(result.error);
      setView(result.data);
      setInput('');
      toast.success(result.message ?? 'Dominio quitado');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const domain = view ? view.domain : initialDomain;
  const connected = Boolean(view?.verifiedAt);
  const loading = busy === 'load';
  const unchanged = input.trim().toLowerCase() === (domain ?? '');

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-label="Dominio propio">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
            Dominio propio
          </h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Publica el sitio en tu propia dirección, por ejemplo {example}. Compra el dominio en tu proveedor (NIC Chile, GoDaddy, Cloudflare…), crea los registros DNS que te mostramos aquí y pulsa «Revisar estado». Puede tardar hasta 24 horas.
          </p>
        </div>
        {domain &&
          (view ? (
            <StatusBadge tone={connected ? 'success' : 'warning'}>{connected ? 'Verificado' : 'Pendiente de DNS'}</StatusBadge>
          ) : loading ? (
            <StatusBadge tone="neutral">Revisando…</StatusBadge>
          ) : null)}
      </div>

      {!canPublish && (
        <p role="note" className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Solo dueño y administradores pueden configurar el dominio.
        </p>
      )}

      <div>
        <Label htmlFor={`${idPrefix}-domain`}>Dominio</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            id={`${idPrefix}-domain`}
            className="max-w-sm flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canPublish && busy === null && input.trim() && !unchanged) {
                e.preventDefault();
                void save();
              }
            }}
            placeholder={example}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            aria-describedby={`${idPrefix}-domain-hint`}
            disabled={canPublish && busy !== null && busy !== 'check'}
            readOnly={!canPublish}
          />
          {canPublish && (
            <Button type="button" size="sm" onClick={() => void save()} disabled={busy !== null || !input.trim() || unchanged}>
              {busy === 'save' ? 'Guardando…' : 'Guardar dominio'}
            </Button>
          )}
        </div>
        <p id={`${idPrefix}-domain-hint`} className="mt-1 text-xs text-muted-foreground">
          Escríbelo sin https://; el www. se conecta solo. Sirve un dominio (minegocio.cl) o un subdominio (tienda.minegocio.cl). Debe estar comprado a tu nombre o al de tu cliente.
        </p>
      </div>

      {!domain && !loading && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Compra el dominio en el proveedor que prefieras.</li>
          <li>Escríbelo arriba y pulsa «Guardar dominio».</li>
          <li>Crea en tu proveedor los registros DNS que aparecerán aquí y pulsa «Revisar estado».</li>
        </ol>
      )}

      {domain && (
        <div className="space-y-3">
          {view && connected ? (
            <div className="space-y-1">
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <ExternalLink className="size-4" aria-hidden="true" />
                https://{domain}
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
              <p className="text-xs text-muted-foreground">El dominio muestra tu sitio publicado. Si todavía es un borrador, publícalo desde el editor.</p>
            </div>
          ) : view ? (
            <div className="space-y-2">
              <p className="text-sm">
                Entra al panel donde compraste el dominio y crea {view.records.length === 1 ? 'este registro DNS' : 'estos registros DNS'}:
              </p>
              {view.records.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Registros DNS que debes crear para {domain}</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                        <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
                        <th scope="col" className="px-3 py-2 font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.records.map((record) => (
                        <tr key={`${record.type}-${record.name}-${record.value}`} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{record.type}</td>
                          <td className="px-3 py-2">
                            <CopyButton value={record.name} label="nombre" />
                          </td>
                          <td className="px-3 py-2">
                            <CopyButton value={record.value} label="valor" />
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
                Si el panel no acepta &quot;@&quot;, deja el nombre vacío. Los cambios de DNS pueden tardar desde minutos hasta 24 horas; el sitio se conecta solo apenas el dominio responde.
              </p>
              {!view.automatic && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  El administrador de la plataforma también debe agregar {domain} en Vercel (Project → Settings → Domains), porque la conexión automática no está configurada.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Mientras tanto, tu sitio publicado se ve en <span className="font-mono break-all">{platformUrl}</span>.
              </p>
            </div>
          ) : (
            !loading && <p className="text-xs text-muted-foreground">No pudimos consultar el estado del dominio. Pulsa «Revisar estado» para intentarlo de nuevo.</p>
          )}

          {view?.statusError && (
            <p role="alert" className="text-xs text-danger">
              {view.statusError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canPublish && (
              <Button type="button" size="sm" variant="outline" onClick={() => void check()} disabled={busy !== null}>
                <RefreshCw className={busy === 'check' || loading ? 'animate-spin' : undefined} aria-hidden="true" />
                {busy === 'check' ? 'Revisando…' : 'Revisar estado'}
              </Button>
            )}
            {canPublish && (
              <Button type="button" size="sm" variant="outline" onClick={() => void remove()} disabled={busy !== null}>
                <Trash2 aria-hidden="true" />
                Quitar dominio
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Revisando el estado del dominio…' : ''}
      </p>
    </section>
  );
}
