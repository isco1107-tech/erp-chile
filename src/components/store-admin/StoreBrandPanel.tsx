'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readableOn } from '@/lib/web-sites/theme';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/web-sites/ImageUploader';
import DomainPanel from '@/components/hosting/DomainPanel';
import {
  getStoreBrandAction,
  updateStoreBrandAction,
  getStoreDomainAction,
  setStoreDomainAction,
  removeStoreDomainAction,
} from '@/modules/ecommerce/actions/store-workspace.actions';
import type { StoreBrand } from '@/modules/ecommerce/services/store-workspace.service';

export default function StoreBrandPanel({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const [brand, setBrand] = useState<StoreBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getStoreBrandAction(siteId)
      .then((result) => {
        if (active) {
          if (result.success) setBrand(result.data);
          else setError(result.error);
        }
      })
      .catch(() => {
        if (active) setError('No pudimos cargar tu diseño.');
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
  const patch = (value: Partial<StoreBrand>) => setBrand((current) => (current ? { ...current, ...value } : current));
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Una tienda con tu identidad</h2>
        <p className="mt-1 text-sm text-muted-foreground">El diseño se adapta a tus colores, tus productos y cada pantalla.</p>
        {!brand.standalone ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Esta tienda se creó dentro de un sitio existente. Su nombre, logo y colores se editan desde el constructor de ese sitio.
          </p>
        ) : (
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const result = await updateStoreBrandAction(siteId, brand);
                if (result.success) {
                  setBrand(result.data);
                  toast.success('Identidad de la tienda actualizada');
                } else setError(result.error);
              } catch {
                setError('No pudimos guardar el diseño. Inténtalo de nuevo.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="brand-name">Nombre de tu marca</Label>
              <Input
                id="brand-name"
                value={brand.name}
                maxLength={80}
                required
                disabled={!canManage || busy}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-description">Presentación breve</Label>
              <Input
                id="brand-description"
                value={brand.description}
                maxLength={200}
                disabled={!canManage || busy}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-primary">Color principal</Label>
              <Input id="brand-primary" type="color" value={brand.primary} disabled={!canManage || busy} onChange={(e) => patch({ primary: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-accent">Color de acento</Label>
              <Input id="brand-accent" type="color" value={brand.accent} disabled={!canManage || busy} onChange={(e) => patch({ accent: e.target.value })} />
            </div>
            {canManage && (
              <div className="sm:col-span-2">
                <Label>Logo de la tienda</Label>
                <ImageUploader
                  siteId={siteId}
                  uploadEndpoint="/api/store/asset-upload"
                  multiple={false}
                  disabled={busy}
                  onUploaded={(asset) => patch({ logoUrl: asset.url })}
                />
                {brand.logoUrl && (
                  <Button type="button" variant="ghost" onClick={() => patch({ logoUrl: '' })}>
                    Usar solo el nombre de mi marca
                  </Button>
                )}
              </div>
            )}
            <div className="rounded-xl border border-border p-5 sm:col-span-2" style={{ background: brand.primary, color: readableOn(brand.primary) }}>
              <p className="text-lg font-semibold">{brand.name}</p>
              <p className="mt-2 text-sm">{brand.description || 'Tus productos, una experiencia de compra clara.'}</p>
              <span className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">Ver colección</span>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            {canManage && (
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar identidad'}
                </Button>
              </div>
            )}
          </form>
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
