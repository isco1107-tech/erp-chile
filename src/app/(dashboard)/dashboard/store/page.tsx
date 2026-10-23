import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import StoreAdminClient, { type StoreTab } from '@/components/store-admin/StoreAdminClient';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { getStoreStats } from '@/modules/ecommerce/services/store-orders.service';
import { getStoreReadiness, getStoreSettings, listStoreSites, listStoreWarehouses } from '@/modules/ecommerce/services/store-settings.service';

export const metadata = { title: 'Tienda en línea' };

const TABS: readonly StoreTab[] = ['orders', 'products', 'shipping', 'payments', 'settings'];

export default async function StorePage({ searchParams }: { searchParams: Promise<{ sitio?: string | string[]; tab?: string | string[] }> }) {
  const access = await checkPageAccess('store:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const context = access.context;
  // La tienda vive dentro de un sitio web: sin ese módulo no hay dónde montarla.
  if (!context.features.hasWebSites) return <PageAccessNotice denied="module" />;

  const { sitio, tab } = await searchParams;
  const sites = await listStoreSites(context.companyId);

  const header = (
    <PageHeader
      eyebrow="Sitios web"
      title="Tienda en línea"
      description="Vende por internet desde tu sitio: catálogo con el inventario real, carrito, pago con Khipu o Webpay, despacho o retiro, y cada venta queda en Ventas, Bodega y Contabilidad sin digitar nada."
    />
  );

  if (sites.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="Primero necesitas un sitio web"
          description="La tienda vive dentro de un sitio armado con el constructor guiado. Crea uno y vuelve acá para publicar tus productos."
          action={
            can(context, 'websites:write') ? (
              <Link href="/dashboard/web-sites/new" className={buttonVariants()}>
                Crear un sitio web
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const wanted = typeof sitio === 'string' ? sitio : undefined;
  const selected = sites.find((entry) => entry.id === wanted) ?? sites.find((entry) => entry.open) ?? sites.find((entry) => entry.hasStore) ?? sites[0]!;
  const [settings, stats, warehouses] = await Promise.all([getStoreSettings(context.companyId, selected.id), getStoreStats(context.companyId, selected.id), listStoreWarehouses(context.companyId)]);
  const readiness = await getStoreReadiness(context.companyId, selected.id, settings);
  const initialTab = (TABS as readonly string[]).includes(typeof tab === 'string' ? tab : '') ? (tab as StoreTab) : 'orders';

  return (
    <div className="space-y-6">
      {header}
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
        canUploadImages={can(context, 'websites:write')}
        initialTab={initialTab}
      />
    </div>
  );
}
