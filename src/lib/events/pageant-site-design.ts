import { z } from 'zod';
import { creativeSiteSchema } from '@/lib/web-sites/creative';
import { MAX_FOOTER_LINKS, menuLinkSchema } from '@/lib/web-sites/site';
import { safeHref } from '@/lib/web-sites/urls';
import { pageantLayoutSchema, pageantOptionsSchema, pageantSectionsSchema } from './pageant-layout';

const footerLinkSchema = menuLinkSchema.superRefine(({ label, href }, ctx) => {
  if (!label && !href) return;
  if (!label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Escribe el texto del enlace del pie de página.' });
  if (!safeHref(href)) ctx.addIssue({ code: 'custom', path: ['href'], message: 'Escribe una dirección válida para el enlace del pie de página.' });
});

const pageantFooterSchema = z.object({
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(300).default(''),
  copyright: z.string().trim().max(200).default(''),
  showMenu: z.boolean().default(true),
  showContact: z.boolean().default(true),
  links: z.array(footerLinkSchema).max(MAX_FOOTER_LINKS).default([]),
});
export type PageantFooter = z.infer<typeof pageantFooterSchema>;

/**
 * Diseño del micrositio: el estudio visual (bloques y tema) más lo propio del
 * certamen. `layout`, `sections` y `options` son el diseño libre del editor
 * visual (ver `pageant-layout.ts`); se leen con tolerancia y un diseño guardado
 * antes de que existieran se ve igual que siempre.
 */
export const pageantSiteDesignSchema = creativeSiteSchema.safeExtend({
  footer: pageantFooterSchema.prefault({}),
  /** Orden de todo el sitio (secciones propias + bloques del estudio). Ausente = el de siempre. */
  layout: pageantLayoutSchema,
  /** Textos, fondo, espaciado y visibilidad por sección propia. */
  sections: pageantSectionsSchema,
  /** Piezas globales: numeración, cinta, WhatsApp flotante, cuenta regresiva, datos clave. */
  options: pageantOptionsSchema,
});
export type PageantSiteDesign = z.infer<typeof pageantSiteDesignSchema>;

export function parsePageantSiteDesign(value: unknown): PageantSiteDesign | undefined {
  const parsed = pageantSiteDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
