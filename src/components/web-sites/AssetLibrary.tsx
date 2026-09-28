'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { deleteWebSiteAssetAction, updateWebSiteAssetAltAction } from '@/modules/web-sites/actions/web-sites.actions';
import { ImageUploader } from './ImageUploader';
import { copyText, formatBytes, useEditorAssets, type EditorAsset } from './editor-shared';

interface AssetLibraryProps {
  /** ¿Esta imagen está en uso en el contenido actual (aunque no se haya guardado)? */
  isUsed: (url: string) => boolean;
  onAltSaved: (assetId: string, alt: string) => void;
  onDeleted: (assetId: string) => void;
}

function AssetCard({ asset, canWrite, used, onAltSaved, onDeleted }: { asset: EditorAsset; canWrite: boolean; used: boolean; onAltSaved: (alt: string) => void; onDeleted: () => void }) {
  const confirm = useConfirm();
  const [alt, setAlt] = useState(asset.alt);
  const [savingAlt, setSavingAlt] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputId = `asset-alt-${asset.id}`;

  async function saveAlt() {
    const next = alt.trim();
    if (next === asset.alt || savingAlt) return;
    setSavingAlt(true);
    setMessage(null);
    try {
      const result = await updateWebSiteAssetAltAction(asset.id, { alt: next });
      if (result.success) {
        setAlt(next);
        onAltSaved(next);
      } else {
        setMessage(result.error);
      }
    } finally {
      setSavingAlt(false);
    }
  }

  async function remove() {
    setMessage(null);
    if (used) {
      setMessage('Esta imagen se usa en tu sitio. Quítala de las secciones (o del logo) antes de eliminarla.');
      return;
    }
    const ok = await confirm({ title: `¿Eliminar "${asset.fileName}"?`, description: 'Se borra de la biblioteca y del almacenamiento. No se puede deshacer.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await deleteWebSiteAssetAction(asset.id);
      if (result.success) {
        toast.success(result.message ?? 'Imagen eliminada');
        onDeleted();
      } else {
        // Incluye el caso "la imagen se usa en el sitio publicado": el mensaje del servidor dice qué hacer.
        setMessage(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="aspect-video bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safeImageSrc(asset.url) ?? undefined} alt={asset.alt} className="size-full object-cover" loading="lazy" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={asset.fileName}>
            {asset.fileName}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {formatBytes(asset.sizeBytes)}
            {used ? <StatusBadge tone="info">En uso</StatusBadge> : null}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={inputId}>Descripción</Label>
          <Input
            id={inputId}
            value={alt}
            maxLength={160}
            disabled={!canWrite || savingAlt}
            placeholder="Describe lo que se ve"
            aria-describedby={`${inputId}-hint`}
            onChange={(event) => setAlt(event.target.value)}
            onBlur={() => void saveAlt()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {savingAlt ? 'Guardando…' : !alt.trim() ? 'Sin descripción: agrégala para lectores de pantalla y Google. Se guarda al salir del campo.' : 'Se guarda al salir del campo.'}
          </p>
        </div>
        {message ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {message}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" aria-label={`Copiar dirección de ${asset.fileName}`} onClick={() => void copyText(asset.url)}>
            <Copy aria-hidden="true" /> Copiar dirección
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={!canWrite || deleting} aria-label={`Eliminar ${asset.fileName}`} onClick={() => void remove()}>
            <Trash2 aria-hidden="true" /> Eliminar
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Pestaña Imágenes: biblioteca del sitio (miniaturas, descripción editable, copiar dirección, eliminar) y subida múltiple. */
export function AssetLibrary({ isUsed, onAltSaved, onDeleted }: AssetLibraryProps) {
  const { siteId, assets, readOnly, addAsset } = useEditorAssets();
  return (
    <div className="space-y-6">
      <section aria-label="Subir imágenes" className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div>
          <h2 className="text-sm font-semibold">Subir imágenes</h2>
          <p className="text-xs text-muted-foreground">Puedes subir varias a la vez. Después las eliges en cada sección, en el logo o las copias para tu HTML.</p>
        </div>
        <ImageUploader siteId={siteId} disabled={readOnly} onUploaded={addAsset} />
      </section>

      <section aria-label="Biblioteca de imágenes" className="space-y-3">
        <h2 className="text-sm font-semibold">
          Biblioteca <span className="font-normal text-muted-foreground">({assets.length})</span>
        </h2>
        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card">
            <EmptyState
              icon={<ImagePlus className="size-10 text-muted-foreground/60" aria-hidden="true" />}
              title="Todavía no hay imágenes"
              description="Sube fotos propias y nítidas: un sitio con imágenes se ve más profesional y genera más confianza."
            />
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} canWrite={!readOnly} used={isUsed(asset.url)} onAltSaved={(alt) => onAltSaved(asset.id, alt)} onDeleted={() => onDeleted(asset.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
