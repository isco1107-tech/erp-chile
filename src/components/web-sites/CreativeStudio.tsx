'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { creativeSiteSchema, type CreativeSite } from '@/lib/web-sites/creative';
import { documentFromBlocks, homeOf } from '@/lib/web-sites/site';
import { blockImageUrls } from '@/lib/web-sites/blocks';
import { GuidedEditor } from './GuidedEditor';
import { ThemePanel } from './ThemePanel';
import { SwitchRow } from './fields';
import { EditorAssetsContext, type EditorAsset } from './editor-shared';
import SiteRenderer from './SiteRenderer';
import { SiteDesignAssistant } from './SiteDesignAssistant';

interface Props {
  target: 'academy' | 'event';
  resourceId: string;
  name: string;
  value?: CreativeSite;
  disabled: boolean;
  images: string[];
  onChange: (design: CreativeSite) => void;
}

/** Un solo editor y renderizador compartido con el constructor de sitios generales. */
export function CreativeStudio({ target, resourceId, name, value, disabled, images, onChange }: Props) {
  const design = value ?? creativeSiteSchema.parse({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [uploaded, setUploaded] = useState<EditorAsset[]>([]);
  const [past, setPast] = useState<CreativeSite[]>([]);
  const [future, setFuture] = useState<CreativeSite[]>([]);
  const doc = useMemo(() => documentFromBlocks(design.blocks, design.theme), [design.blocks, design.theme]);
  const page = homeOf(doc);
  function change(next: CreativeSite) {
    if (disabled) return;
    setPast((previous) => [...previous.slice(-29), structuredClone(design)]); setFuture([]);
    onChange(next);
  }
  const urls = [...new Set([...images, ...design.blocks.flatMap(blockImageUrls)])].filter(Boolean);
  const assets: EditorAsset[] = [...urls.map((url, i) => ({ id: `existing-${i}`, url, fileName: `Imagen ${i + 1}`, mimeType: 'image/webp', sizeBytes: 0, alt: '' })), ...uploaded.filter((asset) => !urls.includes(asset.url))];
  async function uploadAsset(file: File, alt = '') {
    const body = new FormData(); body.append('file', file); body.append('purpose', target === 'academy' ? 'card' : 'studio');
    if (target === 'event') body.append('projectId', resourceId);
    try {
      const response = await fetch(target === 'academy' ? '/api/academy/site-upload' : '/api/projects/cover-upload', { method: 'POST', body });
      const json: { success: boolean; data?: { url: string }; error?: string } = await response.json();
      if (!response.ok || !json.success || !json.data) return { ok: false as const, error: json.error ?? 'No se pudo subir la imagen' };
      return { ok: true as const, asset: { id: crypto.randomUUID(), url: json.data.url, fileName: file.name, mimeType: file.type, sizeBytes: file.size, alt } };
    } catch { return { ok: false as const, error: 'No se pudo conectar con el almacenamiento. Intenta nuevamente.' }; }
  }
  return <details className="rounded-xl border border-border bg-card">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Estudio visual · secciones, lienzos y movimiento</summary>
    <div className="space-y-4 border-t border-border p-4">
      <p className="text-xs text-muted-foreground">Agrega composiciones propias al sitio. Los formularios de inscripción y los datos del sistema siguen disponibles en el diseño principal.</p>
      <SwitchRow label="Mostrar las secciones personalizadas" checked={design.enabled} disabled={disabled} onChange={(enabled) => change({ ...design, enabled })} />
      <label className="block text-sm">Ubicación<select className="ml-2 rounded border border-border bg-background p-2" disabled={disabled} value={design.placement} onChange={(e) => change({ ...design, placement: e.target.value as CreativeSite['placement'] })}><option value="before">Antes del sitio principal</option><option value="after">Después del sitio principal</option></select></label>
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled || !past.length} onClick={() => { const previous = past[past.length - 1]; if (!previous) return; setPast(past.slice(0, -1)); setFuture([...future, design]); onChange(previous); }}>Deshacer</Button><Button type="button" size="sm" variant="outline" disabled={disabled || !future.length} onClick={() => { const next = future[future.length - 1]; if (!next) return; setFuture(future.slice(0, -1)); setPast([...past, design]); onChange(next); }}>Rehacer</Button></div>
      <SiteDesignAssistant disabled={disabled} context={target === 'academy' ? { target: 'academy-studio', current: { blocks: design.blocks, theme: design.theme } } : { target: 'event-studio', resourceId, current: { blocks: design.blocks, theme: design.theme } }} onApply={(proposal) => { if ('blocks' in proposal.design) change({ ...design, ...proposal.design, enabled: true }); }} />
      <EditorAssetsContext.Provider value={{ siteId: resourceId, assets, readOnly: disabled, addAsset: (asset) => setUploaded((previous) => [...previous, asset]), uploadAsset }}>
        <GuidedEditor kind="BLANK" document={doc} pageId={page.id} onDocumentChange={(updater) => {
          const next = homeOf(updater(doc)).blocks.map((block) => block.type === 'contact' ? { ...block, showForm: false } : block);
          change({ ...design, blocks: next });
        }} openId={openId} onOpenChange={setOpenId} readOnly={disabled} theme={design.theme} />
      </EditorAssetsContext.Provider>
      <details><summary className="cursor-pointer text-sm font-semibold">Colores, tipografía y animación</summary><div className="mt-3"><ThemePanel theme={design.theme} disabled={disabled} onChange={(patch) => change({ ...design, theme: { ...design.theme, ...patch } })} /></div></details>
      <div className="flex gap-2">{(['desktop', 'tablet', 'mobile'] as const).map((d) => <Button key={d} type="button" size="xs" variant={device === d ? 'default' : 'outline'} onClick={() => setDevice(d)}>{d === 'desktop' ? 'Escritorio' : d === 'tablet' ? 'Tablet' : 'Móvil'}</Button>)}</div>
      <div className="max-h-[36rem] overflow-auto rounded-lg border border-border"><div className="mx-auto" style={{ width: device === 'desktop' ? '100%' : device === 'tablet' ? 768 : 390, maxWidth: '100%' }}><SiteRenderer embedded name={name} logoUrl={null} theme={design.theme} blocks={design.blocks} slug={resourceId} mode="preview" onSelectBlock={setOpenId} selectedBlockId={openId} /></div></div>
    </div>
  </details>;
}
