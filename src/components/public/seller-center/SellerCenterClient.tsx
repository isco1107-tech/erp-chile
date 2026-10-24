'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, HandCoins, LogOut, PackageX, Receipt, ShoppingBag, Truck } from 'lucide-react';
import { PublicBadge, PublicCard, PublicCardHeader, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import SellerConsignmentSection from '@/components/public/SellerConsignmentSection';
import { PORTAL_STYLES } from '@/components/public/portal-styles';
import { formatCurrency } from '@/lib/chile/tax';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import type { SellerCenterView, LossResponsible } from '@/modules/inventory/services/seller-center-view.service';

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

const RESPONSIBLE: Record<LossResponsible, string> = { YOU: 'A tu cargo', STORE: 'La tienda', UNASSIGNED: 'Sin asignar', OTHER: 'Otro responsable' };

export interface SellerCenterAccountView {
  personName: string;
  company: { name: string; email: string | null; phone: string | null };
  supplier: { name: string; rut: string };
  others: Array<{ membershipId: string; companyName: string; supplierName: string }>;
}

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
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
export default function SellerCenterClient({ account, view, months }: { account: SellerCenterAccountView; view: SellerCenterView; months: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { sales, portal, losses } = view;

  async function logout() {
    setBusy(true);
    await post('/api/supplier-portal/logout', {});
    router.replace('/proveedor/cuenta/ingresar');
  }

  async function switchTo(membershipId: string) {
    if (!membershipId) return;
    setBusy(true);
    if (await post('/api/supplier-portal/switch', { membershipId })) {
      router.refresh();
      setBusy(false);
    } else setBusy(false);
  }

  return (
    <PublicPage accent="emerald">
      <style>{PORTAL_STYLES}</style>
      <style>{STYLES}</style>
      <PublicTopBar
        brand={account.company.name}
        right={
          <span className="sc-user">
            <span className="sc-user-name">{account.personName}</span>
            <button type="button" className="sc-logout" onClick={logout} disabled={busy}>
              <LogOut className="size-4" aria-hidden="true" /> Salir
            </button>
          </span>
        }
      />
      <PublicShell wide>
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
              <select id="sc-month" name="mes" defaultValue={view.month} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
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
                <select id="sc-company" key={account.company.name} defaultValue="" onChange={(event) => switchTo(event.target.value)} disabled={busy}>
                  <option value="">{account.company.name}</option>
                  {account.others.map((other) => (
                    <option key={other.membershipId} value={other.membershipId}>
                      {other.companyName} ({other.supplierName})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <a href={`/api/supplier-portal/export?mes=${view.month}`} className="sp-download sc-download" download>
              <Download className="size-4" aria-hidden="true" /> Descargar Excel
            </a>
          </div>
        </PublicCard>

        <ul className="sc-kpis" aria-label="Resumen del mes">
          <li>
            <Receipt className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Vendido (neto)</span>
            <strong className="sc-kpi-value">{formatCurrency(sales.net)}</strong>
            <span className="sc-kpi-note">{qty(sales.units)} unidades</span>
          </li>
          <li>
            <ShoppingBag className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Comisión de {account.company.name}</span>
            <strong className="sc-kpi-value">{formatCurrency(sales.commission)}</strong>
          </li>
          <li>
            <HandCoins className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Te corresponde</span>
            <strong className="sc-kpi-value">{formatCurrency(sales.payout)}</strong>
            <span className="sc-kpi-note">de lo vendido en el mes</span>
          </li>
          <li>
            <PackageX className="size-5" aria-hidden="true" />
            <span className="sc-kpi-label">Mermas del mes</span>
            <strong className="sc-kpi-value">{qty(losses.units)}</strong>
            {losses.yoursUnits > 0 && <span className="sc-kpi-note">{qty(losses.yoursUnits)} a tu cargo</span>}
          </li>
        </ul>

        <PublicCard>
          <h2 className="sc-h2">Ventas de {view.monthLabel}</h2>
          <p className="sc-lead">Neto vendido (sin IVA, después de descuentos) en boletas y facturas emitidas, menos las notas de crédito, con la misma cuenta de tus liquidaciones.</p>
          {sales.rows.length === 0 ? (
            <p className="sc-empty">Sin ventas en {view.monthLabel}.</p>
          ) : (
            <ul className="sc-rows" aria-label="Ventas por producto">
              {sales.rows.map((row) => (
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

        {portal.consignment && <SellerConsignmentSection consignment={portal.consignment} companyName={account.company.name} showMovement windowDays={portal.windowDays} />}

        <PublicCard>
          <h2 className="sc-h2">Mermas de {view.monthLabel}</h2>
          <p className="sc-lead">Pérdidas de tu mercadería (vencidos, dañados, faltantes) y las que la tienda te asignó. Si no estás de acuerdo con una, conversa con {account.company.name}.</p>
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
                          <PublicBadge tone={row.responsible === 'YOU' ? 'warn' : 'neutral'}>{RESPONSIBLE[row.responsible]}</PublicBadge>
                        </dd>
                      </div>
                    )}
                    {row.evidenceUrl && (
                      <div>
                        <dt>Foto</dt>
                        <dd>
                          <a href={row.evidenceUrl} target="_blank" rel="noopener noreferrer">
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
          {losses.truncated && <p className="sc-lead">Se muestran las más recientes. El Excel trae las mismas.</p>}
        </PublicCard>

        <PublicFooter>
          Datos al {dayTimeLabel(new Date(view.generatedAt))}. Solo lectura: para pedir un cambio, contacta a {account.company.name}
          {account.company.email ? ` (${account.company.email})` : account.company.phone ? ` (${account.company.phone})` : ''}.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}

const STYLES = `
.sc-user { display: inline-flex; align-items: center; gap: 0.6rem; min-width: 0; }
.sc-user-name { font-size: 0.8rem; color: var(--pub-ink-dim); overflow-wrap: anywhere; min-width: 0; }
.sc-logout {
  display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2.25rem; padding: 0 0.8rem; border-radius: 999px;
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
.sc-kpi-label { font-size: 0.78rem; }
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
.sc-row-facts a { color: var(--pub-a); }
`;
