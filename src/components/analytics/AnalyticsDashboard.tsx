'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowDownLeft, ArrowUpRight, BarChart3, CircleDollarSign, ClipboardList, FlaskConical, LoaderCircle, Pause, Play, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type { AnalyticsModule, AnalyticsSnapshot } from '@/lib/analytics/types';
import { AnalyticsCharts, ScienceCharts } from './AnalyticsCharts';

const POLL_MS = 15_000;
const STALE_MS = 45_000;
const amount = (value: number | null) => value === null ? 'Sin acceso a la fuente' : formatCurrency(value);
const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** Only memory is used: private company data must never enter persistent browser storage. */
function useAnalyticsSnapshot(module: AnalyticsModule, days: number, paused: boolean) {
  const queryKey = `${module}:${days}`;
  const [result, setResult] = useState<{ key: string; data: AnalyticsSnapshot } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [now, setNow] = useState(0);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let accessDenied = false;
    let controller: AbortController | null = null;
    setError(null);
    setDenied(false);
    setLoading(false);
    setOffline(!navigator.onLine);
    setHidden(document.visibilityState !== 'visible');
    setNow(Date.now());

    async function update(manual = false) {
      if (disposed || busy || (!manual && (paused || accessDenied)) || !navigator.onLine || document.visibilityState !== 'visible') return;
      busy = true;
      controller = new AbortController();
      const current = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; current.abort(); }, 20_000);
      setLoading(true);
      try {
        const response = await fetch(`/api/analytics?module=${module}&days=${days}`, {
          cache: 'no-store', credentials: 'same-origin', signal: current.signal,
        });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) {
          accessDenied = true;
          setResult(null);
          setDenied(true);
          setError(response.status === 401
            ? 'Tu sesión terminó. Vuelve a ingresar para consultar la empresa.'
            : 'El acceso a este módulo fue retirado o el módulo está desactivado.');
          return;
        }
        if (!response.ok) throw new Error('No se pudo actualizar. Reintentaremos cuando haya conexión.');
        const data: AnalyticsSnapshot = await response.json();
        if (disposed) return;
        if (typeof data.companyId !== 'string' || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.daily) || !data.totals) {
          throw new Error('No se pudo interpretar la actualización. Intenta nuevamente.');
        }
        accessDenied = false;
        setDenied(false);
        setResult({ key: queryKey, data });
        setError(null);
        setNow(Date.now());
      } catch {
        if (disposed) return;
        if (current.signal.aborted && !timedOut) return;
        setError(timedOut ? 'La actualización tardó demasiado. Puedes volver a intentarlo.' : 'No se pudo actualizar la empresa. Comprueba la conexión o vuelve a intentarlo.');
      } finally {
        window.clearTimeout(timeout);
        busy = false;
        if (!disposed) setLoading(false);
      }
    }

    refreshRef.current = () => { void update(true); };
    const refreshIfVisible = () => {
      setOffline(!navigator.onLine);
      setHidden(document.visibilityState !== 'visible');
      if (!navigator.onLine || document.visibilityState !== 'visible') controller?.abort();
      else void update();
    };
    void update();
    const interval = window.setInterval(() => { setNow(Date.now()); void update(); }, POLL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    window.addEventListener('offline', refreshIfVisible);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
      window.removeEventListener('offline', refreshIfVisible);
      refreshRef.current = () => undefined;
    };
  }, [module, days, paused, queryKey]);

  const snapshot = result?.key === queryKey ? result.data : null;
  const stale = !!snapshot && now - Date.parse(snapshot.generatedAt) > STALE_MS;
  return { snapshot, loading, error, denied, offline, hidden, stale, refresh: () => refreshRef.current() };
}

const ENTITY_LABELS: Record<string, string> = {
  SalesDocument: 'Venta', PurchaseDocument: 'Compra', PurchaseOrder: 'Orden de compra',
  Product: 'Producto', InventoryMovement: 'Movimiento de inventario', InventoryCount: 'Toma de inventario',
  Stock: 'Existencias', Payment: 'Pago', CashShift: 'Turno de caja', CashRegister: 'Caja', CashMovement: 'Movimiento de caja',
  Contact: 'Contacto', Company: 'Empresa', CompanyFeatures: 'Módulos de la empresa', CompanySettings: 'Configuración',
  User: 'Usuario', CustomRole: 'Rol', JournalEntry: 'Asiento contable', TeamTask: 'Tarea',
  Opportunity: 'Oportunidad comercial', Employee: 'Trabajador', Project: 'Proyecto', StoreOrder: 'Pedido de tienda',
  AnalyticsModules: 'Módulos de datos',
};
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación', ISSUE_DTE: 'Emisión de documento',
  CANCEL_DTE: 'Anulación de documento', STOCK_ADJUSTMENT: 'Ajuste de inventario', EXPORT: 'Exportación', DOWNLOAD: 'Descarga',
};

function AnalyticsOverview({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { totals } = snapshot;
  const trend = totals.netSales !== null && totals.previousNetSales !== null && totals.previousNetSales > 0
    ? ((totals.netSales - totals.previousNetSales) / totals.previousNetSales) * 100 : null;
  return (
    <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.sources.sales && <KpiCard label="Ventas netas del período" value={amount(totals.netSales)} icon={BarChart3}
          trend={trend === null ? undefined : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`}
          trendDirection={trend === null || trend === 0 ? 'neutral' : trend > 0 ? 'up' : 'down'} hint="vs. período anterior" />}
        {snapshot.sources.purchases && <KpiCard label="Compras netas del período" value={amount(totals.purchases)} icon={ClipboardList} />}
        {snapshot.sources.treasury && <KpiCard label="Cobros registrados" value={amount(totals.income)} icon={ArrowDownLeft} />}
        {snapshot.sources.treasury && <KpiCard label="Pagos registrados" value={amount(totals.expense)} icon={ArrowUpRight} />}
        {totals.receivable !== null && <KpiCard label="Saldo pendiente de cobro" value={amount(totals.receivable)} icon={Wallet} />}
        {totals.payable !== null && <KpiCard label="Saldo pendiente de pago" value={amount(totals.payable)} icon={CircleDollarSign} />}
        {totals.documents !== null && <KpiCard label="Documentos de venta emitidos" value={totals.documents.toLocaleString('es-CL')} icon={ClipboardList} />}
      </div>
      {!Object.values(snapshot.sources).some(Boolean) && <EmptyState title="Sin fuentes disponibles" description="Los indicadores se mostrarán cuando tu empresa tenga módulos operativos activos y tu cuenta pueda consultarlos." />}
      <AnalyticsCharts snapshot={snapshot} />
      <section className="space-y-3" aria-labelledby="analytics-operations">
        <h2 id="analytics-operations" className="text-base font-semibold">Operación de la empresa</h2>
        <p className="text-xs text-muted-foreground">Estado actual de los módulos disponibles para tu cuenta. Solo los indicadores que dicen «del período» dependen del período seleccionado.</p>
        {snapshot.operations.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.operations.map((operation) => <Link key={operation.key} href={operation.href} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-sm text-muted-foreground">{operation.label}</span>
            <span className="text-xl font-semibold tabular-nums">{operation.value.toLocaleString('es-CL')}</span>
          </Link>)}
        </div> : <EmptyState title="Sin indicadores operativos disponibles" description="Cada módulo aporta sus indicadores al estar activo y contar con los permisos necesarios." />}
      </section>
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card" aria-labelledby="analytics-activity">
        <div className="border-b border-border p-4"><h2 id="analytics-activity" className="flex items-center gap-2 text-base font-semibold"><Activity className="size-4" aria-hidden />Actividad reciente</h2>
          <p className="mt-1 text-xs text-muted-foreground">Últimas acciones auditadas de la empresa. La bitácora registra las acciones integradas al ERP.</p>
        </div>
        {snapshot.activity.length ? <ol className="divide-y divide-border">
          {snapshot.activity.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span>{ENTITY_LABELS[event.entity] ?? 'Registro del ERP'} <span className="text-muted-foreground">· {ACTION_LABELS[event.action] ?? 'Actividad registrada'}</span></span>
            <time dateTime={event.at} className="text-xs tabular-nums text-muted-foreground">{dayTimeLabel(new Date(event.at))}</time>
          </li>)}
        </ol> : <EmptyState title="Sin actividad auditada disponible" description="Las acciones registradas de esta empresa aparecerán aquí al actualizar." />}
      </section>
    </>
  );
}

function ScienceOverview({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const science = snapshot.science;
  if (!science) return <EmptyState title="Sin datos para analizar" description="El análisis necesita acceso a las ventas emitidas de esta empresa." icon={<FlaskConical className="size-12 text-muted-foreground" aria-hidden />} />;
  const forecastTotal = science.forecast.reduce((sum, day) => sum + day.expected, 0);
  return (
    <>
      {science.status === 'insufficient' ? <div className="rounded-lg border border-border bg-card p-6 shadow-card"><EmptyState title="Datos insuficientes" description={science.reason} icon={<FlaskConical className="size-12 text-muted-foreground" aria-hidden />} /></div> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label={`Ventas netas estimadas · próximos ${science.forecast.length} días`} value={formatCurrency(forecastTotal)} icon={BarChart3} />
          <KpiCard label="Cambio reciente de ventas" value={science.trendPercent === null ? 'Sin comparación suficiente' : `${science.trendPercent > 0 ? '+' : ''}${science.trendPercent.toFixed(1)}%`} icon={Activity} />
          <KpiCard label="Error absoluto medio en validación" value={science.backtestMae === null ? 'Sin validación suficiente' : formatCurrency(science.backtestMae)} icon={FlaskConical} />
        </div>
        <ScienceCharts snapshot={snapshot} />
      </>}
      <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="science-method">
        <h2 id="science-method" className="text-base font-semibold">Método y calidad del modelo</h2>
        <p className="text-sm text-muted-foreground">{science.method}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Muestra utilizada</dt><dd className="font-medium">{science.sampleDays} días completos</dd></div>
          <div><dt className="text-muted-foreground">Unidad y calendario</dt><dd className="font-medium">Ventas netas en CLP · America/Santiago</dd></div>
        </dl>
        {science.status === 'ready' && science.reason && <p className="text-sm text-muted-foreground">{science.reason}</p>}
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Las proyecciones son estimaciones, con un rango de variación; no garantizan ingresos futuros. El día actual incompleto se excluye del modelo. Las señales atípicas invitan a revisar los registros y no prueban un error ni una causa.</p>
      </section>
      {science.status === 'ready' && <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="science-anomalies">
        <h2 id="science-anomalies" className="text-base font-semibold">Señales atípicas</h2>
        <p className="mt-1 text-xs text-muted-foreground">Días con ventas inusuales frente a su referencia histórica.</p>
        {science.anomalies.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
          <caption className="sr-only">Ventas observadas y referencia para cada señal detectada, en pesos chilenos.</caption>
          <thead><tr className="border-b border-border text-muted-foreground"><th scope="col" className="p-2 font-medium">Día</th><th scope="col" className="p-2 font-medium">Señal</th><th scope="col" className="p-2 text-right font-medium">Observado</th><th scope="col" className="p-2 text-right font-medium">Referencia</th></tr></thead>
          <tbody>{science.anomalies.map((anomaly) => <tr key={anomaly.date} className="border-b border-border last:border-0"><th scope="row" className="whitespace-nowrap p-2 font-medium">{dayLabel(anomaly.date)}</th><td className="p-2">{anomaly.direction === 'high' ? 'Sobre lo habitual' : 'Bajo lo habitual'}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatCurrency(anomaly.actual)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatCurrency(anomaly.expected)}</td></tr>)}</tbody>
        </table></div> : <EmptyState title="Sin señales atípicas detectadas" description="Con los datos disponibles, ningún día supera el umbral del modelo." />}
      </section>}
    </>
  );
}

export default function AnalyticsDashboard({ module }: { module: AnalyticsModule }) {
  const [days, setDays] = useState(30);
  const [paused, setPaused] = useState(false);
  const { snapshot, loading, error, denied, offline, hidden, stale, refresh } = useAnalyticsSnapshot(module, days, paused);
  const status = denied ? 'Acceso retirado' : offline ? 'Sin conexión' : paused ? 'Actualización pausada' : hidden ? 'En segundo plano' : error || stale ? 'Datos pendientes de actualizar' : snapshot ? 'Actualización automática' : 'Cargando datos';
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader eyebrow="Inteligencia de Negocio" title={module === 'analytics' ? 'Data Analytics' : 'Data Science'}
        description={module === 'analytics' ? 'Indicadores y actividad de tu empresa, consultados directamente desde los registros del ERP.' : 'Tendencias, señales atípicas y proyecciones explicables a partir de tus ventas reales.'}
        actions={<><Button type="button" variant="outline" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}{paused ? 'Reanudar' : 'Pausar'}</Button><Button type="button" onClick={refresh} disabled={loading || offline}>{loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}Actualizar ahora</Button></>} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card">
        <div className="min-w-0 space-y-1" role="status" aria-live="polite">
          <StatusBadge tone={denied ? 'danger' : offline || error || stale ? 'warning' : paused || hidden ? 'neutral' : 'success'}>{status}</StatusBadge>
          <p className="text-xs text-muted-foreground">{snapshot ? <>{snapshot.companyName} · Última lectura <time dateTime={snapshot.generatedAt}>{dayTimeLabel(new Date(snapshot.generatedAt))}</time> (Santiago)</> : 'Acceso exclusivo para administradores y dueños de la empresa.'}</p>
          <p className="text-xs text-muted-foreground">Consulta automática cada 15 segundos con esta pestaña visible. {module === 'analytics' ? 'Importes netos en CLP; hoy incluye solo lo registrado hasta esta lectura.' : 'Historial de hasta 90 días completos; el modelo indica su muestra disponible.'}</p>
        </div>
        {module === 'analytics' && <label className="flex items-center gap-2 text-sm" htmlFor="analytics-days"><span>Período</span><select id="analytics-days" value={days} onChange={(event) => setDays(Number(event.target.value))} className="max-w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{[7, 30, 90].map((value) => <option key={value} value={value}>Últimos {value} días</option>)}</select></label>}
      </div>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}{snapshot && ' Los valores visibles corresponden a la última lectura correcta.'}{denied && <Link href="/dashboard/settings/modules" className="ml-1 underline">Revisar módulos</Link>}</div>}
      {offline && !error && <p role="status" className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">Sin conexión. {snapshot ? 'Se conserva la última lectura; los datos pueden haber cambiado.' : 'Conéctate para consultar los datos.'}</p>}
      {!snapshot && !error && <EmptyState title={loading ? 'Consultando los datos de la empresa' : paused ? 'Actualización pausada' : 'Esperando conexión'} description={paused ? 'Pulsa Actualizar ahora para consultar los datos sin reanudar las consultas automáticas.' : 'El panel mostrará únicamente datos disponibles de esta empresa.'} icon={loading ? <LoaderCircle className="size-10 animate-spin text-muted-foreground" aria-hidden /> : undefined} />}
      {snapshot && (module === 'analytics' ? <AnalyticsOverview snapshot={snapshot} /> : <ScienceOverview snapshot={snapshot} />)}
    </div>
  );
}
