import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { SITE_CSS } from '@/components/web-sites/site/site-css';
import { pageantRelocatedCss, resolvePageantDesignLayout, type PageantInsertion } from '@/lib/events/pageant-site-design';
import { applyPaletteToStudioTheme } from '@/lib/events/pageant-palette';
import { documentFromBlocks } from '@/lib/web-sites/site';
import type { PageantView } from '@/lib/events/pageant-site';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { PageantSite, type PageantSiteEditing } from './PageantSite';
import { pageantLayerOverlays, type PageantLayerEditor } from './PageantSiteLayout';

const painted = new WeakMap<PublicPageantSite, PublicPageantSite>();

/**
 * Con paleta, las secciones del estudio visual (claras, con su propio tema) toman
 * los mismos colores que el resto del sitio: los tramos de afuera, los de adentro
 * y los lienzos leen todos `creative.theme`, así que se pinta una sola vez acá.
 * Sin hooks (esta página también corre en el servidor) y con una caché por objeto
 * para que el sitio pintado conserve su identidad entre renders.
 */
function withPalette(site: PublicPageantSite): PublicPageantSite {
  if (!site.creative || !site.palette) return site;
  let result = painted.get(site);
  if (!result) {
    result = { ...site, creative: { ...site.creative, theme: applyPaletteToStudioTheme(site.creative.theme, site.palette) } };
    painted.set(site, result);
  }
  return result;
}

/** El mismo micrositio para el visitante, la vista previa y ambos editores. */
export function PageantPage({ site: source, view, editing, layerEditor }: {
  site: PublicPageantSite; view: PageantView; editing?: PageantSiteEditing; layerEditor?: PageantLayerEditor;
}) {
  const site = withPalette(source);
  const design = site.creative;
  const layout = resolvePageantDesignLayout(design, layerEditor ? true : design?.enabled);
  const basePath = site.customDomain ? '' : `/certamen/${site.slug}`;
  const doc = design && documentFromBlocks(design.blocks, design.theme);
  const overlays = pageantLayerOverlays(site, layerEditor);
  const withStudio = Boolean(design && (design.enabled || layerEditor) && (design.blocks.length || Object.keys(overlays).length));
  const exterior = (ids: string[], slot: PageantInsertion) => {
    if (!design || !doc) return null;
    const blocks = ids.flatMap((id) => {
      const block = design.blocks.find((item) => item.id === id);
      return block ? [block] : [];
    });
    const content = blocks.length > 0 && <SiteRenderer name={site.name} logoUrl={null} theme={design.theme} slug={site.slug} basePath={basePath}
      document={doc} embedded embeddedSection={{ id: slot, blocks }} mode={layerEditor ? 'preview' : 'public'} withCss={false}
      onSelectBlock={layerEditor?.onSelect} selectedBlockId={layerEditor?.selectedId} renderCanvasLayer={layerEditor?.renderCanvasLayer}
      beforeBlock={layerEditor ? (block) => layerEditor.renderInsertion({ slot, beforeId: block.id }, block) : undefined} />;
    if (!layerEditor) return content;
    // Con orden explícito el pie es el último destino de los dos editores.
    if (design.layout) return null;
    return (
      <div data-pageant-insertion={slot}>
        {content}
        {layerEditor.renderInsertion({ slot })}
      </div>
    );
  };
  return (
    <>
      {withStudio && <style>{SITE_CSS}</style>}
      {design?.relocated && <style>{pageantRelocatedCss(layerEditor ? { ...design, enabled: true } : design)}</style>}
      {exterior(layout.leading, 'before')}
      <PageantSite site={site} view={view} editing={editing} layerEditor={layerEditor} layout={layout.items} overlays={overlays} omitStudioStyles />
      {exterior(layout.trailing, 'after')}
    </>
  );
}
