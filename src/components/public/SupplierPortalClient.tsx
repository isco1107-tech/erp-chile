'use client';

import { useMemo, useState } from 'react';
import { Download, PackageSearch, Truck } from 'lucide-react';
import { PublicBadge, PublicCard, PublicCardHeader, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import type { SupplierPortalRow, SupplierPortalView } from '@/modules/inventory/services/supplier-portal.service';

type Filter = 'ALL' | 'OUT' | 'LOW';

const STATUS: Record<SupplierPortalRow['status'], { tone: 'warn' | 'accent' | 'ok'; label: string }> = {
  OUT: { tone: 'warn', label: 'Sin stock' },
  LOW: { tone: 'accent', label: 'Stock bajo' },
  OK: { tone: 'ok', label: 'Normal' },
};

/** Lo urgente primero: sin stock, luego bajo mínimo, luego el resto por nombre. */
const URGENCY: Record<SupplierPortalRow['status'], number> = { OUT: 0, LOW: 1, OK: 2 };

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

function day(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Portal del proveedor (`/proveedor/[código]`): cuánto queda en bodega de CADA producto suyo,
 * con lo urgente arriba, para analizar y reponer. Solo lectura; solo cantidades.
 */
export default function SupplierPortalClient({ code, view }: { code: string; view: SupplierPortalView }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const needle = normalize(search.trim());
    return view.rows
      .filter((row) => (filter === 'ALL' ? true : row.status === filter))
      .filter((row) => !needle || normalize(`${row.name} ${row.sku} ${row.brand ?? ''}`).includes(needle))
      .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || a.name.localeCompare(b.name, 'es'));
  }, [view.rows, filter, search]);

  const { summary } = view;
  const chips: Array<{ id: Filter; label: string }> = [
    { id: 'ALL', label: `Todos (${summary.products})` },
    { id: 'OUT', label: `Sin stock (${summary.out})` },
    { id: 'LOW', label: `Stock bajo (${summary.low})` },
  ];

  return (
    <PublicPage accent="emerald">
      <style>{STYLES}</style>
      <PublicTopBar brand={view.company.name} right={<PublicBadge tone="accent">Portal de proveedores</PublicBadge>} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Truck className="size-5" />}
            eyebrow={`${view.supplier.name} · RUT ${view.supplier.rut}`}
            title="Tu inventario en bodega"
            subtitle={
              summary.products === 0
                ? 'Todavía no hay productos tuyos registrados en la bodega.'
                : summary.out + summary.low === 0
                  ? `Tus ${summary.products} productos tienen existencias suficientes.`
                  : `${summary.out > 0 ? `${summary.out} sin stock` : ''}${summary.out > 0 && summary.low > 0 ? ' y ' : ''}${summary.low > 0 ? `${summary.low} con stock bajo` : ''}: conviene reponer.`
            }
          />
          <div className="sp-toolbar">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o SKU"
              aria-label="Buscar un producto"
              className="sp-search"
              autoComplete="off"
            />
            <a href={`/proveedor/${code}/export`} className="sp-download" download>
              <Download className="size-4" aria-hidden="true" /> Descargar Excel
            </a>
          </div>
          <div className="sp-chips" role="group" aria-label="Filtrar por estado">
            {chips.map((chip) => (
              <button key={chip.id} type="button" aria-pressed={filter === chip.id} onClick={() => setFilter(chip.id)} className="sp-chip">
                {chip.label}
              </button>
            ))}
          </div>
        </PublicCard>

        {rows.length === 0 ? (
          <PublicCard>
            <div className="sp-empty">
              <PackageSearch className="size-8" aria-hidden="true" />
              <p>{summary.products === 0 ? 'Aún no hay productos para mostrar.' : 'Ningún producto coincide con lo que buscas.'}</p>
            </div>
          </PublicCard>
        ) : (
          <ul className="sp-grid">
            {rows.map((row) => (
              <li key={row.sku} className="sp-item" data-status={row.status}>
                <div className="sp-item-head">
                  <div className="sp-item-name">
                    <strong>{row.name}</strong>
                    <span>
                      SKU {row.sku}
                      {row.brand ? ` · ${row.brand}` : ''}
                    </span>
                  </div>
                  <PublicBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</PublicBadge>
                </div>

                <p className="sp-stock">
                  <span className="sp-stock-value">{qty(row.total)}</span> <span className="sp-stock-unit">{row.unit} en bodega</span>
                </p>
                {row.minStock > 0 && <p className="sp-note">Mínimo definido por la empresa: {qty(row.minStock)} {row.unit}</p>}

                {row.byWarehouse.length > 1 && (
                  <ul className="sp-wh" aria-label="Existencias por bodega">
                    {row.byWarehouse.map((entry) => (
                      <li key={entry.warehouse}>
                        <span>{entry.warehouse}</span>
                        <strong>{qty(entry.quantity)}</strong>
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="sp-facts">
                  <div>
                    <dt>Última llegada</dt>
                    <dd>{row.lastReceivedAt ? `${day(row.lastReceivedAt)}${row.lastReceivedQty ? ` · ${qty(row.lastReceivedQty)} ${row.unit}` : ''}` : '—'}</dd>
                  </div>
                  {view.showMovement && row.sold30 !== null && (
                    <>
                      <div>
                        <dt>Vendido ({view.windowDays} días)</dt>
                        <dd>{qty(row.sold30)} {row.unit}</dd>
                      </div>
                      {row.written30 !== null && row.written30 > 0 && (
                        <div>
                          <dt>Bajas ({view.windowDays} días)</dt>
                          <dd>{qty(row.written30)} {row.unit}</dd>
                        </div>
                      )}
                      {row.coverageDays !== null && (
                        <div>
                          <dt>Alcanza para</dt>
                          <dd>{row.coverageDays === 0 ? 'Sin stock' : `~${row.coverageDays} día${row.coverageDays === 1 ? '' : 's'}`}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}

        <PublicFooter>
          Existencias al {view.generatedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. Solo lectura: para pedir un cambio, contacta a {view.company.name}
          {view.company.email ? ` (${view.company.email})` : view.company.phone ? ` (${view.company.phone})` : ''}.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}

const STYLES = `
.sp-toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.1rem; }
.sp-search {
  flex: 1 1 14rem; min-width: 0; height: 2.75rem; padding: 0 0.9rem;
  border-radius: 12px; border: 1px solid var(--pub-line); background: var(--pub-glass); color: var(--pub-ink); font: inherit;
}
.sp-search::placeholder { color: var(--pub-ink-dim); }
.sp-search:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 1px; }
.sp-download {
  display: inline-flex; align-items: center; gap: 0.4rem; height: 2.75rem; padding: 0 1rem; border-radius: 12px;
  border: 1px solid var(--pub-line); color: var(--pub-ink); text-decoration: none; font-size: 0.85rem; font-weight: 600;
}
.sp-download:hover { border-color: var(--pub-a); }
.sp-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.8rem; }
.sp-chip {
  min-height: 2.25rem; padding: 0 0.85rem; border-radius: 999px; border: 1px solid var(--pub-line); background: transparent;
  color: var(--pub-ink-dim); font: inherit; font-size: 0.8rem; cursor: pointer;
}
.sp-chip[aria-pressed="true"] { background: linear-gradient(135deg, var(--pub-a), var(--pub-b)); color: var(--pub-on-accent); border-color: transparent; font-weight: 600; }
.sp-grid { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); }
.sp-item {
  min-width: 0; padding: 1rem; border-radius: 16px; border: 1px solid var(--pub-line);
  background: linear-gradient(180deg, var(--pub-glass) 0%, var(--pub-glass-2) 100%), rgba(10,13,22,0.72);
}
.sp-item[data-status="OUT"] { border-color: color-mix(in oklab, var(--pub-danger) 55%, transparent); }
.sp-item[data-status="LOW"] { border-color: color-mix(in oklab, var(--pub-a) 55%, transparent); }
.sp-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; }
.sp-item-name { min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.sp-item-name strong { font-size: 0.98rem; line-height: 1.25; overflow-wrap: anywhere; }
.sp-item-name span { font-size: 0.74rem; color: var(--pub-ink-dim); overflow-wrap: anywhere; }
.sp-stock { margin: 0.7rem 0 0; display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
.sp-stock-value { font-size: 1.9rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.sp-stock-unit { font-size: 0.82rem; color: var(--pub-ink-dim); }
.sp-note { margin: 0.25rem 0 0; font-size: 0.74rem; color: var(--pub-ink-dim); }
.sp-wh { list-style: none; margin: 0.7rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.sp-wh li { display: inline-flex; gap: 0.4rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--pub-line-soft); font-size: 0.75rem; color: var(--pub-ink-dim); }
.sp-wh strong { color: var(--pub-ink); font-variant-numeric: tabular-nums; }
.sp-facts { margin: 0.8rem 0 0; display: grid; gap: 0.35rem; }
.sp-facts div { display: flex; justify-content: space-between; gap: 0.8rem; font-size: 0.8rem; border-top: 1px solid var(--pub-line-soft); padding-top: 0.35rem; }
.sp-facts dt { color: var(--pub-ink-dim); }
.sp-facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.sp-empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.2rem 0; color: var(--pub-ink-dim); text-align: center; }
`;
