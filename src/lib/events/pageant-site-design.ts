import { z } from 'zod';
import { creativeSiteSchema } from '@/lib/web-sites/creative';
import { MAX_FOOTER_LINKS, menuLinkSchema } from '@/lib/web-sites/site';
import { safeHref } from '@/lib/web-sites/urls';

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

export const pageantSiteDesignSchema = creativeSiteSchema.safeExtend({
  footer: pageantFooterSchema.prefault({}),
});
export type PageantSiteDesign = z.infer<typeof pageantSiteDesignSchema>;

export function parsePageantSiteDesign(value: unknown): PageantSiteDesign | undefined {
  const parsed = pageantSiteDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
