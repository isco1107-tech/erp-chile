import 'server-only';

import type { StorePaymentProvider, WebSiteStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { encryptPaymentCredential } from '@/lib/payments/crypto';
import { parsePaymentMethods, type StorePaymentSetup } from '@/lib/ecommerce/payment';
import { evaluateStoreReadiness, type StoreReadinessReport } from '@/lib/ecommerce/readiness';
import { storePageConflicts } from '@/lib/ecommerce/routes';
import { parseShippingRates, type StoreShippingRate } from '@/lib/ecommerce/shipping';
import { parseSiteDocument } from '@/lib/web-sites/site';
import { StoreError, StoreNotFoundError } from '../errors';
import type { StoreSettingsInput } from '../schema';

/**
 * Configuración de la tienda de un sitio. Todo filtra por `companyId`. Los secretos
 * (la llave de Webpay) se guardan cifrados y NO vuelven al navegador: el panel solo
 * sabe SI hay una guardada.
 */

export interface StoreSettingsView {
  siteId: string;
  siteName: string;
  siteStatus: WebSiteStatus;
  siteSlug: string;
  enabled: boolean;
  warehouseId: string | null;
  notifyEmail: string;
  supportPhone: string;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupInstructions: string;
  shippingEnabled: boolean;
  shippingRates: StoreShippingRate[];
  paymentMethods: StorePaymentProvider[];
  bankTransferInfo: string;
  transferHoldHours: number;
  webpayCommerceCode: string;
  webpayProduction: boolean;
  /** Hay una llave de Webpay guardada (no se devuelve). */
  webpayHasSecret: boolean;
  invoiceEnabled: boolean;
  termsText: string;
  returnsText: string;
  minOrderAmount: number;
  /** La empresa tiene guardada su llave de Khipu (la de Configuración → pago de cuotas). */
  khipuConfigured: boolean;
}

/** Ecommerce tiene habilitación propia; reutiliza la infraestructura de publicación. */
export async function assertStoreModule(companyId: string): Promise<void> {
  const features = await prisma.companyFeatures.findUnique({ where: { companyId }, select: { hasEcommerce: true } });
  if (!features?.hasEcommerce) throw new StoreError('La tienda en línea no está habilitada en tu plan.', 403);
}

async function loadSite(companyId: string, siteId: string) {
  const site = await prisma.webSite.findFirst({
    where: { id: siteId, companyId },
    select: { id: true, name: true, slug: true, status: true, draftBlocks: true, theme: true },
  });
  if (!site) throw new StoreNotFoundError('Sitio no encontrado');
  return site;
}

export async function hasKhipuCredential(companyId: string): Promise<boolean> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { khipuApiCredential: true } });
  return Boolean(settings?.khipuApiCredential);
}

/** Crea la configuración de la tienda de un sitio si no existe (cerrada, con la bodega por defecto de la empresa). */
export async function ensureStore(companyId: string, siteId: string): Promise<void> {
  await loadSite(companyId, siteId);
  const existing = await prisma.webSiteStore.findFirst({ where: { siteId, companyId }, select: { id: true } });
  if (existing) return;
  const warehouse = await prisma.warehouse.findFirst({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
  try {
    await prisma.webSiteStore.create({ data: { companyId, siteId, warehouseId: warehouse?.id ?? null } });
  } catch (error) {
    // Dos pestañas abriendo la tienda por primera vez a la vez: la segunda encuentra la fila de la primera.
    const found = await prisma.webSiteStore.findFirst({ where: { siteId, companyId }, select: { id: true } });
    if (!found) throw error;
  }
}

export async function getStoreSettings(companyId: string, siteId: string): Promise<StoreSettingsView> {
  const site = await loadSite(companyId, siteId);
  await ensureStore(companyId, siteId);
  const [store, khipuConfigured] = await Promise.all([
    prisma.webSiteStore.findFirst({ where: { siteId, companyId } }),
    hasKhipuCredential(companyId),
  ]);
  if (!store) throw new StoreNotFoundError('La tienda de este sitio no existe');
  return {
    siteId: site.id,
    siteName: site.name,
    siteStatus: site.status,
    siteSlug: site.slug,
    enabled: store.enabled,
    warehouseId: store.warehouseId,
    notifyEmail: store.notifyEmail ?? '',
    supportPhone: store.supportPhone ?? '',
    pickupEnabled: store.pickupEnabled,
    pickupAddress: store.pickupAddress ?? '',
    pickupInstructions: store.pickupInstructions ?? '',
    shippingEnabled: store.shippingEnabled,
    shippingRates: parseShippingRates(store.shippingRates),
    paymentMethods: parsePaymentMethods(store.paymentMethods),
    bankTransferInfo: store.bankTransferInfo ?? '',
    transferHoldHours: store.transferHoldHours,
    webpayCommerceCode: store.webpayCommerceCode ?? '',
    webpayProduction: store.webpayProduction,
    webpayHasSecret: Boolean(store.webpayApiSecret),
    invoiceEnabled: store.invoiceEnabled,
    termsText: store.termsText ?? '',
    returnsText: store.returnsText ?? '',
    minOrderAmount: store.minOrderAmount,
    khipuConfigured,
  };
}

export function paymentSetupOf(settings: Pick<StoreSettingsView, 'paymentMethods' | 'khipuConfigured' | 'webpayCommerceCode' | 'webpayHasSecret' | 'bankTransferInfo' | 'pickupEnabled'>): StorePaymentSetup {
  return {
    enabled: settings.paymentMethods,
    khipuConfigured: settings.khipuConfigured,
    webpayConfigured: Boolean(settings.webpayCommerceCode.trim() && settings.webpayHasSecret),
    bankTransferInfo: settings.bankTransferInfo,
    pickupEnabled: settings.pickupEnabled,
  };
}

export async function updateStoreSettings(companyId: string, siteId: string, input: StoreSettingsInput): Promise<StoreSettingsView> {
  await assertStoreModule(companyId);
  await loadSite(companyId, siteId);
  await ensureStore(companyId, siteId);

  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
    if (!warehouse) throw new StoreError('La bodega elegida no existe', 400, 'warehouseId');
  }
  if (input.pickupEnabled && !input.pickupAddress.trim()) throw new StoreError('Para ofrecer retiro escribe la dirección donde se retira.', 400, 'pickupAddress');
  if (input.paymentMethods.includes('TRANSFER') && !input.bankTransferInfo.trim()) {
    throw new StoreError('Para cobrar por transferencia escribe tus datos bancarios.', 400, 'bankTransferInfo');
  }
  if (input.paymentMethods.includes('PAY_ON_PICKUP') && !input.pickupEnabled) {
    throw new StoreError('«Pagar al retirar» necesita el retiro habilitado.', 400, 'paymentMethods');
  }

  // La llave de Webpay: vacío conserva la guardada; solo `clearWebpaySecret` la borra.
  const secret = input.clearWebpaySecret ? null : input.webpayApiSecret ? encryptPaymentCredential(input.webpayApiSecret) : undefined;
  const result = await prisma.webSiteStore.updateMany({
    where: { siteId, companyId },
    data: {
      warehouseId: input.warehouseId,
      notifyEmail: input.notifyEmail || null,
      supportPhone: input.supportPhone || null,
      pickupEnabled: input.pickupEnabled,
      pickupAddress: input.pickupAddress || null,
      pickupInstructions: input.pickupInstructions || null,
      shippingEnabled: input.shippingEnabled,
      shippingRates: input.shippingRates,
      paymentMethods: [...new Set(input.paymentMethods)],
      bankTransferInfo: input.bankTransferInfo || null,
      transferHoldHours: input.transferHoldHours,
      webpayCommerceCode: input.webpayCommerceCode || null,
      webpayProduction: input.webpayProduction,
      ...(secret !== undefined ? { webpayApiSecret: secret } : {}),
      invoiceEnabled: input.invoiceEnabled,
      termsText: input.termsText || null,
      returnsText: input.returnsText || null,
      minOrderAmount: input.minOrderAmount,
    },
  });
  if (result.count === 0) throw new StoreNotFoundError('La tienda de este sitio no existe');

  // Si ya estaba abierta y lo guardado la deja incompleta (sin medio de pago, sin forma de entregar…), se cierra sola:
  // vender algo que no se puede cobrar o entregar es peor que cerrar.
  const settings = await getStoreSettings(companyId, siteId);
  if (settings.enabled) {
    const report = await getStoreReadiness(companyId, siteId, settings);
    if (!report.canOpen) await prisma.webSiteStore.updateMany({ where: { siteId, companyId }, data: { enabled: false } });
    return { ...settings, enabled: report.canOpen };
  }
  return settings;
}

/** «Qué le falta» de la tienda; el servidor lo evalúa siempre, el navegador solo lo muestra. */
export async function getStoreReadiness(companyId: string, siteId: string, known?: StoreSettingsView): Promise<StoreReadinessReport> {
  const site = await loadSite(companyId, siteId);
  const settings = known ?? (await getStoreSettings(companyId, siteId));
  const warehouseId = settings.warehouseId;

  const [warehouse, publishedProducts, soldOut] = await Promise.all([
    warehouseId ? prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } }) : null,
    prisma.storeProduct.count({ where: { companyId, siteId, published: true, product: { isActive: true } } }),
    warehouseId ? countSoldOut(companyId, siteId, warehouseId) : 0,
  ]);

  const document = parseSiteDocument(site.draftBlocks, site.theme);
  return evaluateStoreReadiness({
    siteStatus: site.status,
    hasWarehouse: Boolean(warehouse),
    publishedProducts,
    soldOutProducts: soldOut,
    pickupEnabled: settings.pickupEnabled,
    pickupAddress: settings.pickupAddress,
    shippingEnabled: settings.shippingEnabled,
    shippingRates: settings.shippingRates.length,
    payment: paymentSetupOf(settings),
    termsText: settings.termsText,
    supportPhone: settings.supportPhone,
    conflictingPages: storePageConflicts(document.pages.map((page) => page.slug)),
  });
}

/** Publicados con control de stock que hoy no tienen una sola unidad en la bodega de la tienda (sin descontar reservas: es solo un aviso). */
async function countSoldOut(companyId: string, siteId: string, warehouseId: string): Promise<number> {
  const listed = await prisma.storeProduct.findMany({
    where: { companyId, siteId, published: true, product: { isActive: true, isTrackable: true } },
    select: { productId: true },
    take: 500,
  });
  if (listed.length === 0) return 0;
  const stocks = await prisma.stock.findMany({
    where: { companyId, warehouseId, productId: { in: listed.map((row) => row.productId) } },
    select: { productId: true, quantity: true },
  });
  const onHand = new Map(stocks.map((row) => [row.productId, row.quantity]));
  return listed.filter((row) => (onHand.get(row.productId) ?? 0) < 1).length;
}

/**
 * Abre o cierra la tienda. Abrir exige pasar la lista «qué le falta» (obligatorios),
 * evaluada acá en el servidor. Cerrar siempre se puede.
 */
export async function setStoreOpen(companyId: string, siteId: string, open: boolean): Promise<StoreReadinessReport> {
  await assertStoreModule(companyId);
  const settings = await getStoreSettings(companyId, siteId);
  const report = await getStoreReadiness(companyId, siteId, settings);
  if (open && !report.canOpen) {
    throw new StoreError(`Aún no se puede abrir la tienda. Falta: ${report.missing.map((item) => item.label.toLowerCase()).join('; ')}.`);
  }
  await prisma.webSiteStore.updateMany({ where: { siteId, companyId }, data: { enabled: open } });
  return report;
}

export interface StoreSiteRow {
  id: string;
  name: string;
  slug: string;
  status: WebSiteStatus;
  /** La tienda de este sitio está abierta al público. */
  open: boolean;
  /** Ya se armó la configuración de su tienda (aunque esté cerrada). */
  hasStore: boolean;
}

/** Sitios del constructor guiado (no archivados) donde se puede armar una tienda, con el estado de la suya. */
export async function listStoreSites(companyId: string): Promise<StoreSiteRow[]> {
  const sites = await prisma.webSite.findMany({
    where: { companyId, mode: 'GUIDED', status: { not: 'ARCHIVED' } },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
    select: { id: true, name: true, slug: true, status: true, store: { select: { enabled: true } } },
  });
  return sites.map((site) => ({ id: site.id, name: site.name, slug: site.slug, status: site.status, open: Boolean(site.store?.enabled), hasStore: Boolean(site.store) }));
}

/** Bodegas de la empresa para elegir de cuál sale lo que se vende. */
export async function listStoreWarehouses(companyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.warehouse.findMany({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], take: 20, select: { id: true, name: true } });
}
