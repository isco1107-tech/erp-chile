import 'server-only';

import crypto from 'crypto';
import type { InvoicePaymentLink, OnlinePaymentStatus, Payment } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { getAppUrl } from '@/lib/email/mailer';
import { captureException, captureMessage } from '@/lib/observability';
import { createKhipuPayment, getKhipuPayment } from '@/lib/payments/khipu';
import { decryptPaymentCredential } from '@/lib/payments/crypto';
import { evaluateKhipuPayment } from '@/modules/payment-plans/online-payment-calc';
import { CASH_ELIGIBLE_DTE_TYPES, DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { emitPaymentEvent, recordTreasuryMovement } from '../services/movements.service';
import { registerSalesPaymentInTx } from '../services/treasury.service';

/**
 * Cobro en línea de facturas por cobrar (Khipu, transferencia bancaria).
 *
 * Mismas reglas que las cuotas: el link se paga en Khipu, y el documento solo
 * se da por cobrado cuando `syncInvoiceLink` consulta el cobro a Khipu con la
 * API key de la empresa y el monto, la moneda y el `transaction_id` calzan
 * exacto. Ni la notificación ni el regreso del navegador bastan.
 */

const PROVIDER = 'KHIPU';
const LINK_TTL_MS = 72 * 60 * 60 * 1000;
const EXPIRY_GRACE_MS = 30 * 60 * 1000;

export class InvoiceLinkError extends Error {}

/** ¿La empresa conectó su cuenta de Khipu? (Sin exponer la llave.) */
export async function isKhipuConnected(companyId: string): Promise<boolean> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { khipuApiCredential: true } });
  return Boolean(settings?.khipuApiCredential);
}

export async function createInvoicePaymentLink(companyId: string, salesDocumentId: string): Promise<{ url: string; amount: number }> {
  const [settings, doc] = await Promise.all([
    prisma.companySettings.findUnique({ where: { companyId }, select: { khipuApiCredential: true } }),
    prisma.salesDocument.findFirst({
      where: { id: salesDocumentId, companyId },
      include: { contact: { select: { razonSocial: true, email: true } }, company: { select: { businessName: true } } },
    }),
  ]);
  if (!settings?.khipuApiCredential) throw new InvoiceLinkError('Primero conecta tu cuenta de Khipu en Configuración → Integraciones');
  if (!doc) throw new InvoiceLinkError('El documento no existe');
  if (doc.status !== 'ISSUED') throw new InvoiceLinkError('Solo se cobran en línea documentos emitidos');
  if (!CASH_ELIGIBLE_DTE_TYPES.includes(doc.dteType)) throw new InvoiceLinkError('Este tipo de documento no se cobra');
  const pending = doc.totalAmount - doc.paidAmount;
  if (pending <= 0) throw new InvoiceLinkError('El documento ya está pagado');

  const appUrl = getAppUrl();
  // Un link vigente por el mismo saldo se reutiliza: reenviarlo no crea otro cobro.
  const current = await prisma.invoicePaymentLink.findFirst({
    where: { companyId, salesDocumentId, status: 'PENDING', amount: pending, expiresAt: { gt: new Date(Date.now() + 60 * 60 * 1000) }, paymentUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (current) return { url: `${appUrl}/pagar/factura/${current.accessToken}`, amount: pending };

  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const link = await prisma.invoicePaymentLink.create({
    data: { companyId, salesDocumentId, provider: PROVIDER, amount: pending, accessToken: crypto.randomBytes(32).toString('hex'), expiresAt },
  });

  try {
    const label = `${DTE_TYPE_LABELS[doc.dteType]} N° ${doc.folio ?? '—'}`;
    const created = await createKhipuPayment(decryptPaymentCredential(settings.khipuApiCredential), {
      subject: `${label} — ${doc.company.businessName}`,
      amount: pending,
      transactionId: link.id,
      returnUrl: `${appUrl}/pagar/factura/${link.accessToken}`,
      cancelUrl: `${appUrl}/pagar/factura/${link.accessToken}`,
      notifyUrl: `${appUrl}/api/public/installments/khipu/notify`,
      expiresAt,
      payerName: doc.contact.razonSocial,
      payerEmail: doc.contact.email ?? undefined,
      body: `Pago de ${label} a ${doc.company.businessName}`,
    });
    await prisma.invoicePaymentLink.updateMany({ where: { id: link.id, companyId }, data: { providerPaymentId: created.paymentId, paymentUrl: created.paymentUrl } });
  } catch (error) {
    await prisma.invoicePaymentLink.updateMany({ where: { id: link.id, companyId }, data: { status: 'FAILED' } });
    captureException(error, { module: 'cobro-en-linea-facturas', companyId, extra: { salesDocumentId, reason: 'khipu-create' } });
    throw new InvoiceLinkError('Khipu no pudo crear el cobro. Revisa la llave de Khipu en Configuración → Integraciones.');
  }
  return { url: `${appUrl}/pagar/factura/${link.accessToken}`, amount: pending };
}

/**
 * Consulta el cobro a Khipu y, si está pagado, registra el cobro del
 * documento en Tesorería (con su asiento). ÚNICO camino a PAID. Idempotente:
 * el lock sobre el link impide aplicar el mismo pago dos veces.
 * Lanza si Khipu no responde, para que la notificación se reintente.
 */
export async function syncInvoiceLink(linkId: string): Promise<OnlinePaymentStatus> {
  const link = await prisma.invoicePaymentLink.findUnique({ where: { id: linkId } });
  if (!link) throw new Error('Link de pago no encontrado');
  if (link.status === 'PAID' || link.status === 'FAILED') return link.status;

  const settings = await prisma.companySettings.findUnique({ where: { companyId: link.companyId }, select: { khipuApiCredential: true } });
  if (!link.providerPaymentId || !settings?.khipuApiCredential) return expireIfStale(link);

  const payment = await getKhipuPayment(decryptPaymentCredential(settings.khipuApiCredential), link.providerPaymentId);
  const verdict = evaluateKhipuPayment(payment, { id: link.id, amount: link.amount });
  if (verdict.outcome === 'FAILED') {
    await prisma.invoicePaymentLink.updateMany({ where: { id: link.id, companyId: link.companyId, status: 'PENDING' }, data: { status: 'FAILED' } });
    return 'FAILED';
  }
  if (verdict.outcome === 'MISMATCH') {
    captureMessage('cobro-en-linea-facturas:cobro-no-calza', 'error', { module: 'cobro-en-linea-facturas', companyId: link.companyId, extra: { linkId, reason: verdict.reason } });
    return link.status;
  }
  if (verdict.outcome === 'PENDING') return payment.status === 'pending' ? expireIfStale(link) : link.status;

  const recorded = await markLinkPaid(link.id, link.companyId, payment.bank ?? null);
  for (const movement of recorded) emitPaymentEvent(link.companyId, movement);
  return 'PAID';
}

/**
 * Registra TODO lo que Khipu cobró. Si entretanto se registró otro abono y el
 * saldo del documento es menor que el link, al documento se aplica solo el
 * saldo y el resto entra igual a Tesorería como anticipo del cliente (la
 * plata está en el banco: dejarla fuera descuadraría la conciliación). El
 * anticipo queda visible para devolverlo o aplicarlo; nunca se inventa en
 * otro documento.
 */
async function markLinkPaid(linkId: string, companyId: string, bank: string | null): Promise<Payment[]> {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InvoicePaymentLink" WHERE id = ${linkId} AND "companyId" = ${companyId} FOR UPDATE`;
    const link = await tx.invoicePaymentLink.findFirst({ where: { id: linkId, companyId } });
    if (!link || link.status === 'PAID') return { movements: [], excess: 0 };
    await tx.$queryRaw`SELECT id FROM "SalesDocument" WHERE id = ${link.salesDocumentId} AND "companyId" = ${companyId} FOR UPDATE`;
    const doc = await tx.salesDocument.findFirst({
      where: { id: link.salesDocumentId, companyId },
      select: { totalAmount: true, paidAmount: true, contactId: true, projectId: true, folio: true, dteType: true },
    });
    const pending = doc ? Math.max(0, doc.totalAmount - doc.paidAmount) : 0;
    const applied = Math.min(pending, link.amount);
    const excess = link.amount - applied;
    const origin = `Pago en línea (Khipu)${bank ? ` desde ${bank}` : ''}`;
    const movements: Payment[] = [];
    if (applied > 0) {
      movements.push(
        await registerSalesPaymentInTx(tx, companyId, link.salesDocumentId, {
          amount: applied,
          paymentMethod: 'TRANSFERENCIA',
          referenceNumber: link.providerPaymentId ?? undefined,
          notes: origin,
        })
      );
    }
    if (excess > 0) {
      const label = doc ? `${DTE_TYPE_LABELS[doc.dteType]} N° ${doc.folio ?? '—'}` : 'documento';
      movements.push(
        await recordTreasuryMovement(tx, {
          companyId,
          direction: 'INCOME',
          amount: excess,
          method: 'TRANSFERENCIA',
          source: 'INVOICE_PAYMENT_LINK',
          sourceId: link.id,
          description: `Pago por sobre el saldo de ${label}: anticipo del cliente por devolver o aplicar`,
          counterpartKey: 'ANTICIPOS_CLIENTES',
          contactId: doc?.contactId ?? null,
          projectId: doc?.projectId ?? null,
          referenceNumber: link.providerPaymentId,
          notes: origin,
        })
      );
    }
    await tx.invoicePaymentLink.updateMany({ where: { id: linkId, companyId }, data: { status: 'PAID', paidAt: new Date(), paymentId: movements[0]?.id ?? null } });
    return { movements, excess };
  }, LOCKING_TX_OPTIONS);

  if (outcome.excess > 0) {
    captureMessage('cobro-en-linea-facturas:pago-excedente', 'warn', { module: 'cobro-en-linea-facturas', companyId, extra: { linkId, excess: outcome.excess } });
  }
  return outcome.movements;
}

async function expireIfStale(link: InvoicePaymentLink): Promise<OnlinePaymentStatus> {
  if (link.status !== 'PENDING' || link.expiresAt.getTime() + EXPIRY_GRACE_MS > Date.now()) return link.status;
  await prisma.invoicePaymentLink.updateMany({ where: { id: link.id, companyId: link.companyId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
  return 'EXPIRED';
}

/** Notificación de Khipu para un link de factura. `unknown` si el cobro no es de un link. */
export async function handleInvoiceLinkNotification(paymentId: string): Promise<'processed' | 'unknown'> {
  const link = await prisma.invoicePaymentLink.findFirst({ where: { provider: PROVIDER, providerPaymentId: paymentId }, select: { id: true } });
  if (!link) return 'unknown';
  await syncInvoiceLink(link.id);
  return 'processed';
}

export interface PublicInvoiceLinkView {
  status: OnlinePaymentStatus;
  companyName: string;
  documentLabel: string;
  customerName: string;
  amount: number;
  paymentUrl: string | null;
  paidAt: string | null;
}

/** Página pública del link: si sigue pendiente, consulta a Khipu en ese momento. */
export async function getPublicInvoiceLink(accessToken: string): Promise<PublicInvoiceLinkView | null> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const found = await prisma.invoicePaymentLink.findUnique({ where: { accessToken }, select: { id: true, status: true } });
  if (!found) return null;
  if (found.status === 'PENDING') {
    await syncInvoiceLink(found.id).catch((error) => captureException(error, { module: 'cobro-en-linea-facturas', extra: { linkId: found.id, reason: 'status-page-sync' } }));
  }
  const link = await prisma.invoicePaymentLink.findUnique({
    where: { accessToken },
    include: { salesDocument: { select: { dteType: true, folio: true, contact: { select: { razonSocial: true } }, company: { select: { businessName: true } } } } },
  });
  if (!link) return null;
  return {
    status: link.status,
    companyName: link.salesDocument.company.businessName,
    documentLabel: `${DTE_TYPE_LABELS[link.salesDocument.dteType]} N° ${link.salesDocument.folio ?? '—'}`,
    customerName: link.salesDocument.contact.razonSocial,
    amount: link.amount,
    paymentUrl: link.status === 'PENDING' ? link.paymentUrl : null,
    paidAt: link.paidAt?.toISOString() ?? null,
  };
}
