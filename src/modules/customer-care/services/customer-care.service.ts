import crypto from 'crypto';
import type { FollowUpReason, FollowUpStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { channelBreakdown, type ChannelShare } from '@/lib/customer-care/channels';
import { findInactiveCustomers, type InactiveCustomer } from '@/lib/customer-care/inactive';
import { computeSurveyMetrics, needsFollowUp, type SurveyMetrics } from '@/lib/customer-care/metrics';
import { DEFAULT_FOLLOW_UP_MESSAGE, DEFAULT_SURVEY_INTRO } from '@/lib/customer-care/messages';
import type { CustomerCareSettingsInput, FollowUpInput, SurveyResponseInput } from '../schema';

/**
 * Fidelización y voz del cliente. Todo sale de datos reales: las ventas
 * emitidas (para detectar quién dejó de comprar) y las encuestas contestadas
 * (para el NPS y la satisfacción). Una métrica sin datos se omite.
 *
 * El enlace de la encuesta (`/encuesta/[token]`) resuelve empresa y cliente
 * desde la base: quien contesta nunca manda un `companyId`.
 */

export class CustomerCareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerCareError';
  }
}

/** Errores que sí se le explican a quien abre el enlace público. */
export class PublicSurveyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSurveyError';
  }
}

const DEFAULT_INACTIVE_DAYS = 60;
/** Documentos que cuentan como una compra (sin guías, cotizaciones ni notas de crédito). */
const PURCHASE_DTE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;

export function newSurveyToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function day(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

// ── Configuración ────────────────────────────────────────────────────────────

export interface CustomerCareSettingsView {
  inactiveAfterDays: number;
  deliveryLeadDays: number | null;
  surveyIntro: string;
  followUpMessage: string;
}

export async function getSettings(companyId: string): Promise<CustomerCareSettingsView> {
  const row = await prisma.customerCareSettings.findUnique({ where: { companyId } });
  return {
    inactiveAfterDays: row?.inactiveAfterDays ?? DEFAULT_INACTIVE_DAYS,
    deliveryLeadDays: row?.deliveryLeadDays ?? null,
    surveyIntro: row?.surveyIntro || DEFAULT_SURVEY_INTRO,
    followUpMessage: row?.followUpMessage || DEFAULT_FOLLOW_UP_MESSAGE,
  };
}

export async function saveSettings(companyId: string, input: CustomerCareSettingsInput): Promise<void> {
  const data = {
    inactiveAfterDays: input.inactiveAfterDays,
    deliveryLeadDays: input.deliveryLeadDays ?? null,
    surveyIntro: input.surveyIntro || null,
    followUpMessage: input.followUpMessage || null,
  };
  await prisma.customerCareSettings.upsert({ where: { companyId }, update: data, create: { companyId, ...data } });
}

// ── Canal de origen ──────────────────────────────────────────────────────────

export async function setContactChannel(companyId: string, contactId: string, channel: string, note: string | undefined): Promise<void> {
  const result = await prisma.contact.updateMany({
    where: { id: contactId, companyId },
    data: { acquisitionChannel: channel, acquisitionNote: note || null },
  });
  if (result.count === 0) throw new CustomerCareError('Cliente no encontrado');
}

// ── Panel ────────────────────────────────────────────────────────────────────

export interface CustomerCareDashboard {
  metrics: SurveyMetrics;
  surveysSent: number;
  /** Porcentaje entero de encuestas enviadas que se contestaron; `null` si no hay enviadas. */
  responseRate: number | null;
  channels: ChannelShare[];
  customersWithoutChannel: Array<{ id: string; name: string }>;
  inactiveCount: number;
  openFollowUps: number;
  inactiveAfterDays: number;
}

export async function getDashboard(companyId: string, now: Date = new Date()): Promise<CustomerCareDashboard> {
  const settings = await getSettings(companyId);
  const [surveys, customers, openFollowUps, inactive] = await Promise.all([
    prisma.customerSurvey.findMany({ where: { companyId }, select: { respondedAt: true, csat: true, nps: true } }),
    prisma.contact.findMany({
      where: { companyId, isCustomer: true, NOT: { rutClean: { startsWith: '66666666' } } },
      select: { id: true, razonSocial: true, nombreFantasia: true, acquisitionChannel: true },
    }),
    prisma.customerFollowUp.count({ where: { companyId, status: 'OPEN' } }),
    listInactiveCustomers(companyId, settings.inactiveAfterDays, now),
  ]);
  const answered = surveys.filter((s) => s.respondedAt);
  return {
    metrics: computeSurveyMetrics(answered.map((s) => ({ csat: s.csat, nps: s.nps }))),
    surveysSent: surveys.length,
    responseRate: surveys.length === 0 ? null : Math.round((answered.length / surveys.length) * 100),
    channels: channelBreakdown(customers.map((c) => c.acquisitionChannel)),
    customersWithoutChannel: customers.filter((c) => !c.acquisitionChannel).slice(0, 50).map((c) => ({ id: c.id, name: c.nombreFantasia || c.razonSocial })),
    inactiveCount: inactive.length,
    openFollowUps,
    inactiveAfterDays: settings.inactiveAfterDays,
  };
}

// ── Clientes inactivos ───────────────────────────────────────────────────────

export interface InactiveCustomerRow extends InactiveCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  hasOpenFollowUp: boolean;
}

async function listInactiveCustomers(companyId: string, inactiveAfterDays: number, now: Date): Promise<InactiveCustomer[]> {
  const documents = await prisma.salesDocument.findMany({
    where: { companyId, status: 'ISSUED', dteType: { in: [...PURCHASE_DTE_TYPES] } },
    select: { contactId: true, issueDate: true, totalAmount: true, contact: { select: { rutClean: true } } },
  });
  return findInactiveCustomers(
    documents.map((d) => ({ contactId: d.contactId, rutClean: d.contact.rutClean, issueDate: d.issueDate, totalAmount: d.totalAmount })),
    now,
    inactiveAfterDays
  );
}

export async function getInactiveCustomerRows(companyId: string, now: Date = new Date()): Promise<InactiveCustomerRow[]> {
  const settings = await getSettings(companyId);
  const inactive = await listInactiveCustomers(companyId, settings.inactiveAfterDays, now);
  if (inactive.length === 0) return [];
  const ids = inactive.slice(0, 200).map((i) => i.contactId);
  const [contacts, open] = await Promise.all([
    prisma.contact.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, razonSocial: true, nombreFantasia: true, phone: true, email: true } }),
    prisma.customerFollowUp.findMany({ where: { companyId, status: 'OPEN', contactId: { in: ids } }, select: { contactId: true } }),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const openIds = new Set(open.map((o) => o.contactId));
  return inactive
    .slice(0, 200)
    .flatMap((item) => {
      const contact = byId.get(item.contactId);
      if (!contact) return [];
      return [{ ...item, name: contact.nombreFantasia || contact.razonSocial, phone: contact.phone, email: contact.email, hasOpenFollowUp: openIds.has(item.contactId) }];
    });
}

/**
 * Abre un seguimiento para cada cliente inactivo que aún no tenga uno abierto.
 * Idempotente: correrlo dos veces no duplica tareas.
 */
export async function generateInactiveFollowUps(companyId: string, createdById: string, now: Date = new Date()): Promise<number> {
  const rows = await getInactiveCustomerRows(companyId, now);
  const pending = rows.filter((row) => !row.hasOpenFollowUp);
  if (pending.length === 0) return 0;
  const result = await prisma.customerFollowUp.createMany({
    data: pending.map((row) => ({
      companyId,
      contactId: row.contactId,
      reason: 'INACTIVE' as FollowUpReason,
      dueDate: now,
      assignedToId: createdById,
      note: `Sin compras hace ${row.daysSince} días (${row.purchaseCount} compra${row.purchaseCount === 1 ? '' : 's'} anteriores).`,
    })),
  });
  return result.count;
}

// ── Seguimientos ─────────────────────────────────────────────────────────────

export interface FollowUpRow {
  id: string;
  contactId: string;
  contactName: string;
  phone: string | null;
  reason: FollowUpReason;
  status: FollowUpStatus;
  dueDate: Date;
  note: string | null;
  outcome: string | null;
  assignedToId: string | null;
}

export async function listFollowUps(companyId: string, status: FollowUpStatus | 'ALL' = 'OPEN'): Promise<FollowUpRow[]> {
  const rows = await prisma.customerFollowUp.findMany({
    where: { companyId, ...(status === 'ALL' ? {} : { status }) },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 300,
    include: { contact: { select: { razonSocial: true, nombreFantasia: true, phone: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.contact.nombreFantasia || r.contact.razonSocial,
    phone: r.contact.phone,
    reason: r.reason,
    status: r.status,
    dueDate: r.dueDate,
    note: r.note,
    outcome: r.outcome,
    assignedToId: r.assignedToId,
  }));
}

async function assertAssignee(companyId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const user = await prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true } });
  if (!user) throw new CustomerCareError('Responsable no encontrado');
}

export async function createFollowUp(companyId: string, createdById: string, input: FollowUpInput): Promise<{ id: string }> {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
  if (!contact) throw new CustomerCareError('Cliente no encontrado');
  await assertAssignee(companyId, input.assignedToId);
  const created = await prisma.customerFollowUp.create({
    data: {
      companyId,
      contactId: input.contactId,
      reason: input.reason,
      dueDate: day(input.dueDate),
      note: input.note || null,
      assignedToId: input.assignedToId ?? createdById,
    },
    select: { id: true },
  });
  return created;
}

export async function closeFollowUp(companyId: string, id: string, status: 'DONE' | 'SKIPPED', outcome: string | undefined): Promise<void> {
  const result = await prisma.customerFollowUp.updateMany({
    where: { id, companyId, status: 'OPEN' },
    data: { status, outcome: outcome || null, completedAt: new Date() },
  });
  if (result.count === 0) throw new CustomerCareError('El seguimiento no existe o ya estaba cerrado');
}

// ── Encuestas ────────────────────────────────────────────────────────────────

export interface SurveyRow {
  id: string;
  contactName: string;
  token: string;
  createdAt: Date;
  sentAt: Date | null;
  respondedAt: Date | null;
  csat: number | null;
  nps: number | null;
  deliveryOnTime: boolean | null;
  comment: string | null;
}

export async function listSurveys(companyId: string): Promise<SurveyRow[]> {
  const rows = await prisma.customerSurvey.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { contact: { select: { razonSocial: true, nombreFantasia: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    contactName: r.contact.nombreFantasia || r.contact.razonSocial,
    token: r.token,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    respondedAt: r.respondedAt,
    csat: r.csat,
    nps: r.nps,
    deliveryOnTime: r.deliveryOnTime,
    comment: r.comment,
  }));
}

export async function createSurvey(companyId: string, createdById: string, contactId: string, salesDocumentId?: string): Promise<{ id: string; token: string }> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
  if (!contact) throw new CustomerCareError('Cliente no encontrado');
  if (salesDocumentId) {
    const doc = await prisma.salesDocument.findFirst({ where: { id: salesDocumentId, companyId, contactId }, select: { id: true } });
    if (!doc) throw new CustomerCareError('La venta no corresponde a este cliente');
  }
  return prisma.customerSurvey.create({
    data: { companyId, contactId, salesDocumentId: salesDocumentId ?? null, token: newSurveyToken(), createdById },
    select: { id: true, token: true },
  });
}

export async function listCustomerOptions(companyId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.contact.findMany({
    where: { companyId, isCustomer: true, NOT: { rutClean: { startsWith: '66666666' } } },
    orderBy: { razonSocial: 'asc' },
    take: 500,
    select: { id: true, razonSocial: true, nombreFantasia: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.nombreFantasia || r.razonSocial }));
}

export async function markSurveySent(companyId: string, id: string): Promise<void> {
  await prisma.customerSurvey.updateMany({ where: { id, companyId, sentAt: null }, data: { sentAt: new Date() } });
}

// ── Encuesta pública ─────────────────────────────────────────────────────────

export interface PublicSurveyView {
  companyName: string;
  intro: string;
  answered: boolean;
}

export async function getPublicSurvey(token: string): Promise<PublicSurveyView | null> {
  if (!token || token.length < 16 || token.length > 64) return null;
  const survey = await prisma.customerSurvey.findUnique({
    where: { token },
    select: { respondedAt: true, companyId: true, company: { select: { businessName: true, status: true, features: { select: { hasCustomerCare: true } } } } },
  });
  if (!survey) return null;
  if (survey.company.status === 'SUSPENDED' || survey.company.status === 'CANCELLED' || !survey.company.features?.hasCustomerCare) return null;
  const settings = await prisma.customerCareSettings.findUnique({ where: { companyId: survey.companyId }, select: { surveyIntro: true } });
  return { companyName: survey.company.businessName, intro: settings?.surveyIntro || DEFAULT_SURVEY_INTRO, answered: survey.respondedAt !== null };
}

export interface PublicSurveyResult {
  companyId: string;
  contactId: string;
  contactName: string;
  needsFollowUp: boolean;
  nps: number;
  csat: number;
}

/**
 * Registra la respuesta. La condición `respondedAt: null` va dentro del
 * UPDATE, así dos envíos simultáneos no pueden contestar la misma encuesta
 * dos veces. Una respuesta mala abre un seguimiento para llamar al cliente.
 */
export async function submitPublicSurvey(token: string, input: SurveyResponseInput): Promise<PublicSurveyResult> {
  const view = await getPublicSurvey(token);
  if (!view) throw new PublicSurveyError('Este enlace no es válido');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.customerSurvey.updateMany({
      where: { token, respondedAt: null },
      data: { respondedAt: new Date(), csat: input.csat, nps: input.nps, deliveryOnTime: input.deliveryOnTime ?? null, comment: input.comment || null },
    });
    if (updated.count === 0) throw new PublicSurveyError('Esta encuesta ya fue respondida. ¡Gracias!');
    const survey = await tx.customerSurvey.findUniqueOrThrow({
      where: { token },
      select: { companyId: true, contactId: true, contact: { select: { razonSocial: true, nombreFantasia: true } } },
    });
    const contactName = survey.contact.nombreFantasia || survey.contact.razonSocial;
    const bad = needsFollowUp({ csat: input.csat, nps: input.nps });
    if (bad) {
      const open = await tx.customerFollowUp.findFirst({ where: { companyId: survey.companyId, contactId: survey.contactId, reason: 'DETRACTOR', status: 'OPEN' }, select: { id: true } });
      if (!open) {
        await tx.customerFollowUp.create({
          data: {
            companyId: survey.companyId,
            contactId: survey.contactId,
            reason: 'DETRACTOR',
            dueDate: new Date(),
            note: `Respondió la encuesta con satisfacción ${input.csat}/5 y recomendación ${input.nps}/10.${input.comment ? ` Comentó: "${input.comment.slice(0, 200)}"` : ''}`,
          },
        });
      }
    }
    return { companyId: survey.companyId, contactId: survey.contactId, contactName, needsFollowUp: bad, nps: input.nps, csat: input.csat };
  });
}
