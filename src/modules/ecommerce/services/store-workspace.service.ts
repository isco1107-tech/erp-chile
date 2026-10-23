import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { documentFromBlocks } from '@/lib/web-sites/site';
import { parseTheme } from '@/lib/web-sites/theme';
import { siteSlugProblem, slugify } from '@/lib/web-sites/urls';
import { StoreError, StoreNotFoundError } from '../errors';
import { publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';
import { ownImageOrNull } from './store-catalog.service';

export const storefrontSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de tu tienda').max(80),
  slug: z.string().trim().max(50).optional(),
});
export const storeBrandSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200),
  primary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  logoUrl: z.string().max(500).optional(),
});

/** Creates only a closed storefront shell. Opening still requires the server readiness checks. */
export async function createStorefront(companyId: string, actorName: string, input: z.infer<typeof storefrontSchema>) {
  const requested = input.slug?.trim();
  const slug = requested ? slugify(requested) : `${slugify(input.name, 36) || 'tienda'}-${randomUUID().slice(0, 6)}`;
  const problem = siteSlugProblem(slug);
  if (problem) throw new StoreError(problem);
  const theme = parseTheme({
    primary: '#1b2924',
    accent: '#486c55',
    background: '#fafaf7',
    text: '#202722',
    radius: 'soft',
    width: 'wide',
    font: 'sans',
    headingFont: 'same',
  });
  const document = documentFromBlocks([]);
  return prisma.$transaction(async (tx) => {
    // Serializes quota checks, including concurrent store creations for this company.
    await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { maxWebSites: true } });
    if (!company) throw new StoreNotFoundError('Empresa no encontrada');
    const count = await tx.webSite.count({ where: { companyId, status: { not: 'ARCHIVED' } } });
    if (count >= company.maxWebSites)
      throw new StoreError('Alcanzaste el límite de publicaciones de tu empresa. Pide ampliar el límite antes de crear otra tienda.');
    if (await tx.webSite.findUnique({ where: { slug }, select: { id: true } })) throw new StoreError('Esa dirección ya está ocupada. Elige otra.');
    const warehouse = await tx.warehouse.findFirst({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
    const site = await tx.webSite.create({
      data: {
        companyId,
        name: input.name,
        slug,
        kind: 'CATALOG',
        mode: 'GUIDED',
        status: 'PUBLISHED',
        seoTitle: input.name,
        createdByName: actorName,
        publishedAt: new Date(),
        draftBlocks: document as unknown as Prisma.InputJsonValue,
        publishedBlocks: document as unknown as Prisma.InputJsonValue,
        theme: theme as Prisma.InputJsonValue,
        publishedTheme: theme as Prisma.InputJsonValue,
        store: { create: { companyId, standalone: true, enabled: false, warehouseId: warehouse?.id ?? null } },
      },
      select: { id: true, slug: true },
    });
    return site;
  });
}

export async function getStoreBrand(companyId: string, siteId: string) {
  const site = await prisma.webSite.findFirst({
    where: { id: siteId, companyId, store: { isNot: null } },
    select: { name: true, slug: true, seoDescription: true, logoUrl: true, theme: true, customDomain: true, store: { select: { standalone: true } } },
  });
  if (!site) throw new StoreNotFoundError('Tienda no encontrada');
  const theme = parseTheme(site.theme);
  return {
    name: site.name,
    slug: site.slug,
    description: site.seoDescription ?? '',
    logoUrl: site.logoUrl ?? '',
    primary: theme.primary,
    accent: theme.accent,
    domain: site.customDomain,
    platformUrl: `${publicSiteUrl(site.slug)}/tienda`,
    standalone: Boolean(site.store?.standalone),
  };
}
export type StoreBrand = Awaited<ReturnType<typeof getStoreBrand>>;

export async function updateStoreBrand(companyId: string, siteId: string, input: z.infer<typeof storeBrandSchema>) {
  const current = await getStoreBrand(companyId, siteId);
  if (!current.standalone) throw new StoreError('Esta tienda conserva el diseño de su sitio. Edita su identidad desde el constructor de ese sitio.');
  const logoUrl = input.logoUrl ? ownImageOrNull(companyId, input.logoUrl) : null;
  if (input.logoUrl && !logoUrl) throw new StoreError('El logo debe ser una imagen subida por tu empresa.');
  const site = await prisma.webSite.findFirstOrThrow({ where: { id: siteId, companyId }, select: { theme: true } });
  const theme = parseTheme({ ...parseTheme(site.theme), primary: input.primary, accent: input.accent });
  await prisma.webSite.updateMany({
    where: { id: siteId, companyId },
    data: { name: input.name, seoTitle: input.name, seoDescription: input.description, logoUrl, theme, publishedTheme: theme },
  });
  return getStoreBrand(companyId, siteId);
}
