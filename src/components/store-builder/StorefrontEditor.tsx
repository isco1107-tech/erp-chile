'use client';

import Link from 'next/link';
import { Package, ShoppingBag, Truck, Wallet } from 'lucide-react';
import WebSiteEditor from '@/components/web-sites/WebSiteEditor';
import { StoreEditorProvider } from './StoreEditorProvider';
import type { ComponentProps } from 'react';

export default function StorefrontEditor(props: ComponentProps<typeof WebSiteEditor>) {
  const links = [
    { tab: 'products', name: 'Productos y colecciones', Icon: Package },
    { tab: 'orders', name: 'Pedidos', Icon: ShoppingBag },
    { tab: 'shipping', name: 'Envíos', Icon: Truck },
    { tab: 'payments', name: 'Pagos', Icon: Wallet },
  ];
  return (
    <StoreEditorProvider siteId={props.site.id}>
      <section aria-label="Centro de creación Ecommerce" className="mb-6 rounded-2xl border border-primary/20 bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tu marca, tu tienda</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Diseña para contar tu historia. Configura para vender.</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Crea páginas, colecciones y campañas con el editor visual. Los productos se compran desde tu catálogo y cada pedido llega al ERP. Publicar las
              páginas de marca y abrir las compras son pasos independientes.
            </p>
          </div>
        </div>
        <nav aria-label="Operación de mi Ecommerce" className="mt-5 flex flex-wrap gap-2">
          {links.map(({ tab, name, Icon }) => (
            <Link
              key={tab}
              href={`/dashboard/store?sitio=${props.site.id}&tab=${tab}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <Icon className="size-4" />
              {name}
            </Link>
          ))}
        </nav>
      </section>
      <WebSiteEditor {...props} />
    </StoreEditorProvider>
  );
}
