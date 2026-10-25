'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  HandCoins,
  LogOut,
  PackageX,
  Receipt,
  ShoppingBag,
  Truck,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  PublicBadge,
  PublicCard,
  PublicCardHeader,
  PublicFooter,
  PublicPage,
  PublicShell,
  PublicTopBar,
} from '@/components/public/PublicShell';
import SellerConsignmentSection from '@/components/public/SellerConsignmentSection';
import { PORTAL_STYLES } from '@/components/public/portal-styles';
import { formatCurrency } from '@/lib/chile/tax';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type {
  SellerCenterView,
  LossResponsible,
} from '@/modules/inventory/services/seller-center-view.service';

import InstallApplication from '@/components/apps/InstallApplication';
import { useOnline } from '@/components/apps/useOnline';

const qty = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

const RESPONSIBLE: Record<LossResponsible, string> = {
  YOU: 'A tu cargo',
  STORE: 'La tienda',
  UNASSIGNED: 'Sin asignar',
  OTHER: 'Otro responsable',
};

export interface SellerCenterAccountView {
  personName: string;
  company: { name: string; email: string | null; phone: string | null };
  supplier: { name: string; rut: string };
  others: Array<{
    membershipId: string;
    companyName: string;
    supplierName: string;
  }>;
}

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Seller Center (`/proveedor/cuenta`): el mes del seller en una pantalla. Lo vendido de su mercadería
 * con la comisión y lo que le corresponde, su mercadería en bodega, lo pendiente de liquidar, sus
 * liquidaciones y sus mermas. Solo lectura.
 */
export default function SellerCenterClient({
  account,
  view,
  months,
}: {
  account: SellerCenterAccountView;
  view: SellerCenterView;
  months: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const online = useOnline();
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const { sales, portal, losses } = view;

  const salesRows = sales.rows.filter((row) =>
    `${row.name} ${row.sku ?? ''}`
      .toLocaleLowerCase('es')
      .includes(query.trim().toLocaleLowerCase('es')),
  );

  async function logout() {
    setBusy(true);
    setError(null);
    if (await post('/api/supplier-portal/logout', {})) {
      router.replace('/proveedor/cuenta/ingresar');
      router.refresh();
    } else {
      setError(
        'No se pudo cerrar la sesión. Revisa la conexión e inténtalo nuevamente.',
      );
      setBusy(false);
    }
  }

  async function switchTo(membershipId: string) {
    if (!membershipId) return;
    setBusy(true);
    setError(null);
    if (await post('/api/supplier-portal/switch', { membershipId })) {
      // Reload the account document before allowing exports in the new company.
      window.location.reload();
    } else {
      setError(
        'No se pudo cambiar de empresa. Sigues viendo los datos de ' +
          account.company.name +
          '. Inténtalo nuevamente.',
      );
      setBusy(false);
    }
  }

  return (
    <PublicPage accent="gold" className="sc-app">
      <style>{PORTAL_STYLES}</style>
      <style>{STYLES}</style>
      <PublicTopBar
        brand={account.company.name}
        right={
          <span className="sc-user">
            <span className="sc-user-name">{account.personName}</span>
            <button
              type="button"
              className="sc-logout"
              onClick={logout}
              disabled={busy || refreshing}
            >
              <LogOut className="size-4" aria-hidden="true" /> Salir
            </button>
          </span>
        }
      />
      <PublicShell wide>
        <nav className="sc-nav" aria-label="Secciones de Seller Center">
          <a href="#seller-resumen">
            <HandCoins className="size-4" aria-hidden="true" />
            Resumen
          </a>
          <a href="#seller-ventas">
            <Receipt className="size-4" aria-hidden="true" />
            Ventas
          </a>
          {portal.consignment && (
            <a href="#seller-stock">
              <ShoppingBag className="size-4" aria-hidden="true" />
              Mercadería
            </a>
          )}
          <a href="#seller-mermas">
            <PackageX className="size-4" aria-hidden="true" />
            Mermas
          </a>
        </nav>
        {error && (
          <p className="sc-alert" role="alert">
            {error}
          </p>
        )}
        <div className="sc-sync" role="status">
          <span>
            {online
              ? `Datos al ${dayTimeLabel(new Date(view.generatedAt))}`
              : 'Sin conexión · estos datos pueden estar desactualizados'}
          </span>
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={!online || refreshing || busy}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {refreshing ? 'Consultando…' : 'Actualizar'}
          </button>
        </div>
        <div id="seller-resumen" className="sc-anchor" />
        <PublicCard glow>
          <PublicCardHeader
            icon={<Truck className="size-5" />}
            eyebrow={`${account.supplier.name} · RUT ${account.supplier.rut}`}
            title={`Tu resumen de ${view.monthLabel}`}
            subtitle="Tus ventas, tu mercadería en bodega, tus liquidaciones y tus mermas. Solo lectura."
          />
          <div className="sc-controls">
            <form method="get" className="sc-month">
              <label htmlFor="sc-month">Mes</label>
              <select
                id="sc-month"
                name="mes"
                defaultValue={view.month}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit">Ver</button>
              </noscript>
            </form>
            {account.others.length > 0 && (
              <div className="sc-month">
                <label htmlFor="sc-company">Empresa</label>
                <select
                  id="sc-company"
                  key={account.company.name}
                  defaultValue=""
                  onChange={(event) => switchTo(event.target.value)}
                  disabled={busy || refreshing}
                >
                  <option value="">{account.company.name}</option>
                  {account.others.map((other) => (
                    <option key={other.membershipId} value={other.membershipId}>
                      {other.companyName} ({other.supplierName})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <a
              href={`/api/supplier-portal/export?mes=${view.month}`}
              className="sp-download sc-download"
              download
            >
              <Download className="size-4" aria-hidden="true" /> Descargar Excel
            </a>
          </div>
        </PublicCard>

        <ul className="sc-kpis" aria-label="Resumen del mes">
          <li>
            <Receipt className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Vendido (neto)</span>
            <strong className="sc-kpi-value">
              {formatCurrency(sales.net)}
            </strong>
            <span className="sc-kpi-note">{qty(sales.units)} unidades</span>
          </li>
          <li>
            <ShoppingBag className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">
              Comisión de {account.company.name}
            </span>
            <strong className="sc-kpi-value">
              {formatCurrency(sales.commission)}
            </strong>
          </li>
          <li>
            <HandCoins className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Te corresponde</span>
            <strong className="sc-kpi-value">
              {formatCurrency(sales.payout)}
            </strong>
            <span className="sc-kpi-note">de lo vendido en el mes</span>
          </li>
          <li>
            <PackageX className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Mermas del mes</span>
            <strong className="sc-kpi-value">{qty(losses.units)}</strong>
            {losses.yoursUnits > 0 && (
              <span className="sc-kpi-note">
                {qty(losses.yoursUnits)} a tu cargo
              </span>
            )}
          </li>
        </ul>

        <PublicCard>
          <div id="seller-ventas" className="sc-anchor" />
          <h2 className="sc-h2">Ventas de {view.monthLabel}</h2>
          <p className="sc-lead">
            Neto vendido (sin IVA, después de descuentos) en boletas y facturas
            emitidas, menos las notas de crédito, con la misma cuenta de tus
            liquidaciones.
          </p>
          <label className="sc-search">
            <Search className="size-4" aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar en mis ventas"
              placeholder="Buscar por producto o SKU"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query.trim() && (
            <p role="status" className="sc-lead">
              {salesRows.length} productos encontrados. Los totales del mes
              incluyen todos tus productos.
            </p>
          )}
          {salesRows.length === 0 ? (
            <p className="sc-empty">
              {sales.rows.length
                ? 'No hay productos que coincidan con tu búsqueda.'
                : `Sin ventas en ${view.monthLabel}.`}
            </p>
          ) : (
            <ul className="sc-rows" aria-label="Ventas por producto">
              {salesRows.map((row) => (
                <li key={row.key} className="sc-row">
                  <div className="sc-row-name">
                    <strong>{row.name}</strong>
                    {row.sku && <span>SKU {row.sku}</span>}
                  </div>
                  <dl className="sc-row-facts">
                    <div>
                      <dt>Vendido</dt>
                      <dd>{qty(row.units)}</dd>
                    </div>
                    <div>
                      <dt>Neto</dt>
                      <dd>{formatCurrency(row.net)}</dd>
                    </div>
                    <div>
                      <dt>Comisión</dt>
                      <dd>{formatCurrency(row.commission)}</dd>
                    </div>
                    <div>
                      <dt>Te corresponde</dt>
                      <dd>{formatCurrency(row.payout)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </PublicCard>

        {portal.consignment && (
          <section
            id="seller-stock"
            className="sc-stock sc-anchor"
            aria-label="Mercadería y liquidaciones"
          >
            <SellerConsignmentSection
              consignment={portal.consignment}
              companyName={account.company.name}
              showMovement
              windowDays={portal.windowDays}
              searchable
            />
          </section>
        )}

        <PublicCard>
          <div id="seller-mermas" className="sc-anchor" />
          <h2 className="sc-h2">Mermas de {view.monthLabel}</h2>
          <p className="sc-lead">
            Pérdidas de tu mercadería (vencidos, dañados, faltantes) y las que
            la tienda te asignó. Si no estás de acuerdo con una, conversa con{' '}
            {account.company.name}.
          </p>
          {losses.rows.length === 0 ? (
            <p className="sc-empty">Sin mermas en {view.monthLabel}.</p>
          ) : (
            <ul className="sc-rows" aria-label="Mermas">
              {losses.rows.map((row) => (
                <li key={row.id} className="sc-row">
                  <div className="sc-row-name">
                    <strong>{row.name}</strong>
                    <span>
                      {dayTimeLabel(new Date(row.createdAt))} · {row.reason}
                    </span>
                  </div>
                  <dl className="sc-row-facts">
                    <div>
                      <dt>Cantidad</dt>
                      <dd>
                        {qty(row.quantity)} {row.unit}
                      </dd>
                    </div>
                    {row.responsible && (
                      <div>
                        <dt>Responde</dt>
                        <dd>
                          <PublicBadge
                            tone={
                              row.responsible === 'YOU' ? 'warn' : 'neutral'
                            }
                          >
                            {RESPONSIBLE[row.responsible]}
                          </PublicBadge>
                        </dd>
                      </div>
                    )}
                    {row.evidenceUrl && (
                      <div>
                        <dt>Foto</dt>
                        <dd>
                          <a
                            href={row.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver foto
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
          {losses.truncated && (
            <p className="sc-lead">
              Se muestran las más recientes. El Excel trae las mismas.
            </p>
          )}
        </PublicCard>

        <InstallApplication />
        <PublicFooter>
          Datos al {dayTimeLabel(new Date(view.generatedAt))}. Solo lectura:
          para pedir un cambio, contacta a {account.company.name}
          {account.company.email
            ? ` (${account.company.email})`
            : account.company.phone
              ? ` (${account.company.phone})`
              : ''}
          .
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}

const STYLES = `
.sc-app .pub-backdrop { display: none; }
.sc-app .pub-card { animation: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.sc-settlements { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.8rem; }
.sc-settlements li { min-width: 0; padding: 1rem; border: 1px solid var(--pub-line); border-radius: 14px; }
.sc-settlement-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--pub-ink); }
.sc-settlements .sc-row-facts { margin-top: 0.8rem; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sc-desktop-settlements { display: none; }
@media (min-width: 640px) { .sc-settlements { display: none; } .sc-desktop-settlements { display: block; } }
.sc-app .pub-topbar { flex-wrap: wrap; align-items: flex-start; padding-top: max(0.85rem, env(safe-area-inset-top)); }
.sc-app .pub-topbar-brand { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
.sc-app .pub-topbar-right { flex: 1 1 15rem; min-width: 0; max-width: 100%; }
.sc-app .pub-eyebrow { font-size: 0.75rem; }
.sc-app .pub-shell { padding-top: 1rem; }
@media (max-width: 639px) { .sc-app .pub-card { padding: 1rem; } }
.sc-app .pub-title { font-size: clamp(1.3rem, 3vw, 2rem); }
.sc-app .pub-card-head { text-align: left; align-items: flex-start; }
.sc-nav { position: sticky; top: 0; z-index: 10; display: flex; gap: 0.2rem; padding: 0.3rem; border: 1px solid var(--pub-line); border-radius: 16px; background: var(--pub-bg); }
.sc-nav a { display: flex; flex: 1 1 0; min-width: 0; min-height: 3rem; flex-direction: column; justify-content: center; align-items: center; gap: 0.25rem; padding: 0.3rem 0; border-radius: 12px; font-size: 0.72rem; color: var(--pub-ink); text-decoration: none; }
.sc-nav a:hover, .sc-nav a:focus-visible { background: var(--pub-glass); color: var(--pub-a); }
.sc-anchor { scroll-margin-top: 5rem; }
/* minmax(0, 1fr): con una columna auto, la tabla de liquidaciones (ancho mínimo propio) ensanchaba la tarjeta más allá de la pantalla. */
.sc-stock { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; min-width: 0; }
.sc-sync { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; color: var(--pub-ink-dim); font-size: 0.78rem; }
.sc-sync button { display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid var(--pub-line); border-radius: 12px; padding: 0 1rem; min-height: 2.75rem; color: var(--pub-ink); cursor: pointer; }
.sc-sync button:disabled { opacity: 0.5; cursor: default; }
.sc-alert { padding: 1rem; border: 1px solid var(--pub-line); border-radius: 12px; color: var(--pub-danger); }
.sc-search { display: flex; min-height: 3rem; align-items: center; gap: 0.6rem; border: 1px solid var(--pub-line); border-radius: 12px; padding: 0 0.8rem; margin-top: 1rem; color: var(--pub-ink-dim); }
.sc-search input { min-width: 0; flex: 1; font: inherit; font-size: 1rem; color: var(--pub-ink); background: transparent; border: 0; padding: 0.7rem 0; }
.sc-search:focus-within { outline: 2px solid var(--pub-a); outline-offset: 2px; }
.sc-search input:focus { outline: none; }
@media (min-width: 640px) { .sc-nav a { flex-direction: row; gap: 0.5rem; font-size: 0.85rem; } }

.sc-user { width: 100%; display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.sc-user-name { flex: 1; font-size: 0.8rem; color: var(--pub-ink-dim); overflow-wrap: anywhere; min-width: 0; }
.sc-logout {
  display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2.75rem; padding: 0 0.8rem; border-radius: 999px;
  border: 1px solid var(--pub-line); background: transparent; color: var(--pub-ink); font: inherit; font-size: 0.8rem; cursor: pointer; flex-shrink: 0;
}
.sc-logout:hover { border-color: var(--pub-a); }
.sc-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.7rem; margin-top: 1.1rem; }
.sc-month { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; flex: 1 1 12rem; }
.sc-month label { font-size: 0.75rem; color: var(--pub-ink-dim); }
.sc-month select {
  height: 2.75rem; padding: 0 0.8rem; border-radius: 12px; border: 1px solid var(--pub-line); background: var(--pub-glass);
  color: var(--pub-ink); font: inherit; min-width: 0; width: 100%;
}
.sc-month select option { color: #111; }
.sc-download { flex: 0 0 auto; }
.sc-kpis { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr)); }
.sc-kpis li {
  min-width: 0; padding: 1rem; border-radius: 16px; border: 1px solid var(--pub-line); display: flex; flex-direction: column; gap: 0.3rem;
  background: linear-gradient(180deg, var(--pub-glass) 0%, var(--pub-glass-2) 100%), rgba(10,13,22,0.72); color: var(--pub-ink-dim);
}
.sc-kpis li:nth-child(3) { border-color: var(--pub-a); }
.sc-kpi-label { overflow-wrap: anywhere; font-size: 0.78rem; }
.sc-kpi-value { font-size: 1.6rem; line-height: 1.1; color: var(--pub-ink); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sc-kpi-note { font-size: 0.74rem; }
.sc-h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--pub-ink); }
.sc-section { margin: 1.4rem 0 0.2rem; }
.sc-lead { margin: 0.35rem 0 0; font-size: 0.82rem; color: var(--pub-ink-dim); }
.sc-empty { margin: 1rem 0 0.2rem; font-size: 0.85rem; color: var(--pub-ink-dim); }
.sc-rows { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0; }
.sc-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; padding: 0.75rem 0; border-top: 1px solid var(--pub-line-soft); min-width: 0; }
.sc-row-name { min-width: 0; flex: 1 1 14rem; display: flex; flex-direction: column; gap: 0.15rem; }
.sc-row-name strong { font-size: 0.92rem; overflow-wrap: anywhere; color: var(--pub-ink); }
.sc-row-name span { font-size: 0.74rem; color: var(--pub-ink-dim); overflow-wrap: anywhere; }
.sc-row-facts { margin: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; min-width: 0; }
.sc-row-facts div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.sc-row-facts dt { font-size: 0.7rem; color: var(--pub-ink-dim); }
.sc-row-facts dd { margin: 0; font-size: 0.88rem; font-variant-numeric: tabular-nums; color: var(--pub-ink); overflow-wrap: anywhere; }
.sc-row-facts a { display: inline-flex; align-items: center; min-height: 2.75rem; color: var(--pub-a); }
`;
