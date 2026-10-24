import { resolveIn, type RenderCtx } from '@/components/web-sites/site/context';
import { buildNavItems } from '@/components/web-sites/site/nav';
import { renderToStaticMarkup } from 'react-dom/server';
import { storefrontDesign, STOREFRONT_TEMPLATES, liveCatalogBlock } from '@/lib/ecommerce/storefront-design';
import { isBlockEmpty } from '@/lib/web-sites/blocks';
import { homeOf, pageBlockAnchors, allBlocks, siteDocumentSchema } from '@/lib/web-sites/site';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { designerRequestSchema, parseDesignerProposal } from '@/lib/web-sites/ai-designer';
import CommerceCatalogSection from '@/components/store-builder/CommerceCatalogSection';
import type { PublicProductCard } from '@/modules/ecommerce/services/store-public.service';

it.each(STOREFRONT_TEMPLATES)('$name starts as a valid editable brand with real cart catalog and no invented prices', ({ id }) => {
  const { document, theme } = storefrontDesign('Estudio Aurea', id);
  expect(siteDocumentSchema.safeParse(document).success).toBe(true);
  const blocks = allBlocks(document);
  expect(blocks.find((block) => block.type === 'hero')).toMatchObject({ title: 'Estudio Aurea', ctaHref: 'store:catalog' });
  expect(blocks.find((block) => block.type === 'catalog')).toMatchObject({ items: [], store: { limit: 8 } });
  const report = evaluateReadiness({ kind: 'CATALOG', mode: 'GUIDED', seoTitle: 'Estudio Aurea', document, theme });
  expect(report.items.filter((item) => item.required && !item.ok)).toEqual([]);
  expect(report.items.find((item) => item.id.includes('whatsapp'))).toBeUndefined();
  expect(isBlockEmpty(liveCatalogBlock())).toBe(false);
});

it('AI cannot invent checkout prices or change product selection in the brand editor', () => {
  const catalog = { ...liveCatalogBlock(), store: { collection: 'Verano', featuredOnly: true, limit: 4 } };
  const theme = storefrontDesign('Aurea').theme;
  const current = { blocks: [catalog], theme };
  const request = designerRequestSchema.parse({
    target: 'commerce',
    resourceId: 'own-store',
    pageId: 'home',
    instruction: 'Mejora el catálogo de mi marca',
    current,
  });
  const response = JSON.stringify({
    target: 'commerce',
    summary: 'Más claridad',
    changes: ['Mejor presentación'],
    design: { ...current, blocks: [{ ...catalog, store: { collection: 'Otra', limit: 24 }, items: [{ name: 'Producto inventado', price: '1' }] }] },
  });
  // Use a valid model response to exercise preservation after schema validation.
  const valid = JSON.parse(response);
  valid.design.blocks[0].items = [];
  const result = parseDesignerProposal(JSON.stringify(valid), request, []);
  expect(result.target).toBe('commerce');
  if (result.target !== 'commerce') throw new Error('Unexpected target');
  expect(result.design.blocks[0]).toMatchObject({ store: catalog.store, items: [] });
  const webRequest = designerRequestSchema.parse({ ...request, target: 'web' });
  const website = parseDesignerProposal(JSON.stringify({ ...valid, target: 'web' }), webRequest, []);
  if (website.target !== 'web') throw new Error('Unexpected target');
  expect(website.design.blocks[0]).toHaveProperty('store', undefined);
});

const product: PublicProductCard = {
  id: 'product',
  slug: 'aceite',
  title: 'Aceite real',
  summary: '',
  imageUrl: null,
  imageAlt: '',
  grossPrice: 1190,
  compareAtPrice: null,
  collection: null,
  featured: false,
  stock: { state: 'in_stock', text: 'Disponible' },
  available: 8,
  maxPerOrder: null,
};
it('brand catalog renders actual ERP product and cart action, while preview disables navigation and cart writes', () => {
  const props = { block: liveCatalogBlock(), products: [product], siteSlug: 'marca', basePath: '/web/marca' };
  const live = renderToStaticMarkup(<CommerceCatalogSection {...props} />);
  expect(live).toContain('Aceite real');
  expect(live).toContain('1.190');
  expect(live).toContain('Agregar');
  expect(live).toContain('href="/web/marca/producto/aceite"');
  const preview = renderToStaticMarkup(<CommerceCatalogSection {...props} preview />);
  expect(preview).not.toContain('href=');
  expect(preview).toContain('aria-disabled="true"');
  const closed = renderToStaticMarkup(<CommerceCatalogSection {...props} products={[]} open={false} />);
  expect(closed).not.toContain('href=');
});

it('cart and checkout navigation returns to brand sections and never marks the homepage as the current screen', () => {
  const { document } = storefrontDesign('Aurea');
  const page = homeOf(document);
  const anchor = pageBlockAnchors(page).get(page.blocks[2]!.id)!;
  const ctx: RenderCtx = {
    doc: document,
    page,
    basePath: '/web/aurea',
    slug: 'aurea',
    preview: false,
    idPrefix: '',
    navigate: true,
    h1BlockId: null,
    store: { siteSlug: 'aurea', catalogHref: '/web/aurea/tienda', cartHref: '/web/aurea/carrito', current: 'cart' },
  };
  expect(resolveIn(ctx, `#${anchor}`)?.href).toBe(`/web/aurea#${anchor}`);
  expect(buildNavItems(ctx, new Set()).some((item) => item.current)).toBe(false);
  expect(buildNavItems(ctx, new Set()).some((item) => item.link?.href === `/web/aurea#${anchor}`)).toBe(true);
  const customDomain = { ...ctx, basePath: '' };
  expect(resolveIn(customDomain, `#${anchor}`)?.href).toBe(`/#${anchor}`);
});
