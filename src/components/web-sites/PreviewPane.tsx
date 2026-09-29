'use client';

import { memo } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import type { WebSiteTheme } from '@/lib/web-sites/theme';
import { cn } from '@/lib/utils';
import SiteRenderer from './SiteRenderer';
import { MOBILE_PREVIEW_WIDTH, type PreviewDevice } from './editor-shared';

type PreviewPaneProps = {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
} & (
  | { mode: 'GUIDED'; name: string; logoUrl: string | null; theme: WebSiteTheme; blocks: WebSiteBlock[]; slug: string }
  | { mode: 'HTML'; srcDoc: string }
);

const DEVICES: { id: PreviewDevice; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Escritorio', Icon: Monitor },
  { id: 'mobile', label: 'Celular', Icon: Smartphone },
];

/**
 * Vista previa en vivo. En modo guiado usa el mismo renderizador que la página
 * pública (adapta su diseño al ancho del contenedor, así que "Celular" es solo
 * un contenedor de 390 px). En HTML propio usa un iframe con `sandbox` VACÍO:
 * sin scripts ni acceso al panel. No agregar valores a ese atributo.
 */
export const PreviewPane = memo(function PreviewPane(props: PreviewPaneProps) {
  const { device, onDeviceChange } = props;
  const mobile = device === 'mobile';
  return (
    <section aria-label="Vista previa del sitio" className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Vista previa</h2>
        <div role="group" aria-label="Tamaño de la vista previa" className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {DEVICES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              onClick={() => onDeviceChange(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                device === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[70vh] min-h-[420px] overflow-auto bg-muted lg:h-[calc(100vh-13rem)]">
        <div className={cn('mx-auto bg-white shadow-sm', props.mode === 'HTML' ? 'h-full' : 'min-h-full', mobile ? 'border-x border-border' : 'w-full')} style={mobile ? { width: MOBILE_PREVIEW_WIDTH, maxWidth: '100%' } : undefined}>
          {props.mode === 'GUIDED' ? (
            <SiteRenderer name={props.name} logoUrl={props.logoUrl} theme={props.theme} blocks={props.blocks} slug={props.slug} mode="preview" />
          ) : (
            <iframe sandbox="" srcDoc={props.srcDoc} title="Vista previa" className="block size-full border-0 bg-white" />
          )}
        </div>
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Así se verá tu sitio publicado. Los enlaces y el formulario no funcionan en la vista previa.</p>
    </section>
  );
});
