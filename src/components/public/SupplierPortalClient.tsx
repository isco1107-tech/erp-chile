'use client';

import { useMemo, useState } from 'react';
import { Download, PackageSearch, Truck } from 'lucide-react';
import { PublicBadge, PublicCard, PublicCardHeader, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import PortalProductCard from '@/components/public/PortalProductCard';
import { URGENCY } from '@/components/public/portal-format';
import SellerConsignmentSection from '@/components/public/SellerConsignmentSection';
import { PORTAL_STYLES } from '@/components/public/portal-styles';
import type { SupplierPortalView } from '@/modules/inventory/services/supplier-portal.service';
import { santiagoDateTimeLabel } from '@/lib/chile/timezone';

type Filter = 'ALL' | 'OUT' | 'LOW';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Portal del proveedor (`/proveedor/[código]`): cuánto queda en bodega de CADA producto suyo,
 * con lo urgente arriba, para analizar y reponer. Solo lectura; solo cantidades. Si el contacto es
 * un seller de consignación, además ve su mercadería, lo vendido sin liquidar y sus liquidaciones.
 */
export default function SupplierPortalClient({ code, view }: { code: string; view: SupplierPortalView }) {
  // Un seller que no surte como proveedor ve solo su consignación; si además es proveedor, ve las dos cosas.
  const showSupplier = view.rows.length > 0 || !view.consignment;
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

  const subtitle = !showSupplier
    ? 'Aquí ves tu mercadería en consignación, lo vendido y tus liquidaciones.'
    : summary.products === 0
      ? 'Todavía no hay productos tuyos registrados en la bodega.'
      : summary.out + summary.low === 0
        ? `Tus ${summary.products} productos tienen existencias suficientes.`
        : `${summary.out > 0 ? `${summary.out} sin stock` : ''}${summary.out > 0 && summary.low > 0 ? ' y ' : ''}${summary.low > 0 ? `${summary.low} con stock bajo` : ''}: conviene reponer.`;

  return (
    <PublicPage accent="emerald">
      <style>{PORTAL_STYLES}</style>
      <PublicTopBar brand={view.company.name} right={<PublicBadge tone="accent">{view.consignment && !showSupplier ? 'Portal de sellers' : 'Portal de proveedores'}</PublicBadge>} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Truck className="size-5" />}
            eyebrow={`${view.supplier.name} · RUT ${view.supplier.rut}`}
            title={showSupplier ? 'Tu inventario en bodega' : 'Tu mercadería en bodega'}
            subtitle={subtitle}
          />
          <div className="sp-toolbar">
            {showSupplier && (
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o SKU"
                aria-label="Buscar un producto"
                className="sp-search"
                autoComplete="off"
              />
            )}
            <a href={`/proveedor/${code}/export`} className="sp-download" download>
              <Download className="size-4" aria-hidden="true" /> Descargar Excel
            </a>
          </div>
          {showSupplier && (
            <div className="sp-chips" role="group" aria-label="Filtrar por estado">
              {chips.map((chip) => (
                <button key={chip.id} type="button" aria-pressed={filter === chip.id} onClick={() => setFilter(chip.id)} className="sp-chip">
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </PublicCard>

        {showSupplier &&
          (rows.length === 0 ? (
            <PublicCard>
              <div className="sp-empty">
                <PackageSearch className="size-8" aria-hidden="true" />
                <p>{summary.products === 0 ? 'Aún no hay productos para mostrar.' : 'Ningún producto coincide con lo que buscas.'}</p>
              </div>
            </PublicCard>
          ) : (
            <ul className="sp-grid">
              {rows.map((row) => (
                <PortalProductCard key={row.sku} row={row} showMovement={view.showMovement} windowDays={view.windowDays} />
              ))}
            </ul>
          ))}

        {view.consignment && <SellerConsignmentSection consignment={view.consignment} companyName={view.company.name} showMovement={view.showMovement} windowDays={view.windowDays} />}

        <PublicFooter>
          Existencias al {santiagoDateTimeLabel(view.generatedAt)}. Solo lectura: para pedir un cambio, contacta a {view.company.name}
          {view.company.email ? ` (${view.company.email})` : view.company.phone ? ` (${view.company.phone})` : ''}.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}
