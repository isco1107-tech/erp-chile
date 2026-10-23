'use client';
import { useEffect, useId, useState } from 'react';
import { useEditorRuntime } from '@/components/web-sites/EditorRuntime';
import type { previewStoreProductsAction } from '@/modules/ecommerce/actions/store-editor.actions';
import type { BlockOf } from '@/lib/web-sites/blocks';
import type { FieldsProps } from '@/components/web-sites/block-fields-shared';
import { SwitchRow, TextField, ChoiceGroup } from '@/components/web-sites/fields';
export default function StoreCatalogFields({ block, disabled, onChange }: FieldsProps<BlockOf<'catalog'>>) {
  const { siteId } = useEditorRuntime();
  const collectionId = useId();
  const [collections, setCollections] = useState<Array<{ name: string; count: number }>>([]);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    void fetch(`/api/store/design-products?${new URLSearchParams({ siteId, limit: '1' })}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.json() as Promise<Awaited<ReturnType<typeof previewStoreProductsAction>>>)
      .then((result) => {
        if (result.success) setCollections(result.data.collections);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [siteId]);
  const source = block.store ?? { collection: '', featuredOnly: false, limit: 8 };
  const patch = (values: Partial<typeof source>) => onChange({ ...block, items: [], store: { ...source, ...values } });
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <strong>Productos del ERP con carrito</strong>
        <p className="mt-1 text-muted-foreground">
          Elige qué mostrar aquí. Las fotos, precios y disponibilidad se actualizan desde Productos; cada compra sigue el mismo motor del ERP.
        </p>
      </div>
      <TextField label="Título de la sección" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} max={120} disabled={disabled} />
      <TextField
        label="Introducción (opcional)"
        value={block.intro}
        onChange={(intro) => onChange({ ...block, intro })}
        max={300}
        disabled={disabled}
        multiline
      />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={collectionId}>
          Colección de productos
        </label>
        <select
          id={collectionId}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={source.collection}
          disabled={disabled}
          onChange={(event) => patch({ collection: event.target.value })}
        >
          <option value="">Todo el catálogo publicado</option>
          {source.collection && !collections.some((item) => item.name === source.collection) && (
            <option value={source.collection}>{source.collection} (sin productos publicados)</option>
          )}
          {collections.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Organiza tus colecciones desde Productos en la administración de la tienda.</p>
      </div>
      <SwitchRow
        label="Mostrar solo productos destacados"
        checked={source.featuredOnly}
        onChange={(featuredOnly) => patch({ featuredOnly })}
        disabled={disabled}
      />
      <ChoiceGroup
        label="Productos a mostrar"
        value={String(source.limit)}
        onChange={(value) => patch({ limit: Number(value) })}
        disabled={disabled}
        options={['4', '8', '12', '24'].map((value) => ({ value, label: value }))}
      />
      <ChoiceGroup
        label="Productos por fila"
        value={block.columns}
        onChange={(columns) => onChange({ ...block, columns })}
        disabled={disabled}
        options={(['2', '3', '4'] as const).map((value) => ({ value, label: value }))}
      />
    </div>
  );
}
