import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { InstallmentPaymentOrder, OnlinePaymentStatus } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { cleanRut } from '@/lib/chile/rut';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildInstallmentPaymentReceiptEmail } from '@/lib/email/templates';
import { captureException, captureMessage } from '@/lib/observability';
import { createKhipuPayment, getKhipuPayment, type KhipuPayment } from '@/lib/payments/khipu';
import { decryptPaymentCredential, encryptPaymentCredential } from '@/lib/payments/crypto';
import {
  allocateOrderPayment,
  evaluateKhipuPayment,
  formatReceiptNumber,
  maskPersonName,
  ONLINE_PAYMENT_TTL_MINUTES,
} from '../online-payment-calc';
import type { PublicInstallmentCheckoutInput } from '../schema';
import { buildInstallmentReceiptPdf, receiptFilename } from './receipt-pdf.service';
import { emitPaymentEvent, recordTreasuryMovement } from '@/modules/treasury/services/movements.service';

/**
 * Pago en línea de cuotas/mensualidades de candidatas.
 *
 * Flujo: portal público `/pagar/[token]` (token por empresa) → el visitante
 * ingresa el RUT de la candidata → elige cuotas → se crea una
 * `InstallmentPaymentOrder` y un cobro en Khipu → la persona transfiere →
 * Khipu notifica → `syncOrderWithProvider` CONSULTA el cobro a Khipu con la
 * API key de la empresa y, solo si calza, aplica el pago a las cuotas, numera
 * el comprobante y envía el correo.
 *
 * El RUT no es un secreto en Chile, así que el portal está diseñado para que
 * saberlo solo permita PAGAR: ve el nombre enmascarado, el certamen y los
 * saldos, nunca datos de contacto ni la ficha.
 */

export class PortalNotFoundError extends Error {}
export class OnlinePaymentsDisabledError extends Error {}
export class InstallmentSelectionError extends Error {}
export class PaymentGatewayError extends Error {}

const PROVIDER = 'KHIPU';
const PROVIDER_LABEL = 'Transferencia vía Khipu';
/** Margen tras `expiresAt` antes de dar por vencida una orden: una transferencia puede quedar "verificando" unos minutos. */
const EXPIRY_GRACE_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Configuración (panel interno)
// ---------------------------------------------------------------------------

export interface InstallmentPortalConfig {
  portalToken: string | null;
  khipuConfigured: boolean;
}

export async function getInstallmentPortalConfig(companyId: string): Promise<InstallmentPortalConfig> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { installmentPortalToken: true, khipuApiCredential: true },
  });
  return { portalToken: settings?.installmentPortalToken ?? null, khipuConfigured: Boolean(settings?.khipuApiCredential) };
}

/** Idempotente: compartir el link varias veces no invalida uno que ya circula. */
export async function getOrCreateInstallmentPortalToken(companyId: string): Promise<string> {
  const current = await prisma.companySettings.findUnique({ where: { companyId }, select: { installmentPortalToken: true } });
  if (current?.installmentPortalToken) return current.installmentPortalToken;
  return regenerateInstallmentPortalToken(companyId);
}

/** Invalida el link anterior (p. ej. si se compartió por error fuera de las familias). */
export async function regenerateInstallmentPortalToken(companyId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { installmentPortalToken: token },
    create: { companyId, installmentPortalToken: token },
  });
  return token;
}

/** Guarda (cifrada) o borra la API key de Khipu. Borrarla apaga el cobro en línea del portal. */
export async function setKhipuCredential(companyId: string, apiKey: string | null): Promise<void> {
  const value = apiKey ? encryptPaymentCredential(apiKey) : null;
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { khipuApiCredential: value },
    create: { companyId, khipuApiCredential: value },
  });
}

// ---------------------------------------------------------------------------
// Portal público
// ---------------------------------------------------------------------------

interface ResolvedPortal {
  companyId: string;
  companyName: string;
  bankTransferInfo: string | null;
  khipuApiCredential: string | null;
}

/**
 * Resuelve la empresa SOLO a partir del token. Un portal de una empresa
 * suspendida, cancelada o sin el módulo contratado se comporta como un link
 * inexistente.
 */
async function resolvePortal(token: string): Promise<ResolvedPortal | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const settings = await prisma.companySettings.findUnique({
    where: { installmentPortalToken: token },
    select: {
      companyId: true,
      bankTransferInfo: true,
      khipuApiCredential: true,
      company: { select: { businessName: true, status: true, features: { select: { hasInstallmentPlans: true } } } },
    },
  });
  if (!settings) return null;
  const { company } = settings;
  if (company.status !== 'ACTIVE' && company.status !== 'TRIAL') return null;
  if (!company.features?.hasInstallmentPlans) return null;
  return {
    companyId: settings.companyId,
    companyName: company.businessName,
    bankTransferInfo: settings.bankTransferInfo,
    khipuApiCredential: settings.khipuApiCredential,
  };
}

export interface PublicPortalInfo {
  companyName: string;
  onlinePaymentsEnabled: boolean;
  bankTransferInfo: string | null;
}

export async function getPublicInstallmentPortal(token: string): Promise<PublicPortalInfo | null> {
  const portal = await resolvePortal(token);
  if (!portal) return null;
  return {
    companyName: portal.companyName,
    onlinePaymentsEnabled: Boolean(portal.khipuApiCredential),
    bankTransferInfo: portal.bankTransferInfo,
  };
}

export interface PublicInstallmentView {
  id: string;
  installmentNumber: number;
  dueDate: string;
  pendingAmount: number;
  overdue: boolean;
  /** Hay un pago en curso (orden PENDING vigente) para esta cuota. */
  inProgress: boolean;
}

export interface PublicPlanView {
  planId: string;
  projectName: string | null;
  installmentCount: number;
  paidCount: number;
  installments: PublicInstallmentView[];
}

export interface PublicLookupResult {
  candidateName: string | null;
  plans: PublicPlanView[];
}

/**
 * Paso 1 del portal. La respuesta es la MISMA para "no existe una candidata
 * con ese RUT" y "existe pero no tiene cuotas pendientes": el portal no sirve
 * para averiguar quién postuló a un certamen.
 */
export async function lookupPublicInstallments(token: string, rut: string): Promise<PublicLookupResult> {
  const portal = await resolvePortal(token);
  if (!portal) throw new PortalNotFoundError('Link de pago inválido o expirado');

  const rutClean = cleanRut(rut);
  const now = new Date();
  const plans = await prisma.paymentPlan.findMany({
    where: { companyId: portal.companyId, status: 'ACTIVE', candidate: { rutClean } },
    include: {
      candidate: { select: { fullName: true, project: { select: { name: true } } } },
      installments: {
        orderBy: { installmentNumber: 'asc' },
        include: {
          onlinePayments: { where: { order: { status: 'PENDING', expiresAt: { gt: now } } }, select: { id: true } },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });

  const views: PublicPlanView[] = plans
    .map((plan) => ({
      planId: plan.id,
      projectName: plan.candidate?.project.name ?? null,
      installmentCount: plan.installmentCount,
      paidCount: plan.installments.filter((i) => i.paymentStatus === 'PAID').length,
      installments: plan.installments
        .filter((i) => i.paymentStatus !== 'PAID' && i.amount - i.paidAmount > 0)
        .map((i) => ({
          id: i.id,
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate.toISOString(),
          pendingAmount: i.amount - i.paidAmount,
          overdue: i.dueDate < now,
          inProgress: i.onlinePayments.length > 0,
        })),
    }))
    .filter((plan) => plan.installments.length > 0);

  const fullName = plans[0]?.candidate?.fullName;
  return { candidateName: views.length > 0 && fullName ? maskPersonName(fullName) : null, plans: views };
}

/**
 * Paso 2: crea la orden y el cobro en Khipu, y devuelve la URL de pago.
 *
 * La validación va dentro de una transacción con lock sobre las cuotas
 * (mismo patrón que `registerInstallmentPayment`) para que dos personas
 * pagando la misma cuota a la vez no generen dos órdenes. Si ya hay una orden
 * vigente EXACTAMENTE para esas cuotas (la misma persona que volvió atrás o
 * recargó), se reutiliza su cobro en vez de abrir otro.
 */
export async function createOnlinePaymentOrder(
  token: string,
  input: PublicInstallmentCheckoutInput
): Promise<{ paymentUrl: string; accessToken: string }> {
  const portal = await resolvePortal(token);
  if (!portal) throw new PortalNotFoundError('Link de pago inválido o expirado');
  if (!portal.khipuApiCredential) {
    throw new OnlinePaymentsDisabledError('El pago en línea no está habilitado. Contacta a la organización para pagar por transferencia.');
  }

  const { companyId } = portal;
  const rutClean = cleanRut(input.rut);
  const ids = [...input.installmentIds].sort();

  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentPlanInstallment" WHERE id = ANY(${ids}) AND "companyId" = ${companyId} ORDER BY id FOR UPDATE`;

    const now = new Date();
    const installments = await tx.paymentPlanInstallment.findMany({
      where: { id: { in: ids }, companyId, paymentPlan: { status: 'ACTIVE', candidate: { rutClean } } },
      include: {
        paymentPlan: {
          select: { id: true, candidate: { select: { fullName: true, project: { select: { name: true } } } } },
        },
        onlinePayments: {
          where: { order: { status: 'PENDING', expiresAt: { gt: now } } },
          select: { orderId: true },
        },
      },
      orderBy: { installmentNumber: 'asc' },
    });

    if (installments.length !== ids.length) {
      throw new InstallmentSelectionError('Alguna de las cuotas seleccionadas ya no está disponible. Vuelve a consultar tu RUT.');
    }
    const planIds = new Set(installments.map((i) => i.paymentPlanId));
    if (planIds.size > 1) throw new InstallmentSelectionError('Paga las cuotas de un plan a la vez.');

    for (const installment of installments) {
      if (installment.paymentStatus === 'PAID' || installment.amount - installment.paidAmount <= 0) {
        throw new InstallmentSelectionError(`La cuota N° ${installment.installmentNumber} ya está pagada.`);
      }
    }

    const inProgressOrderIds = new Set(installments.flatMap((i) => i.onlinePayments.map((p) => p.orderId)));
    if (inProgressOrderIds.size > 0) {
      const [orderId] = [...inProgressOrderIds];
      const existing =
        inProgressOrderIds.size === 1 && orderId
          ? await tx.installmentPaymentOrder.findFirst({ where: { id: orderId, companyId }, include: { items: { select: { installmentId: true } } } })
          : null;
      const sameSelection =
        existing !== null && existing.items.length === ids.length && existing.items.every((item) => ids.includes(item.installmentId));
      // Solo se reanuda la orden de la MISMA persona (mismo correo). El RUT de
      // una candidata no es secreto: sin este chequeo, cualquiera que lo
      // supiera recibía el `accessToken` de la orden ajena y con él, una vez
      // pagada, el comprobante con nombre y correo de quien pagó.
      const samePayer = existing !== null && existing.payerEmail === input.payerEmail.toLowerCase();
      if (existing && sameSelection && samePayer) return { order: existing, reused: true as const };

      const busy = installments.find((i) => i.onlinePayments.length > 0);
      throw new InstallmentSelectionError(
        `Ya hay un pago en curso para la cuota N° ${busy?.installmentNumber ?? ''}. Termínalo o espera a que venza (hasta ${ONLINE_PAYMENT_TTL_MINUTES} minutos).`
      );
    }

    const plan = installments[0]!.paymentPlan;
    const amount = installments.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0);
    const order = await tx.installmentPaymentOrder.create({
      data: {
        companyId,
        paymentPlanId: plan.id,
        provider: PROVIDER,
        amount,
        payerName: input.payerName,
        payerEmail: input.payerEmail.toLowerCase(),
        candidateName: plan.candidate?.fullName ?? '',
        candidateRutClean: rutClean,
        projectName: plan.candidate?.project.name ?? null,
        accessToken: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(now.getTime() + ONLINE_PAYMENT_TTL_MINUTES * 60_000),
        items: {
          create: installments.map((i) => ({
            companyId,
            installmentId: i.id,
            installmentNumber: i.installmentNumber,
            amount: i.amount - i.paidAmount,
          })),
        },
      },
      include: { items: { select: { installmentId: true } } },
    });
    return { order, reused: false as const, installmentNumbers: installments.map((i) => i.installmentNumber) };
  }, LOCKING_TX_OPTIONS);

  const { order } = prepared;
  if (prepared.reused) {
    if (!order.paymentUrl) {
      throw new InstallmentSelectionError('Se está preparando un pago para estas cuotas. Intenta de nuevo en unos segundos.');
    }
    return { paymentUrl: order.paymentUrl, accessToken: order.accessToken };
  }

  const appUrl = getAppUrl();
  try {
    const apiKey = decryptPaymentCredential(portal.khipuApiCredential);
    const numbers = prepared.installmentNumbers.map((n) => `N° ${n}`).join(', ');
    const created = await createKhipuPayment(apiKey, {
      subject: `${prepared.installmentNumbers.length === 1 ? 'Cuota' : 'Cuotas'} ${numbers} — ${maskPersonName(order.candidateName)}${
        order.projectName ? ` — ${order.projectName}` : ''
      }`,
      amount: order.amount,
      transactionId: order.id,
      returnUrl: `${appUrl}/pagar/estado/${order.accessToken}`,
      cancelUrl: `${appUrl}/pagar/${token}`,
      notifyUrl: `${appUrl}/api/public/installments/khipu/notify`,
      expiresAt: order.expiresAt,
      payerName: order.payerName,
      payerEmail: order.payerEmail,
      body: `Pago a ${portal.companyName}`,
    });

    await prisma.installmentPaymentOrder.updateMany({
      where: { id: order.id, companyId },
      data: { providerPaymentId: created.paymentId, paymentUrl: created.paymentUrl },
    });
    return { paymentUrl: created.paymentUrl, accessToken: order.accessToken };
  } catch (error) {
    // Libera las cuotas de inmediato: sin cobro en la pasarela, esta orden no
    // puede recibir dinero.
    await prisma.installmentPaymentOrder.updateMany({ where: { id: order.id, companyId, status: 'PENDING' }, data: { status: 'FAILED' } });
    captureException(error, { module: 'cuotas-pago-en-linea', companyId, extra: { orderId: order.id, reason: 'khipu-create' } });
    throw new PaymentGatewayError('No pudimos conectar con la pasarela de pago. Intenta de nuevo en unos minutos.');
  }
}

// ---------------------------------------------------------------------------
// Confirmación (notificación de Khipu, página de estado)
// ---------------------------------------------------------------------------

/**
 * Consulta el cobro a Khipu y lleva la orden al estado que corresponda. Es
 * el ÚNICO camino que marca una orden como pagada. Idempotente: llamarlo dos
 * veces (notificación + página de estado a la vez) aplica el pago una sola
 * vez gracias al lock y al chequeo de estado dentro de `markOrderPaid`.
 */
export async function syncOrderWithProvider(orderId: string, opts: { throwOnProviderError?: boolean } = {}): Promise<OnlinePaymentStatus> {
  const order = await prisma.installmentPaymentOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Orden de pago no encontrada');
  if (order.status === 'PAID') return 'PAID';

  const settings = await prisma.companySettings.findUnique({
    where: { companyId: order.companyId },
    select: { khipuApiCredential: true },
  });

  if (!order.providerPaymentId || !settings?.khipuApiCredential) {
    return expireIfStale(order);
  }

  let payment: KhipuPayment;
  try {
    payment = await getKhipuPayment(decryptPaymentCredential(settings.khipuApiCredential), order.providerPaymentId);
  } catch (error) {
    captureException(error, { module: 'cuotas-pago-en-linea', companyId: order.companyId, extra: { orderId, reason: 'khipu-get' } });
    // Desde la notificación de Khipu el error se propaga: la ruta responde 500
    // y Khipu reintenta. Tragárselo ahí dejaba un pago confirmado pendiente
    // para siempre si el pagador ya había cerrado el navegador.
    if (opts.throwOnProviderError) throw error;
    return order.status;
  }

  const verdict = evaluateKhipuPayment(payment, order);
  switch (verdict.outcome) {
    case 'PAID':
      await markOrderPaid(order.id, order.companyId, payment);
      return 'PAID';
    case 'FAILED':
      await prisma.installmentPaymentOrder.updateMany({
        where: { id: order.id, companyId: order.companyId, status: { in: ['PENDING', 'EXPIRED'] } },
        data: { status: 'FAILED' },
      });
      return 'FAILED';
    case 'MISMATCH':
      // Dinero posiblemente recibido que no calza con la orden: no se aplica
      // a ciegas, se escala para revisión humana.
      captureMessage('cuotas-pago-en-linea:cobro-no-calza', 'error', {
        module: 'cuotas-pago-en-linea',
        companyId: order.companyId,
        extra: { orderId, providerPaymentId: order.providerPaymentId, reason: verdict.reason },
      });
      return order.status;
    case 'PENDING':
      // "verifying" = Khipu ya tiene la transferencia y la está validando: no se vence.
      return payment.status === 'pending' ? expireIfStale(order) : order.status;
  }
}

async function expireIfStale(order: InstallmentPaymentOrder): Promise<OnlinePaymentStatus> {
  if (order.status !== 'PENDING' || order.expiresAt.getTime() + EXPIRY_GRACE_MS > Date.now()) return order.status;
  await prisma.installmentPaymentOrder.updateMany({
    where: { id: order.id, companyId: order.companyId, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });
  return 'EXPIRED';
}

async function markOrderPaid(orderId: string, companyId: string, payment: KhipuPayment): Promise<void> {
  const paid = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InstallmentPaymentOrder" WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.installmentPaymentOrder.findFirst({ where: { id: orderId, companyId }, include: { items: true } });
    if (!order || order.status === 'PAID') return null;

    const installmentIds = order.items.map((i) => i.installmentId).sort();
    await tx.$queryRaw`SELECT id FROM "PaymentPlanInstallment" WHERE id = ANY(${installmentIds}) AND "companyId" = ${companyId} ORDER BY id FOR UPDATE`;
    const balances = await tx.paymentPlanInstallment.findMany({
      where: { id: { in: installmentIds }, companyId },
      select: { id: true, amount: true, paidAmount: true },
    });

    const now = new Date();
    const { allocations, excess } = allocateOrderPayment(order.items, balances);
    for (const allocation of allocations) {
      if (allocation.applied <= 0) continue;
      await tx.paymentPlanInstallment.updateMany({
        where: { id: allocation.installmentId, companyId },
        data: {
          paidAmount: allocation.newPaidAmount,
          paymentStatus: allocation.paymentStatus,
          paidAt: allocation.paymentStatus === 'PAID' ? now : null,
        },
      });
    }

    // Mismo cierre que `registerInstallmentPayment`: plan completo → COMPLETED.
    const remaining = await tx.paymentPlanInstallment.count({
      where: { paymentPlanId: order.paymentPlanId, companyId, paymentStatus: { not: 'PAID' } },
    });
    if (remaining === 0) {
      await tx.paymentPlan.updateMany({ where: { id: order.paymentPlanId, companyId }, data: { status: 'COMPLETED' } });
    }

    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'INSTALLMENT_RECEIPT' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'INSTALLMENT_RECEIPT', currentFolio: 1 },
    });

    await tx.installmentPaymentOrder.updateMany({
      where: { id: orderId, companyId },
      data: {
        status: 'PAID',
        paidAt: now,
        receiptNumber: seq.currentFolio,
        excessAmount: excess,
        providerReceiptUrl: payment.receipt_url ?? null,
        payerBank: payment.bank ?? null,
      },
    });

    // La transferencia completa ya está en el banco (incluido un eventual
    // excedente, que se devuelve aparte): entra entera a Tesorería.
    const plan = await tx.paymentPlan.findFirst({ where: { id: order.paymentPlanId, companyId }, select: { contactId: true, candidate: { select: { projectId: true } } } });
    const treasuryPayment = await recordTreasuryMovement(tx, {
      companyId,
      direction: 'INCOME',
      amount: order.amount,
      method: 'TRANSFERENCIA',
      date: now,
      source: 'INSTALLMENT',
      sourceId: order.paymentPlanId,
      description: `Pago en línea de cuotas — comprobante N° ${seq.currentFolio} (${order.candidateName})`,
      counterpartKey: 'COBROS_POR_DOCUMENTAR',
      contactId: plan?.contactId ?? null,
      projectId: plan?.candidate?.projectId ?? null,
      referenceNumber: order.providerPaymentId,
    });

    return {
      ...order,
      status: 'PAID' as const,
      paidAt: now,
      receiptNumber: seq.currentFolio,
      excessAmount: excess,
      payerBank: payment.bank ?? null,
      treasuryPayment,
    };
  }, LOCKING_TX_OPTIONS);

  if (!paid) return;
  emitPaymentEvent(companyId, paid.treasuryPayment);

  if (paid.excessAmount > 0) {
    captureMessage('cuotas-pago-en-linea:pago-excedente', 'warn', {
      module: 'cuotas-pago-en-linea',
      companyId,
      extra: { orderId, excessAmount: paid.excessAmount },
    });
  }

  // Fuera de la transacción: un correo caído no revierte un pago confirmado.
  void sendReceiptEmails(paid.id).catch((error) =>
    captureException(error, { module: 'cuotas-pago-en-linea', companyId, extra: { orderId, reason: 'receipt-email' } })
  );
}

async function loadReceiptData(order: InstallmentPaymentOrder & { items: Array<{ installmentNumber: number; amount: number }> }) {
  const [company, plan] = await Promise.all([
    prisma.company.findUnique({ where: { id: order.companyId }, select: { businessName: true, rut: true } }),
    prisma.paymentPlan.findFirst({
      where: { id: order.paymentPlanId, companyId: order.companyId },
      select: { installmentCount: true, candidate: { select: { email: true } } },
    }),
  ]);
  if (!company || order.receiptNumber === null || !order.paidAt) return null;

  return {
    candidateEmail: plan?.candidate?.email ?? null,
    pdfData: {
      companyName: company.businessName,
      companyRut: company.rut,
      receiptNumber: order.receiptNumber,
      paidAt: order.paidAt,
      payerName: order.payerName,
      payerEmail: order.payerEmail,
      candidateName: order.candidateName,
      candidateRutClean: order.candidateRutClean,
      projectName: order.projectName,
      items: [...order.items].sort((a, b) => a.installmentNumber - b.installmentNumber),
      installmentCount: plan?.installmentCount ?? order.items.length,
      amount: order.amount,
      providerLabel: PROVIDER_LABEL,
      providerPaymentId: order.providerPaymentId,
      payerBank: order.payerBank,
    },
  };
}

async function sendReceiptEmails(orderId: string): Promise<void> {
  const order = await prisma.installmentPaymentOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.status !== 'PAID') return;
  const data = await loadReceiptData(order);
  if (!data) return;

  const pdf = Buffer.from(await buildInstallmentReceiptPdf(data.pdfData));
  const receiptUrl = `${getAppUrl()}/pagar/estado/${order.accessToken}`;
  const paidAtLabel = order.paidAt!.toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' });
  const base = {
    companyName: data.pdfData.companyName,
    candidateName: order.candidateName,
    projectName: order.projectName,
    receiptLabel: formatReceiptNumber(data.pdfData.receiptNumber),
    paidAtLabel,
    items: data.pdfData.items,
    installmentCount: data.pdfData.installmentCount,
    amount: order.amount,
    receiptUrl,
  };
  const attachments = [{ filename: receiptFilename(data.pdfData.receiptNumber), content: pdf, contentType: 'application/pdf' }];

  await sendEmail({ to: order.payerEmail, attachments, ...buildInstallmentPaymentReceiptEmail({ ...base, recipientName: order.payerName }) });

  // Copia a la candidata cuando pagó otra persona (familia, auspiciador).
  const candidateEmail = data.candidateEmail?.trim().toLowerCase();
  if (candidateEmail && candidateEmail !== order.payerEmail) {
    await sendEmail({
      to: candidateEmail,
      attachments,
      ...buildInstallmentPaymentReceiptEmail({ ...base, recipientName: maskPersonName(order.candidateName) }),
    });
  }
}

/** La notificación de Khipu solo trae el `payment_id`; el resto se consulta. */
export async function handleKhipuNotification(paymentId: string): Promise<'processed' | 'unknown'> {
  const order = await prisma.installmentPaymentOrder.findFirst({
    where: { provider: PROVIDER, providerPaymentId: paymentId },
    select: { id: true },
  });
  if (!order) return 'unknown';
  await syncOrderWithProvider(order.id, { throwOnProviderError: true });
  return 'processed';
}

export interface PublicOrderView {
  status: OnlinePaymentStatus;
  companyName: string;
  candidateName: string;
  projectName: string | null;
  payerName: string;
  amount: number;
  items: Array<{ installmentNumber: number; amount: number }>;
  receiptLabel: string | null;
  paidAt: string | null;
  paymentUrl: string | null;
}

/**
 * Estado de una orden por su `accessToken` (página a la que vuelve el
 * pagador desde Khipu). Si sigue en curso, consulta a Khipu en ese momento:
 * así el pago se refleja aunque la notificación todavía no haya llegado.
 */
export async function getPublicOrderStatus(accessToken: string): Promise<PublicOrderView | null> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const found = await prisma.installmentPaymentOrder.findUnique({ where: { accessToken }, select: { id: true, status: true } });
  if (!found) return null;
  if (found.status === 'PENDING') await syncOrderWithProvider(found.id);

  const order = await prisma.installmentPaymentOrder.findUnique({
    where: { accessToken },
    include: { items: { select: { installmentNumber: true, amount: true }, orderBy: { installmentNumber: 'asc' } }, company: { select: { businessName: true } } },
  });
  if (!order) return null;

  return {
    status: order.status,
    companyName: order.company.businessName,
    candidateName: maskPersonName(order.candidateName),
    projectName: order.projectName,
    payerName: order.payerName,
    amount: order.amount,
    items: order.items,
    receiptLabel: order.receiptNumber !== null ? formatReceiptNumber(order.receiptNumber) : null,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentUrl: order.status === 'PENDING' ? order.paymentUrl : null,
  };
}

/** PDF del comprobante por `accessToken` (pagador) — solo para órdenes pagadas. */
export async function getReceiptPdfByAccessToken(accessToken: string): Promise<{ pdf: Uint8Array; filename: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const order = await prisma.installmentPaymentOrder.findUnique({ where: { accessToken }, include: { items: true } });
  if (!order || order.status !== 'PAID') return null;
  return renderReceipt(order);
}

/** PDF del comprobante desde el panel interno, filtrado por empresa. */
export async function getReceiptPdfForCompany(companyId: string, orderId: string): Promise<{ pdf: Uint8Array; filename: string } | null> {
  const order = await prisma.installmentPaymentOrder.findFirst({ where: { id: orderId, companyId, status: 'PAID' }, include: { items: true } });
  if (!order) return null;
  return renderReceipt(order);
}

async function renderReceipt(order: InstallmentPaymentOrder & { items: Array<{ installmentNumber: number; amount: number }> }) {
  const data = await loadReceiptData(order);
  if (!data) return null;
  return { pdf: await buildInstallmentReceiptPdf(data.pdfData), filename: receiptFilename(data.pdfData.receiptNumber) };
}

// ---------------------------------------------------------------------------
// Panel interno
// ---------------------------------------------------------------------------

export interface OnlinePaymentRow {
  id: string;
  status: OnlinePaymentStatus;
  amount: number;
  excessAmount: number;
  payerName: string;
  payerEmail: string;
  payerBank: string | null;
  receiptLabel: string | null;
  createdAt: Date;
  paidAt: Date | null;
  installmentNumbers: number[];
}

export async function listOnlinePaymentsForPlan(companyId: string, paymentPlanId: string): Promise<OnlinePaymentRow[]> {
  const orders = await prisma.installmentPaymentOrder.findMany({
    where: { companyId, paymentPlanId },
    include: { items: { select: { installmentNumber: true }, orderBy: { installmentNumber: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    amount: o.amount,
    excessAmount: o.excessAmount,
    payerName: o.payerName,
    payerEmail: o.payerEmail,
    payerBank: o.payerBank,
    receiptLabel: o.receiptNumber !== null ? formatReceiptNumber(o.receiptNumber) : null,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    installmentNumbers: o.items.map((i) => i.installmentNumber),
  }));
}

/** "Revisar ahora" desde el panel: fuerza la consulta a Khipu de una orden en curso. */
export async function refreshOnlinePayment(companyId: string, orderId: string): Promise<OnlinePaymentStatus> {
  const order = await prisma.installmentPaymentOrder.findFirst({ where: { id: orderId, companyId }, select: { id: true } });
  if (!order) throw new Error('Pago en línea no encontrado');
  return syncOrderWithProvider(order.id);
}
