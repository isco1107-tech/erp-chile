'use client';

import { Download, Truck } from 'lucide-react';
import { PublicBadge, PublicCard, PublicCardHeader, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import SupplierInventoryGrid from '@/components/public/SupplierInventoryGrid';
import type { SupplierPortalView } from '@/modules/inventory/services/supplier-portal.service';

/**
 * Portal del proveedor (`/proveedor/[código]`): cuánto queda en bodega de CADA producto suyo,
 * con lo urgente arriba, para analizar y reponer. Solo lectura; solo cantidades.
 */
export default function SupplierPortalClient({ code, view }: { code: string; view: SupplierPortalView }) {
  const { summary } = view;

  return (
    <PublicPage accent="emerald">
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
        </PublicCard>

        <SupplierInventoryGrid
          rows={view.rows}
          summary={summary}
          showMovement={view.showMovement}
          windowDays={view.windowDays}
          actions={
            <a href={`/proveedor/${code}/export`} className="sp-download" download>
              <Download className="size-4" aria-hidden="true" /> Descargar Excel
            </a>
          }
        />

        <PublicFooter>
          Existencias al {view.generatedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}. Solo lectura: para pedir un cambio, contacta a {view.company.name}
          {view.company.email ? ` (${view.company.email})` : view.company.phone ? ` (${view.company.phone})` : ''}.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}
