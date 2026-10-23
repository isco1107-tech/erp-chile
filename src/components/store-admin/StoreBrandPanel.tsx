'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DomainPanel from '@/components/hosting/DomainPanel';
import { getStoreBrandAction, getStoreDomainAction, setStoreDomainAction, removeStoreDomainAction } from '@/modules/ecommerce/actions/store-workspace.actions';
import type { StoreBrand } from '@/modules/ecommerce/services/store-workspace.service';

export default function StoreBrandPanel({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const [brand, setBrand] = useState<StoreBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getStoreBrandAction(siteId)
      .then((result) => {
        if (!active) return;
        if (result.success) setBrand(result.data);
        else setError(result.error);
      })
      .catch(() => {
        if (active) setError('No pudimos cargar la identidad de tu tienda.');
      });
    return () => {
      active = false;
    };
  }, [siteId]);
  if (!brand)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {error ?? 'Cargando la identidad de tu tienda…'}
      </p>
    );
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-primary/25 bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tu marca, tu tienda</p>
        <h2 className="mt-2 text-xl font-semibold">Creador completo de tu Ecommerce</h2>
        {brand.standalone ? (
          <>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Diseña la portada, crea páginas de marca, agrega productos con carrito, formularios, galerías y campañas. Personaliza encabezado, pie, colores y
              tipografías con vista previa de cada dispositivo.
            </p>
            <Link
              href={`/dashboard/store/${siteId}/editor`}
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 font-medium text-primary-foreground"
            >
              Abrir creador de mi tienda
            </Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Esta tienda está adjunta a un sitio anterior. Conserva su diseño en el constructor de Sitios web. Las nuevas tiendas de Ecommerce tienen su propio
            creador de páginas de marca.
          </p>
        )}
      </section>
      {canManage && (
        <DomainPanel
          idPrefix="store-domain"
          canPublish
          initialDomain={brand.domain}
          platformUrl={brand.platformUrl}
          example="mitienda.cl"
          load={() => getStoreDomainAction(siteId)}
          save={(domain) => setStoreDomainAction(siteId, domain)}
          remove={() => removeStoreDomainAction(siteId)}
        />
      )}
    </div>
  );
}
