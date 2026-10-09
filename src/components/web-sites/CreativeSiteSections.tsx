import type { CreativeSite } from '@/lib/web-sites/creative';
import SiteRenderer from './SiteRenderer';

export function CreativeSiteSections({ design, name, slug, basePath }: { design?: CreativeSite; name: string; slug: string; basePath: string }) {
  if (!design?.enabled || !design.blocks.length) return null;
  return <SiteRenderer name={name} logoUrl={null} blocks={design.blocks} theme={design.theme} slug={slug} basePath={basePath} mode="public" embedded />;
}
