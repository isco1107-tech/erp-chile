import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import CreateStorefront from '@/components/store-admin/CreateStorefront';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import StoreAdminClient, { type StoreTab } from '@/components/store-admin/StoreAdminClient';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { getStoreStats } from '@/modules/ecommerce/services/store-orders.service';
import { getStoreReadiness, getStoreSettings, listStoreSites, listStoreWarehouses } from '@/modules/ecommerce/services/store-settings.service';

export const metadata = { title: 'Tienda en línea' };

const TABS: readonly StoreTab[] = ['orders', 'products', 'shipping', 'payments', 'settings', 'brand'];

export default async function StorePage({ searchParams }: { searchParams: Promise<{ sitio?: string | string[]; tab?: string | string[] }> }) {
  const access = await checkPageAccess('store:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const context = access.context;

  const { sitio, tab } = await searchParams;
  const sites = await listStoreSites(context.companyId);

  const header = (
    <PageHeader
      eyebrow="Ecommerce"
      title="Tienda en línea"
      description="Tu tienda, tus pedidos y tu inventario en un mismo lugar. Publica productos, cobra y prepara cada entrega desde el ERP."
    />
  );

  if (sites.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        {can(context, 'store:manage') ? (
          <CreateStorefront />
        ) : (
          <p className="text-sm text-muted-foreground">Pide al administrador que cree tu primera tienda.</p>
        )}
      </div>
    );
  }

  const wanted = typeof sitio === 'string' ? sitio : undefined;
  const selected = sites.find((entry) => entry.id === wanted) ?? sites.find((entry) => entry.open) ?? sites.find((entry) => entry.hasStore) ?? sites[0]!;
  const [settings, stats, warehouses] = await Promise.all([
    getStoreSettings(context.companyId, selected.id),
    getStoreStats(context.companyId, selected.id),
    listStoreWarehouses(context.companyId),
  ]);
  const readiness = await getStoreReadiness(context.companyId, selected.id, settings);
  const initialTab = (TABS as readonly string[]).includes(typeof tab === 'string' ? tab : '') ? (tab as StoreTab) : 'orders';

  return (
    <div className="space-y-6">
      {header}
      {can(context, 'store:manage') && <CreateStorefront compact />}
      {selected.standalone && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-card p-5">
          <div>
            <h2 className="font-semibold">Creador de tu tienda y páginas de marca</h2>
            <p className="mt-1 text-sm text-muted-foreground">Portada, páginas, secciones de productos con carrito, diseño, formularios y dominio.</p>
          </div>
          <Link
            href={`/dashboard/store/${selected.id}/editor`}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 font-medium text-primary-foreground"
          >
            Diseñar mi tienda
          </Link>
        </section>
      )}
      <StoreAdminClient
        key={selected.id}
        sites={sites}
        siteId={selected.id}
        initialSettings={settings}
        initialReadiness={readiness}
        initialStats={stats}
        warehouses={warehouses}
        canWrite={can(context, 'store:write')}
        canFulfill={can(context, 'store:fulfill')}
        canManage={can(context, 'store:manage')}
        canUploadImages={can(context, 'store:write')}
        initialTab={initialTab}
      />
    </div>
  );
}
