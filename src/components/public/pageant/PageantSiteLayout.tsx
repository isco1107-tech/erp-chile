import type { CSSProperties, ReactNode } from 'react';
import type { SiteRendererProps } from '@/components/web-sites/SiteRenderer';
import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import CanvasScene from '@/components/web-sites/site/CanvasScene';
import type { RenderCtx } from '@/components/web-sites/site/context';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import type { CanvasElement } from '@/lib/web-sites/canvas';
import { themeVariables } from '@/lib/web-sites/theme';
import { documentFromBlocks, homeOf } from '@/lib/web-sites/site';
import { pageantRegionSchema, type PageantBlockTarget, type PageantRegion } from '@/lib/events/pageant-site-design';
import type { PageantNativeTextField } from '@/lib/events/pageant-native-text';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

export interface PageantLayerEditor {
  selectedId?: string;
  onSelect: (id: string) => void;
  renderInsertion: (target: PageantBlockTarget, block?: WebSiteBlock) => ReactNode;
  renderCanvasLayer?: SiteRendererProps['renderCanvasLayer'];
  renderNativeText?: (field: PageantNativeTextField, children: ReactNode) => ReactNode;
  renderNativeLayer?: (region: PageantRegion, layer: CanvasElement, style: CSSProperties, content: ReactNode) => ReactNode;
}

export function pageantLayerOverlays(site: PublicPageantSite, editor?: PageantLayerEditor): Partial<Record<PageantRegion, ReactNode>> {
  const design = site.creative;
  if (!design?.overlays || (!design.enabled && !editor)) return {};
  const doc = documentFromBlocks(design.blocks, design.theme);
  const basePath = site.customDomain ? '' : `/certamen/${site.slug}`;
  const ctx: RenderCtx = {
    doc, page: homeOf(doc), basePath, slug: site.slug, preview: Boolean(editor),
    idPrefix: editor ? 'wsp-' : '', navigate: !editor, h1BlockId: null,
  };
  const style = themeVariables(design.theme) as CSSProperties;
  return Object.fromEntries(pageantRegionSchema.options.flatMap((region) => {
    const canvas = design.overlays?.[region];
    if (!canvas?.enabled || !canvas.elements.some((layer) => !layer.hidden)) return [];
    return [[region, (
      <div key={region} className={`pgs-canvas-overlay ${SITE_FONT_CLASSES}`} data-pageant-overlay={region} style={style}>
        <CanvasScene canvas={canvas} blockId={region} ctx={{
          ...ctx,
          renderCanvasLayer: editor?.renderNativeLayer ? (_, ...layer) => editor.renderNativeLayer?.(region, ...layer) : undefined,
        }} />
      </div>
    )]];
  }));
}
