'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Store,
  TrendingUp,
  CircleDollarSign,
  Search,
  Package,
} from 'lucide-react';
import type { ControlSnapshot } from '@/modules/control/service';
import { formatCurrency } from '@/lib/chile/tax';
import InstallApplication from './InstallApplication';
import { useOnline } from './useOnline';
const sections = [
  { href: '#control-resumen', label: 'Resumen', Icon: TrendingUp },
  { href: '#control-cajas', label: 'Cajas', Icon: Wallet },
  { href: '#control-actividad', label: 'Actividad', Icon: Activity },
];
export default function ControlDashboard() {
  const online = useOnline();
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ControlSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const update = async () => {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      if (active) setBusy(true);
      try {
        const response = await fetch('/api/control', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          if (active && (response.status === 401 || response.status === 403))
            setData(null);
          throw new Error(
            response.status === 401
              ? 'Tu sesión venció. Vuelve a ingresar.'
              : response.status === 403
                ? 'Tu cuenta no tiene acceso a Aether Control.'
                : 'No se pudo actualizar. Revisa la conexión.',
          );
        }
        const snapshot: ControlSnapshot = await response.json();
        if (active) {
          setData(snapshot);
          setError(null);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No se pudo actualizar.',
          );
      } finally {
        inFlight = false;
        if (active) setBusy(false);
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 15000);
    const resume = () => void update();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);
  const clock = (at: string) =>
    new Date(at).toLocaleTimeString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  const metrics = data
    ? [
        {
          label: 'Ventas de hoy',
          value: data.salesToday,
          icon: TrendingUp,
          detail: 'Total con IVA, descontando notas de crédito',
        },
        {
          label: 'Ventas del mes',
          value: data.salesMonth,
          icon: Store,
          detail: 'Documentos emitidos del mes en Chile',
        },
        {
          label: 'Cobros de hoy',
          value: data.incomeToday,
          icon: CircleDollarSign,
          detail: 'Ingresos registrados en Tesorería',
        },
        {
          label: 'Pagos de hoy',
          value: data.expenseToday,
          icon: Wallet,
          detail: 'Egresos registrados en Tesorería',
        },
      ].filter((metric) => metric.value !== null)
    : [];
  const activity =
    data?.activity.filter(
      (event) =>
        (kind === 'all' || event.kind === kind) &&
        `${event.label} ${event.detail}`
          .toLocaleLowerCase('es')
          .includes(query.trim().toLocaleLowerCase('es')),
    ) ?? [];
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-primary p-5 text-primary-foreground sm:p-8">
        <p className="text-xs font-medium tracking-widest opacity-70">
          AETHER CONTROL · DIRECCIÓN
        </p>
        <h1 className="mt-3 break-words text-2xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {data?.company ?? 'Tu empresa, en movimiento'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm opacity-80">
          Ventas, cajas y actividad del ERP en una vista para decidir. Datos del
          día de Chile, actualizados cada 15 segundos mientras la app está
          visible.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm">
            {!online
              ? 'Sin conexión · mostrando la última consulta'
              : error
                ? 'Actualización interrumpida'
                : busy
                  ? 'Consultando el ERP…'
                  : data
                    ? `Última consulta ${clock(data.at)}`
                    : 'Preparando tu empresa…'}
          </p>
          <button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={busy || !online}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-current px-4 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
            Actualizar ahora
          </button>
        </div>
      </section>
      <nav
        aria-label="Secciones de Control"
        className="sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-2xl border bg-card p-1 shadow-sm"
      >
        {sections.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:text-sm"
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      {!online && (
        <p
          role="status"
          className="rounded-2xl bg-warning-soft p-4 text-sm text-warning"
        >
          Sin conexión. Los importes no se actualizarán hasta consultar
          nuevamente el ERP.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-warning"
        >
          <p>{error}</p>
          <p className="mt-1 text-sm">
            {data
              ? 'Se conserva la última consulta; estos datos pueden estar desactualizados.'
              : 'No se mostrarán cifras hasta confirmar los datos.'}
          </p>
          <Link
            href="/control/ingresar"
            className="mt-3 inline-block underline"
          >
            Revisar mi sesión
          </Link>
        </div>
      )}
      <section
        id="control-resumen"
        className="grid scroll-mt-24 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 xl:grid-cols-4"
        aria-label="Indicadores de la empresa"
      >
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="min-w-0 rounded-2xl border bg-card p-3 sm:p-5"
          >
            <metric.icon className="mb-4 size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-3xl">
              {formatCurrency(metric.value ?? 0)}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {metric.detail}
            </p>
          </article>
        ))}
      </section>
      {!data && !error && (
        <div
          role="status"
          className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground"
        >
          Conectando con tu empresa y verificando los indicadores…
        </div>
      )}
      {data?.documentsToday !== null && data && (
        <p className="text-sm text-muted-foreground">
          {data.documentsToday} documentos emitidos hoy · jornada de Chile
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          id="control-cajas"
          className="min-w-0 scroll-mt-24 rounded-3xl border bg-card p-5 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Store className="size-5" />
            Cajas abiertas
            {data?.openRegisters !== null && data
              ? ` · ${data.openRegisters}`
              : ''}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Efectivo esperado, separado de tarjetas y transferencias.
          </p>
          <div className="mt-5 space-y-3">
            {data?.registers.map((register) => (
              <article key={register.id} className="rounded-2xl bg-muted p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <h3 className="font-semibold">{register.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {register.cashier}
                    </p>
                  </div>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatCurrency(register.expected)}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Abierta{' '}
                  {new Date(register.openedAt).toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                  })}
                </p>
              </article>
            ))}
            {data && !data.registers.length && (
              <p className="py-6 text-sm text-muted-foreground">
                {data.openRegisters === null
                  ? 'POS no habilitado para esta cuenta.'
                  : 'No hay cajas abiertas.'}
              </p>
            )}
            {(data?.openRegisters ?? 0) > 20 && (
              <p className="text-sm text-muted-foreground">
                Se muestran las 20 aperturas más recientes.
              </p>
            )}
          </div>
          <Link
            href="/dashboard/pos"
            className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
          >
            Revisar arqueos
            <ArrowUpRight className="size-4" />
          </Link>
        </section>
        <section
          id="control-actividad"
          className="min-w-0 scroll-mt-24 rounded-3xl border bg-card p-5 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="size-5" />
            Actividad reciente
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Documentos, ingresos y retiros de caja, y movimientos de inventario
            confirmados.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Filtrar actividad"
          >
            {[
              ['all', 'Todo'],
              ['sale', 'Ventas'],
              ['cash', 'Caja'],
              ['stock', 'Bodega'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${kind === value ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border bg-background px-3">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar en actividad"
              placeholder="Buscar movimiento, producto o persona"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {activity.length} movimientos en esta consulta · hasta 20 recientes
          </p>
          <ol className="mt-2 divide-y">
            {activity.map((event) => (
              <li key={event.id} className="py-4">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {event.kind === 'sale' ? (
                    <TrendingUp className="size-4" aria-hidden="true" />
                  ) : event.kind === 'cash' ? (
                    <Wallet className="size-4" aria-hidden="true" />
                  ) : (
                    <Package className="size-4" aria-hidden="true" />
                  )}
                  {event.kind === 'sale'
                    ? 'Ventas'
                    : event.kind === 'cash'
                      ? 'Caja'
                      : 'Bodega'}
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words font-medium">
                    {event.label}
                  </p>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.at}
                  >
                    {new Date(event.at).toLocaleString('es-CL', {
                      timeZone: 'America/Santiago',
                    })}
                  </time>
                </div>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {event.detail}
                </p>
                {event.amount !== null && (
                  <p className="mt-2 font-semibold">
                    {formatCurrency(event.amount)}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {data && !activity.length && (
            <p className="py-6 text-sm text-muted-foreground">
              {data.activity.length
                ? 'No hay movimientos que coincidan. Prueba otra búsqueda o selecciona Todo.'
                : 'Todavía no hay actividad registrada en los módulos habilitados.'}
            </p>
          )}
        </section>
      </div>
      <InstallApplication />
    </div>
  );
}
