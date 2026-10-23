import { createBlock, catalogBlockSchema, heroBlockSchema, contactBlockSchema, type BlockOf } from '@/lib/web-sites/blocks';
import { documentFromBlocks, type SiteDocument } from '@/lib/web-sites/site';
import { parseTheme } from '@/lib/web-sites/theme';

export const STOREFRONT_TEMPLATES = [
  { id: 'editorial', name: 'Marca editorial', description: 'Portada amplia, historia de marca y productos protagonistas.' },
  { id: 'boutique', name: 'Boutique', description: 'Una presentación cálida para colecciones y productos de autor.' },
  { id: 'essential', name: 'Venta directa', description: 'Una portada clara que lleva rápidamente al catálogo y la compra.' },
] as const;
export type StorefrontTemplate = (typeof STOREFRONT_TEMPLATES)[number]['id'];

export function liveCatalogBlock(variant?: string): BlockOf<'catalog'> {
  return catalogBlockSchema.parse({
    ...createBlock('catalog'),
    ...(variant ? { variant } : {}),
    heading: 'Nuestros productos',
    items: [],
    store: { collection: '', featuredOnly: false, limit: 8 },
  });
}

/** A real starting point, with the merchant's name and no invented reviews, figures or delivery promises. */
export function storefrontDesign(name: string, template: StorefrontTemplate = 'editorial', contact: { email?: string | null; phone?: string | null } = {}) {
  const theme = parseTheme(
    template === 'boutique'
      ? { primary: '#473b35', accent: '#865446', background: '#faf7f2', text: '#292420', font: 'sans', headingFont: 'serif', radius: 'soft', width: 'wide' }
      : { primary: '#1b2924', accent: '#486c55', background: '#fafaf7', text: '#202722', font: 'sans', radius: 'soft', width: 'wide' },
  );
  const hero = heroBlockSchema.parse({
    ...createBlock('hero'),
    title: name,
    subtitle: 'Conoce nuestra selección y encuentra tus próximos favoritos.',
    ctaLabel: 'Explorar productos',
    ctaHref: 'store:catalog',
    variant: template === 'boutique' ? ('center' as const) : template === 'essential' ? 'card' : 'editorial',
  });
  const contactBlock = contactBlockSchema.parse({
    ...createBlock('contact'),
    heading: 'Conversemos',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    showForm: true,
  });
  const document: SiteDocument = documentFromBlocks([hero, liveCatalogBlock(), contactBlock], theme);
  return { document, theme };
}
