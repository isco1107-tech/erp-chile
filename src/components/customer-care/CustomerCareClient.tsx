'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Copy, HeartHandshake, MessageCircle, MessageSquare, RefreshCw, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { toWhatsappDigits } from '@/lib/phone';
import { ACQUISITION_CHANNELS } from '@/lib/customer-care/channels';
import { DEFAULT_DELIVERY_MESSAGE, formatLeadTime, renderMessage } from '@/lib/customer-care/messages';
import { cn } from '@/lib/utils';
import {
  closeFollowUpAction,
  createSurveyAction,
  listCustomerOptionsAction,
  generateInactiveFollowUpsAction,
  getCustomerCareDashboardAction,
  listFollowUpsAction,
  listInactiveCustomersAction,
  listSurveysAction,
  markSurveySentAction,
  saveCustomerCareSettingsAction,
  setContactChannelAction,
} from '@/modules/customer-care/actions/customer-care.actions';
import { FOLLOW_UP_REASON_LABELS } from '@/modules/customer-care/schema';
import type { CustomerCareDashboard, CustomerCareSettingsView, FollowUpRow, InactiveCustomerRow, SurveyRow } from '@/modules/customer-care/services/customer-care.service';

type Tab = 'RESUMEN' | 'SEGUIMIENTOS' | 'ENCUESTAS' | 'AJUSTES';
type DashboardData = CustomerCareDashboard & { settings: CustomerCareSettingsView };

const TABS: Array<{ value: Tab; label: string; writeOnly?: boolean }> = [
  { value: 'RESUMEN', label: 'Resumen' },
  { value: 'SEGUIMIENTOS', label: 'Seguimientos' },
  { value: 'ENCUESTAS', label: 'Encuestas' },
  { value: 'AJUSTES', label: 'Ajustes', writeOnly: true },
];

const selectClass = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

export default function CustomerCareClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('RESUMEN');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [inactive, setInactive] = useState<InactiveCustomerRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [surveys, setSurveys] = useState<Array<SurveyRow & { url: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [surveyCustomer, setSurveyCustomer] = useState('');
  const [channelPick, setChannelPick] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ inactiveAfterDays: '60', deliveryLeadDays: '', surveyIntro: '', followUpMessage: '' });

  const load = useCallback(async () => {
    const [dash, inact, follow, surv, opts] = await Promise.all([getCustomerCareDashboardAction(), listInactiveCustomersAction(), listFollowUpsAction('OPEN'), listSurveysAction(), listCustomerOptionsAction()]);
    if (dash.success) {
      setDashboard(dash.data);
      setForm({
        inactiveAfterDays: String(dash.data.settings.inactiveAfterDays),
        deliveryLeadDays: dash.data.settings.deliveryLeadDays ? String(dash.data.settings.deliveryLeadDays) : '',
        surveyIntro: dash.data.settings.surveyIntro,
        followUpMessage: dash.data.settings.followUpMessage,
      });
    } else toast.error(dash.error);
    if (inact.success) setInactive(inact.data);
    if (follow.success) setFollowUps(follow.data);
    if (surv.success) setSurveys(surv.data);
    if (opts.success) setCustomers(opts.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // La carga es asíncrona: los setState ocurren después de resolver las acciones.
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>) {
    setBusy(key);
    try {
      const result = await action();
      if (result.success) {
        if (result.message) toast.success(result.message);
        await load();
      } else toast.error(result.error);
    } finally {
      setBusy(null);
    }
  }

  async function closeFollowUp(id: string, status: 'DONE' | 'SKIPPED') {
    const ok = await confirm({
      title: status === 'DONE' ? '¿Marcar el seguimiento como realizado?' : '¿Descartar este seguimiento?',
      confirmLabel: status === 'DONE' ? 'Marcar como realizado' : 'Descartar',
      destructive: status === 'SKIPPED',
    });
    if (!ok) return;
    await run(`close-${id}`, () => closeFollowUpAction(id, { status, outcome: outcomes[id]?.trim() || undefined }));
  }

  async function copySurvey(row: SurveyRow & { url: string }) {
    try {
      await navigator.clipboard.writeText(row.url);
    } catch {
      toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano');
      return;
    }
    toast.success('Enlace copiado: pégalo en WhatsApp o en un correo');
    if (!row.sentAt) await run(`sent-${row.id}`, () => markSurveySentAction(row.id));
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    void run('settings', () =>
      saveCustomerCareSettingsAction({
        inactiveAfterDays: Number(form.inactiveAfterDays),
        deliveryLeadDays: form.deliveryLeadDays ? Number(form.deliveryLeadDays) : null,
        surveyIntro: form.surveyIntro.trim() || undefined,
        followUpMessage: form.followUpMessage.trim() || undefined,
      })
    );
  }

  const metrics = dashboard?.metrics;
  const visibleTabs = TABS.filter((t) => !t.writeOnly || canWrite);

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Secciones de fidelización" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {visibleTabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {tab === 'RESUMEN' && dashboard && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="NPS" value={metrics?.nps === null || metrics === undefined ? '—' : String(metrics.nps)} icon={HeartHandshake} tone="info" hint={metrics?.nps === null ? 'Sin respuestas aún' : `${metrics?.responses ?? 0} respuestas`} />
                <KpiCard label="Satisfacción" value={metrics?.csat == null ? '—' : `${metrics.csat}/5`} icon={Star} tone="success" hint={metrics?.csat == null ? 'Sin respuestas aún' : 'Promedio de las encuestas'} />
                <KpiCard label="Tasa de respuesta" value={dashboard.responseRate === null ? '—' : `${dashboard.responseRate}%`} icon={MessageSquare} tone="accent" hint={`${dashboard.surveysSent} encuestas enviadas`} />
                <KpiCard label="Clientes inactivos" value={String(dashboard.inactiveCount)} icon={Users} tone={dashboard.inactiveCount > 0 ? 'warning' : 'neutral'} hint={`Sin comprar hace ${dashboard.inactiveAfterDays} días o más`} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-4" aria-label="Cómo nos encontraron">
                  <h3 className="mb-4 text-sm font-semibold">Cómo nos encontraron</h3>
                  {dashboard.channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aún no hay clientes registrados.</p>
                  ) : (
                    <ul className="space-y-3">
                      {dashboard.channels.map((item) => (
                        <li key={item.channel ?? 'none'} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{item.label}</span>
                            <span className="text-muted-foreground">
                              {item.count} · {item.percent}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className={cn('h-full', item.channel ? 'bg-primary' : 'bg-warning')} style={{ width: `${item.percent}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-card p-4" aria-label="Clientes sin canal">
                  <h3 className="mb-1 text-sm font-semibold">Clientes sin canal registrado</h3>
                  <p className="mb-3 text-xs text-muted-foreground">Pregunta “¿cómo nos encontraste?” en cada venta y anótalo aquí.</p>
                  {dashboard.customersWithoutChannel.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Todos tus clientes tienen canal. ¡Buen trabajo!</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {dashboard.customersWithoutChannel.slice(0, 10).map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          {canWrite && (
                            <span className="flex items-center gap-2">
                              <select aria-label={`Canal de ${c.name}`} className={selectClass} value={channelPick[c.id] ?? ''} onChange={(e) => setChannelPick((p) => ({ ...p, [c.id]: e.target.value }))}>
                                <option value="">Elegir canal…</option>
                                {ACQUISITION_CHANNELS.map((ch) => (
                                  <option key={ch.value} value={ch.value}>
                                    {ch.label}
                                  </option>
                                ))}
                              </select>
                              <Button size="sm" disabled={!channelPick[c.id] || busy === `ch-${c.id}`} onClick={() => run(`ch-${c.id}`, () => setContactChannelAction({ contactId: c.id, channel: channelPick[c.id] }))}>
                                Guardar
                              </Button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === 'SEGUIMIENTOS' && dashboard && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Clientes que compraron alguna vez y llevan {dashboard.inactiveAfterDays} días o más sin hacerlo.</p>
                {canWrite && (
                  <Button onClick={() => run('generate', generateInactiveFollowUpsAction)} disabled={busy === 'generate' || inactive.length === 0}>
                    <RefreshCw className={cn(busy === 'generate' && 'animate-spin')} aria-hidden="true" />
                    Crear seguimientos de inactivos
                  </Button>
                )}
              </div>

              <section className="rounded-lg border border-border bg-card" aria-label="Clientes inactivos">
                {inactive.length === 0 ? (
                  <EmptyState title="No hay clientes inactivos" description="Todos los que han comprado lo hicieron dentro del plazo definido en Ajustes." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Cliente</th>
                          <th className="px-4 py-2.5 font-medium">Última compra</th>
                          <th className="px-4 py-2.5 text-right font-medium">Días sin comprar</th>
                          <th className="px-4 py-2.5 text-right font-medium">Total comprado</th>
                          <th className="px-4 py-2.5 font-medium">Contacto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inactive.map((row) => {
                          const digits = row.phone ? toWhatsappDigits(row.phone) : '';
                          const text = renderMessage(dashboard.settings.followUpMessage, { cliente: row.name, empresa: '' });
                          return (
                            <tr key={row.contactId}>
                              <td className="px-4 py-2.5 font-medium">
                                {row.name} {row.hasOpenFollowUp && <StatusBadge tone="info">En seguimiento</StatusBadge>}
                              </td>
                              <td className="px-4 py-2.5">{formatDate(row.lastPurchaseAt)}</td>
                              <td className="px-4 py-2.5 text-right">{row.daysSince}</td>
                              <td className="px-4 py-2.5 text-right">{formatCurrency(row.totalSpent)}</td>
                              <td className="px-4 py-2.5">
                                {digits ? (
                                  <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
                                    <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{row.email ?? 'Sin datos'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-border bg-card" aria-label="Seguimientos abiertos">
                <div className="border-b border-border p-4 text-sm font-semibold">Seguimientos abiertos ({followUps.length})</div>
                {followUps.length === 0 ? (
                  <EmptyState title="Sin seguimientos abiertos" description="Cuando crees seguimientos o un cliente conteste mal la encuesta, aparecerán aquí." />
                ) : (
                  <ul className="divide-y divide-border">
                    {followUps.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium">
                            {f.contactName} <StatusBadge tone={f.reason === 'DETRACTOR' ? 'danger' : 'neutral'}>{FOLLOW_UP_REASON_LABELS[f.reason]}</StatusBadge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Para el {formatDate(f.dueDate)}
                            {f.note ? ` · ${f.note}` : ''}
                          </p>
                        </div>
                        {canWrite && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input aria-label="Resultado del seguimiento" placeholder="¿Qué pasó? (opcional)" className="h-8 w-48 text-xs" maxLength={500} value={outcomes[f.id] ?? ''} onChange={(e) => setOutcomes((o) => ({ ...o, [f.id]: e.target.value }))} />
                            <Button size="sm" disabled={busy === `close-${f.id}`} onClick={() => closeFollowUp(f.id, 'DONE')}>
                              Listo
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy === `close-${f.id}`} onClick={() => closeFollowUp(f.id, 'SKIPPED')}>
                              Descartar
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'ENCUESTAS' && (
            <div className="space-y-4">
              {canWrite && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <select aria-label="Cliente a encuestar" className={cn(selectClass, 'min-w-56')} value={surveyCustomer} onChange={(e) => setSurveyCustomer(e.target.value)}>
                    <option value="">Elegir cliente…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!surveyCustomer || busy === 'survey'}
                    onClick={async () => {
                      setBusy('survey');
                      try {
                        const result = await createSurveyAction({ contactId: surveyCustomer });
                        if (!result.success) return void toast.error(result.error);
                        await navigator.clipboard.writeText(result.data.url).catch(() => undefined);
                        toast.success('Enlace creado y copiado: pégalo en WhatsApp o en un correo');
                        setSurveyCustomer('');
                        await load();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Crear enlace de encuesta
                  </Button>
                </div>
              )}
            <section className="rounded-lg border border-border bg-card" aria-label="Encuestas">
              {surveys.length === 0 ? (
                <EmptyState title="Aún no hay encuestas" description="Crea el enlace de una encuesta desde la ficha del cliente o tras una venta, y compártelo por WhatsApp o correo." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Cliente</th>
                        <th className="px-4 py-2.5 font-medium">Creada</th>
                        <th className="px-4 py-2.5 font-medium">Estado</th>
                        <th className="px-4 py-2.5 text-right font-medium">Satisfacción</th>
                        <th className="px-4 py-2.5 text-right font-medium">Recomienda</th>
                        <th className="px-4 py-2.5 font-medium">Comentario</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {surveys.map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-2.5 font-medium">{s.contactName}</td>
                          <td className="px-4 py-2.5">{formatDate(s.createdAt)}</td>
                          <td className="px-4 py-2.5">{s.respondedAt ? <StatusBadge tone="success">Contestada</StatusBadge> : <StatusBadge tone={s.sentAt ? 'info' : 'neutral'}>{s.sentAt ? 'Enviada' : 'Por enviar'}</StatusBadge>}</td>
                          <td className="px-4 py-2.5 text-right">{s.csat ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right">{s.nps ?? '—'}</td>
                          <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground" title={s.comment ?? undefined}>
                            {s.comment ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {canWrite && !s.respondedAt && (
                              <Button size="sm" variant="outline" onClick={() => copySurvey(s)}>
                                <Copy aria-hidden="true" /> Copiar enlace
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </div>
          )}

          {tab === 'AJUSTES' && canWrite && (
            <form onSubmit={saveSettings} className="max-w-2xl space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  Días sin comprar para considerar inactivo
                  <Input type="number" min={7} max={730} required value={form.inactiveAfterDays} onChange={(e) => setForm((f) => ({ ...f, inactiveAfterDays: e.target.value }))} />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Plazo estándar de entrega (días hábiles)
                  <Input type="number" min={1} max={60} value={form.deliveryLeadDays} onChange={(e) => setForm((f) => ({ ...f, deliveryLeadDays: e.target.value }))} />
                </label>
              </div>
              <label className="block space-y-1 text-sm font-medium">
                Texto de invitación a la encuesta
                <textarea className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={300} value={form.surveyIntro} onChange={(e) => setForm((f) => ({ ...f, surveyIntro: e.target.value }))} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Mensaje de seguimiento a clientes inactivos
                <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={600} value={form.followUpMessage} onChange={(e) => setForm((f) => ({ ...f, followUpMessage: e.target.value }))} />
                <span className="block text-xs font-normal text-muted-foreground">Puedes usar {'{{cliente}}'} y {'{{empresa}}'}.</span>
              </label>
              <div className="rounded-md bg-muted p-3 text-xs">
                <p className="mb-1 font-semibold">Mensaje tipo de confirmación de pedido (con el plazo)</p>
                <p className="text-muted-foreground">{renderMessage(DEFAULT_DELIVERY_MESSAGE, { cliente: 'Ana', empresa: 'tu empresa', plazo: formatLeadTime(form.deliveryLeadDays ? Number(form.deliveryLeadDays) : null) })}</p>
              </div>
              <Button type="submit" disabled={busy === 'settings'}>
                Guardar ajustes
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
