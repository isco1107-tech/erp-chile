import { CreativeSiteSections } from '@/components/web-sites/CreativeSiteSections';
import { resolveLayout } from '@/lib/events/pageant-layout';
import type { PageantView } from '@/lib/events/pageant-site';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { PageantSite, type PageantSiteEditing } from './PageantSite';

/**
 * El micrositio completo: `PageantSite` con las secciones propias y las del
 * estudio en el orden del diseño. Solo un diseño anterior al orden libre puede
 * tener estudio «antes de todo el sitio» o «después del pie»: esos tramos van
 * por fuera, exactamente como se veían. Lo usan la página pública, la vista
 * previa, el lienzo del editor visual y el verificador de responsividad.
 */
export function PageantPage({ site, view, editing }: { site: PublicPageantSite; view: PageantView; editing?: PageantSiteEditing }) {
  const design = site.creative;
  const { leading, trailing } = resolveLayout({ layout: design?.layout, blockIds: design?.blocks.map((block) => block.id) ?? [], placement: design?.placement, enabled: design?.enabled });
  const basePath = site.customDomain ? '' : `/certamen/${site.slug}`;
  const only = (ids: string[]) => (design ? { ...design, blocks: design.blocks.filter((block) => ids.includes(block.id)) } : undefined);
  return (
    <>
      {leading.length > 0 && <CreativeSiteSections design={only(leading)} name={site.name} slug={site.slug} basePath={basePath} />}
      <PageantSite site={site} view={view} editing={editing} />
      {trailing.length > 0 && <CreativeSiteSections design={only(trailing)} name={site.name} slug={site.slug} basePath={basePath} />}
    </>
  );
}
