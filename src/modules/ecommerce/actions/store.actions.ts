'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, can, requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import type { Permission } from '@/lib/auth/permissions';
import type { StoreReadinessReport } from '@/lib/ecommerce/readiness';
import { StoreError } from '../errors';
import { cancelOrderSchema, catalogListQuerySchema, confirmPaymentSchema, fulfillmentInputSchema, orderListQuerySchema, publishProductsSchema, refundSchema, storeProductSchema, storeSettingsSchema } from '../schema';
import { applyFulfillment, cancelOrder, markRefunded } from '../services/store-fulfillment.service';
import { getStoreOrder, getStoreStats, listStoreOrders, type StoreOrderDetail, type StoreOrdersPage, type StoreStats } from '../services/store-orders.service';
import { confirmManualPayment, reopenPaidOrder, retryIssueSale } from '../services/store-payment.service';
import { getStoreProduct, listSiteAssets, listStoreCatalog, removeStoreProduct, saveStoreProduct, setProductsPublished, type SiteAssetRow, type StoreCatalogPage, type StoreProductDetail } from '../services/store-catalog.service';
import { assertStoreModule, getStoreReadiness, getStoreSettings, setStoreOpen, updateStoreSettings, type StoreSettingsView } from '../services/store-settings.service';

/**
 * Acciones del panel «Tienda en línea». Cada una exige su permiso (`store:*`) y los dos módulos
 * (sitios web y tienda) en el servidor; la empresa sale SIEMPRE de la sesión. Devuelven
 * `ActionResult` con mensajes en español: solo el texto de un `StoreError` llega a la pantalla,
 * lo demás va a observabilidad.
 */

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof StoreError) return { success: false, error: error.message };
  captureException(error, { module: 'tienda-en-linea', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

/** Sesión con el permiso pedido Y los dos módulos de la tienda. */
async function storeSession(permission: Permission): Promise<AuthContext> {
  const session = await requireAuthWithPermission(permission);
  await assertStoreModule(session.companyId);
  return session;
}

function audit(session: AuthContext, entity: 'StoreOrder' | 'StoreProduct' | 'WebSiteStore', entityId: string, action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT', metadata: Record<string, unknown>) {
  return createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action, entity, entityId, metadata });
}

const actorOf = (session: AuthContext) => ({ id: session.id, name: session.name });

function revalidateStore(): void {
  revalidatePath('/dashboard/store');
}

/** El catálogo público cambió: se vacía la caché de las pantallas de la tienda del sitio. */
function revalidatePublicStore(slug?: string): void {
  if (slug) revalidatePath(`/web/${slug}`, 'layout');
  revalidatePath('/web/[slug]/[page]', 'page');
  revalidatePath('/web/[slug]/producto/[product]', 'page');
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export async function listStoreOrdersAction(input: unknown): Promise<ActionResult<{ page: StoreOrdersPage; stats: StoreStats }>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:read');
    companyId = session.companyId;
    const parsed = orderListQuerySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Revisa los filtros de pedidos' };
    const [page, stats] = await Promise.all([listStoreOrders(session.companyId, parsed.data), getStoreStats(session.companyId, parsed.data.siteId)]);
    return { success: true, data: { page, stats } };
  } catch (error) {
    return fail(error, companyId, { action: 'listStoreOrders' });
  }
}

export async function getStoreOrderAction(orderId: string): Promise<ActionResult<StoreOrderDetail>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:read');
    companyId = session.companyId;
    return { success: true, data: await getStoreOrder(session.companyId, orderId) };
  } catch (error) {
    return fail(error, companyId, { action: 'getStoreOrder', orderId });
  }
}

/** Confirma a mano un pago por transferencia o contra retiro: emite la venta del ERP. Es dinero recibido: lo hace quien atiende pedidos. */
export async function confirmOrderPaymentAction(orderId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    const parsed = confirmPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await confirmManualPayment(session.companyId, orderId, actorOf(session), parsed.data.method ?? null, parsed.data.note);
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'confirm-payment', method: parsed.data.method ?? null });
    revalidateStore();
    return { success: true, data: null, message: 'Pago confirmado. Emitimos la venta y avisamos al comprador.' };
  } catch (error) {
    return fail(error, companyId, { action: 'confirmOrderPayment', orderId });
  }
}

export async function fulfillOrderAction(orderId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:fulfill');
    companyId = session.companyId;
    const parsed = fulfillmentInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await applyFulfillment(session.companyId, orderId, parsed.data, actorOf(session));
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'fulfillment', step: parsed.data.action });
    revalidateStore();
    return { success: true, data: null, message: 'Pedido actualizado' };
  } catch (error) {
    return fail(error, companyId, { action: 'fulfillOrder', orderId });
  }
}

export async function cancelStoreOrderAction(orderId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    const parsed = cancelOrderSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    // Cancelar un pedido ya pagado (devolver plata) es de administración: el servicio lo vuelve a exigir.
    await cancelOrder(session.companyId, orderId, parsed.data, actorOf(session), can(session, 'store:manage'));
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'cancel', refunded: parsed.data.refunded });
    revalidateStore();
    return { success: true, data: null, message: 'Pedido cancelado y stock liberado' };
  } catch (error) {
    return fail(error, companyId, { action: 'cancelStoreOrder', orderId });
  }
}

export async function markOrderRefundedAction(orderId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:manage');
    companyId = session.companyId;
    const parsed = refundSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await markRefunded(session.companyId, orderId, parsed.data.note, actorOf(session));
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'refund' });
    revalidateStore();
    return { success: true, data: null, message: 'Reembolso registrado' };
  } catch (error) {
    return fail(error, companyId, { action: 'markOrderRefunded', orderId });
  }
}

export async function retryOrderSaleAction(orderId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    const result = await retryIssueSale(session.companyId, orderId, actorOf(session));
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'retry-sale', ok: result.ok });
    revalidateStore();
    if (!result.ok) return { success: false, error: result.error ?? 'No se pudo emitir la venta. Revisa el stock e intenta de nuevo.' };
    return { success: true, data: null, message: 'Venta emitida' };
  } catch (error) {
    return fail(error, companyId, { action: 'retryOrderSale', orderId });
  }
}

export async function reopenPaidOrderAction(orderId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:manage');
    companyId = session.companyId;
    await reopenPaidOrder(session.companyId, orderId, actorOf(session));
    await audit(session, 'StoreOrder', orderId, 'UPDATE', { action: 'reopen' });
    revalidateStore();
    return { success: true, data: null, message: 'Pedido reabierto y venta emitida' };
  } catch (error) {
    return fail(error, companyId, { action: 'reopenPaidOrder', orderId });
  }
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export async function listStoreCatalogAction(siteId: string, input: unknown): Promise<ActionResult<StoreCatalogPage>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:read');
    companyId = session.companyId;
    const parsed = catalogListQuerySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Revisa los filtros del catálogo' };
    return { success: true, data: await listStoreCatalog(session.companyId, siteId, parsed.data) };
  } catch (error) {
    return fail(error, companyId, { action: 'listStoreCatalog' });
  }
}

export async function getStoreProductAction(siteId: string, productId: string): Promise<ActionResult<{ product: StoreProductDetail; assets: SiteAssetRow[] }>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:read');
    companyId = session.companyId;
    const [product, assets] = await Promise.all([getStoreProduct(session.companyId, siteId, productId), listSiteAssets(session.companyId, siteId)]);
    return { success: true, data: { product, assets } };
  } catch (error) {
    return fail(error, companyId, { action: 'getStoreProduct' });
  }
}

export async function saveStoreProductAction(siteId: string, productId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    const parsed = storeProductSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await saveStoreProduct(session.companyId, siteId, productId, parsed.data);
    await audit(session, 'StoreProduct', productId, 'UPDATE', { siteId, action: 'save-sheet' });
    revalidateStore();
    revalidatePublicStore();
    return { success: true, data: null, message: 'Ficha guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveStoreProduct' });
  }
}

export async function setProductsPublishedAction(siteId: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    const parsed = publishProductsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const count = await setProductsPublished(session.companyId, siteId, parsed.data.productIds, parsed.data.published);
    await audit(session, 'StoreProduct', siteId, 'UPDATE', { siteId, action: parsed.data.published ? 'publish' : 'unpublish', count });
    revalidateStore();
    revalidatePublicStore();
    const noun = count === 1 ? 'producto' : 'productos';
    return { success: true, data: { count }, message: parsed.data.published ? `${count} ${noun} publicado${count === 1 ? '' : 's'} en la tienda` : `${count} ${noun} quitado${count === 1 ? '' : 's'} de la tienda` };
  } catch (error) {
    return fail(error, companyId, { action: 'setProductsPublished' });
  }
}

export async function removeStoreProductAction(siteId: string, productId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:write');
    companyId = session.companyId;
    await removeStoreProduct(session.companyId, siteId, productId);
    await audit(session, 'StoreProduct', productId, 'DELETE', { siteId });
    revalidateStore();
    revalidatePublicStore();
    return { success: true, data: null, message: 'Producto quitado de la tienda (sigue en tu inventario)' };
  } catch (error) {
    return fail(error, companyId, { action: 'removeStoreProduct' });
  }
}

// ---------------------------------------------------------------------------
// Ajustes y apertura
// ---------------------------------------------------------------------------

export async function getStoreSettingsAction(siteId: string): Promise<ActionResult<{ settings: StoreSettingsView; readiness: StoreReadinessReport }>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:read');
    companyId = session.companyId;
    const settings = await getStoreSettings(session.companyId, siteId);
    return { success: true, data: { settings, readiness: await getStoreReadiness(session.companyId, siteId, settings) } };
  } catch (error) {
    return fail(error, companyId, { action: 'getStoreSettings' });
  }
}

/** Envíos, pagos y ajustes: configurar cómo se cobra y se entrega es de administración (`store:manage`). */
export async function updateStoreSettingsAction(siteId: string, input: unknown): Promise<ActionResult<{ settings: StoreSettingsView; readiness: StoreReadinessReport }>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:manage');
    companyId = session.companyId;
    const parsed = storeSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const wasOpen = (await getStoreSettings(session.companyId, siteId)).enabled;
    const settings = await updateStoreSettings(session.companyId, siteId, parsed.data);
    const readiness = await getStoreReadiness(session.companyId, siteId, settings);
    // Sin registrar la llave de Webpay: solo si se guardó o se borró una.
    await audit(session, 'WebSiteStore', siteId, 'UPDATE', { action: 'settings', paymentMethods: parsed.data.paymentMethods, webpaySecretChanged: Boolean(parsed.data.webpayApiSecret) || parsed.data.clearWebpaySecret, shippingRates: parsed.data.shippingRates.length });
    revalidateStore();
    revalidatePublicStore();
    // Si ya estaba abierta y lo guardado la dejó incompleta, el servicio la cerró: se avisa para que no sorprenda.
    return { success: true, data: { settings, readiness }, message: wasOpen && !settings.enabled ? 'Ajustes guardados. Tu tienda se cerró porque quedó incompleta: revisa «Qué le falta».' : 'Ajustes guardados' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateStoreSettings' });
  }
}

export async function setStoreOpenAction(siteId: string, open: boolean): Promise<ActionResult<StoreReadinessReport>> {
  let companyId: string | undefined;
  try {
    const session = await storeSession('store:manage');
    companyId = session.companyId;
    const report = await setStoreOpen(session.companyId, siteId, Boolean(open));
    await audit(session, 'WebSiteStore', siteId, 'UPDATE', { action: open ? 'open' : 'close' });
    revalidateStore();
    revalidatePublicStore();
    return { success: true, data: report, message: open ? 'Tu tienda está abierta al público' : 'Tu tienda quedó cerrada' };
  } catch (error) {
    return fail(error, companyId, { action: 'setStoreOpen' });
  }
}
