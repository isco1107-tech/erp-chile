import type { CollectionNote, CollectionNoteKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/mailer';
import { buildPaymentReminderEmail } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { formatRut } from '@/lib/chile/rut';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { addToAging, daysPastDue, describeStage, emptyAging, normalizeReminderDays, reminderStageToSend, type AgingTotals } from '@/lib/treasury/collections';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';

/** Documentos que son deuda del cliente (misma exclusión que CxC: guías, cotizaciones y NC no). */
const RECEIVABLE_WHERE = {
  status: 'ISSUED' as const,
  paymentStatus: { not: 'PAID' as const },
  dteType: { notIn: ['GUIA_DESPACHO_52' as const, 'COTIZACION' as const, 'NOTA_CREDITO_61' as const] },
};

export interface CollectionCustomerRow {
  contactId: string;
  razonSocial: string;
  rut: string;
  email: string | null;
  phone: string | null;
  remindersPaused: boolean;
  documents: number;
  oldestDaysLate: number;
  aging: AgingTotals;
  lastNote: { kind: CollectionNoteKind; note: string; createdAt: Date; createdByName: string | null } | null;
  nextPromise: { date: Date; amount: number | null } | null;
  lastReminderAt: Date | null;
}

export interface CollectionsOverview {
  totals: AgingTotals;
  customers: CollectionCustomerRow[];
  promisesDueToday: number;
  brokenPromises: number;
}

export async function getCollectionsOverview(companyId: string, now: Date): Promise<CollectionsOverview> {
  const today = startOfTodaySantiago(now);
  const docs = await prisma.salesDocument.findMany({
    where: { companyId, ...RECEIVABLE_WHERE },
    select: {
      contactId: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      contact: { select: { razonSocial: true, rut: true, email: true, phone: true, collectionRemindersPaused: true } },
    },
    take: 20_000,
  });

  const byContact = new Map<string, CollectionCustomerRow>();
  const totals = emptyAging();
  for (const doc of docs) {
    const balance = doc.totalAmount - doc.paidAmount;
    if (balance <= 0) continue;
    const late = daysPastDue(doc.dueDate, today);
    addToAging(totals, balance, late);
    let row = byContact.get(doc.contactId);
    if (!row) {
      row = {
        contactId: doc.contactId,
        razonSocial: doc.contact.razonSocial,
        rut: doc.contact.rut,
        email: doc.contact.email,
        phone: doc.contact.phone,
        remindersPaused: doc.contact.collectionRemindersPaused,
        documents: 0,
        oldestDaysLate: late,
        aging: emptyAging(),
        lastNote: null,
        nextPromise: null,
        lastReminderAt: null,
      };
      byContact.set(doc.contactId, row);
    }
    row.documents += 1;
    row.oldestDaysLate = Math.max(row.oldestDaysLate, late);
    addToAging(row.aging, balance, late);
  }

  const contactIds = [...byContact.keys()];
  let promisesDueToday = 0;
  let brokenPromises = 0;
  if (contactIds.length > 0) {
    const [notes, reminders] = await Promise.all([
      prisma.collectionNote.findMany({
        where: { companyId, contactId: { in: contactIds } },
        orderBy: { createdAt: 'desc' },
        select: { contactId: true, kind: true, note: true, createdAt: true, createdByName: true, promiseDate: true, promiseAmount: true },
        take: 5000,
      }),
      prisma.collectionReminderLog.groupBy({ by: ['contactId'], where: { companyId, contactId: { in: contactIds } }, _max: { sentAt: true } }),
    ]);
    for (const note of notes) {
      const row = byContact.get(note.contactId);
      if (!row) continue;
      if (!row.lastNote) row.lastNote = { kind: note.kind, note: note.note, createdAt: note.createdAt, createdByName: note.createdByName };
      // Solo cuenta la promesa más reciente de cada cliente.
      if (note.kind === 'PROMISE' && note.promiseDate && row.nextPromise === null) {
        row.nextPromise = { date: note.promiseDate, amount: note.promiseAmount };
        const promiseDay = startOfTodaySantiago(note.promiseDate).getTime();
        if (promiseDay === today.getTime()) promisesDueToday += 1;
        else if (promiseDay < today.getTime() && row.aging.overdue > 0) brokenPromises += 1;
      }
    }
    for (const reminder of reminders) {
      const row = byContact.get(reminder.contactId);
      if (row) row.lastReminderAt = reminder._max.sentAt;
    }
  }

  const customers = [...byContact.values()].sort((a, b) => b.aging.overdue - a.aging.overdue || b.aging.total - a.aging.total);
  return { totals, customers, promisesDueToday, brokenPromises };
}

export interface CustomerCollectionDetail {
  documents: Array<{ id: string; label: string; issueDate: Date; dueDate: Date | null; total: number; balance: number; daysLate: number; remindersSent: number[] }>;
  notes: CollectionNote[];
}

export async function getCustomerCollectionDetail(companyId: string, contactId: string, now: Date): Promise<CustomerCollectionDetail> {
  const today = startOfTodaySantiago(now);
  const [docs, notes] = await Promise.all([
    prisma.salesDocument.findMany({
      where: { companyId, contactId, ...RECEIVABLE_WHERE },
      select: { id: true, dteType: true, folio: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, collectionReminderLogs: { select: { stage: true } } },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
      take: 500,
    }),
    prisma.collectionNote.findMany({ where: { companyId, contactId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return {
    documents: docs.map((doc) => ({
      id: doc.id,
      label: `${DTE_TYPE_LABELS[doc.dteType as keyof typeof DTE_TYPE_LABELS] ?? doc.dteType} N° ${doc.folio ?? 's/n'}`,
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      total: doc.totalAmount,
      balance: doc.totalAmount - doc.paidAmount,
      daysLate: daysPastDue(doc.dueDate, today),
      remindersSent: doc.collectionReminderLogs.map((log) => log.stage).sort((a, b) => a - b),
    })),
    notes,
  };
}

export async function addCollectionNote(
  companyId: string,
  user: { id: string; name: string | null },
  input: { contactId: string; salesDocumentId?: string; kind: CollectionNoteKind; note: string; promiseDate?: string; promiseAmount?: number }
): Promise<CollectionNote> {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
  if (!contact) throw new Error('Cliente no encontrado');
  if (input.salesDocumentId) {
    const doc = await prisma.salesDocument.findFirst({ where: { id: input.salesDocumentId, companyId, contactId: input.contactId }, select: { id: true } });
    if (!doc) throw new Error('Documento no encontrado');
  }
  return prisma.collectionNote.create({
    data: {
      companyId,
      contactId: input.contactId,
      salesDocumentId: input.salesDocumentId || null,
      kind: input.kind,
      note: input.note,
      promiseDate: input.kind === 'PROMISE' && input.promiseDate ? new Date(`${input.promiseDate}T12:00:00Z`) : null,
      promiseAmount: input.kind === 'PROMISE' ? (input.promiseAmount ?? null) : null,
      createdById: user.id,
      createdByName: user.name,
    },
  });
}

export async function setContactRemindersPaused(companyId: string, contactId: string, paused: boolean): Promise<void> {
  const result = await prisma.contact.updateMany({ where: { id: contactId, companyId }, data: { collectionRemindersPaused: paused } });
  if (result.count === 0) throw new Error('Cliente no encontrado');
}

export interface CollectionSettings {
  enabled: boolean;
  days: number[];
}

export async function getCollectionSettings(companyId: string): Promise<CollectionSettings> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { collectionRemindersEnabled: true, collectionReminderDays: true } });
  return { enabled: settings?.collectionRemindersEnabled ?? false, days: normalizeReminderDays(settings?.collectionReminderDays ?? []) };
}

export async function updateCollectionSettings(companyId: string, input: CollectionSettings): Promise<CollectionSettings> {
  const days = normalizeReminderDays(input.days);
  if (input.enabled && days.length === 0) throw new Error('Elige al menos un momento para recordar');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { collectionRemindersEnabled: input.enabled, collectionReminderDays: days },
    create: { companyId, collectionRemindersEnabled: input.enabled, collectionReminderDays: days },
  });
  return { enabled: input.enabled, days };
}

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/**
 * Cobranza automática (opt-in por empresa): un correo por cliente con los
 * documentos que hoy alcanzan un hito configurado. Cada documento recibe cada
 * hito una sola vez (`CollectionReminderLog`), así que reintentar el cron no
 * duplica correos. Un cliente pausado o sin correo no recibe nada.
 */
export async function runCollectionRemindersCron(now: Date = new Date()): Promise<{ processedCompanies: number; emailsSent: number }> {
  const companies = await prisma.company.findMany({
    where: { status: { in: [...OPERATIONAL_STATUSES] }, features: { hasTreasury: true }, settings: { collectionRemindersEnabled: true } },
    select: { id: true, businessName: true, rut: true, phone: true, settings: { select: { collectionReminderDays: true } } },
  });
  const today = startOfTodaySantiago(now);
  let processedCompanies = 0;
  let emailsSent = 0;

  for (const company of companies) {
    try {
      const stages = normalizeReminderDays(company.settings?.collectionReminderDays ?? []);
      if (stages.length === 0) continue;
      const docs = await prisma.salesDocument.findMany({
        where: { companyId: company.id, ...RECEIVABLE_WHERE, dueDate: { not: null }, contact: { email: { not: null }, collectionRemindersPaused: false } },
        select: {
          id: true,
          contactId: true,
          dteType: true,
          folio: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          contact: { select: { razonSocial: true, email: true } },
          collectionReminderLogs: { select: { stage: true } },
        },
        take: 5000,
      });

      const byContact = new Map<string, { email: string; name: string; items: Array<{ docId: string; stage: number; dteLabel: string; folio: number | null; dueDate: Date | null; amount: number }> }>();
      for (const doc of docs) {
        const balance = doc.totalAmount - doc.paidAmount;
        if (balance <= 0 || !doc.contact.email) continue;
        const stage = reminderStageToSend(daysPastDue(doc.dueDate, today), stages, doc.collectionReminderLogs.map((log) => log.stage));
        if (stage === null) continue;
        const entry = byContact.get(doc.contactId) ?? { email: doc.contact.email, name: doc.contact.razonSocial, items: [] };
        entry.items.push({ docId: doc.id, stage, dteLabel: DTE_TYPE_LABELS[doc.dteType as keyof typeof DTE_TYPE_LABELS] ?? doc.dteType, folio: doc.folio, dueDate: doc.dueDate, amount: balance });
        byContact.set(doc.contactId, entry);
      }

      for (const [contactId, entry] of byContact) {
        const email = buildPaymentReminderEmail({
          companyName: company.businessName,
          companyRut: formatRut(company.rut),
          companyPhone: company.phone,
          customerName: entry.name,
          documents: entry.items.map((item) => ({ dteLabel: item.dteLabel, folio: item.folio, dueDate: item.dueDate, amount: item.amount })),
          totalDue: entry.items.reduce((sum, item) => sum + item.amount, 0),
        });
        const delivery = await sendEmail({ to: entry.email, ...email });
        if (delivery.status === 'failed') continue;
        emailsSent += 1;
        await prisma.collectionReminderLog.createMany({
          data: entry.items.map((item) => ({ companyId: company.id, salesDocumentId: item.docId, contactId, stage: item.stage, sentTo: entry.email, deliveryStatus: delivery.status })),
          skipDuplicates: true,
        });
        await createAuditLog({
          companyId: company.id,
          userEmail: 'collection-reminders-cron',
          action: 'UPDATE',
          entity: 'Contact',
          entityId: contactId,
          metadata: {
            reason: 'automatic_collection_reminder',
            documents: entry.items.length,
            stages: entry.items.map((item) => describeStage(item.stage)),
            deliveryStatus: delivery.status,
          },
        });
      }
      processedCompanies += 1;
    } catch (error) {
      captureException(error, { module: 'cobranza', companyId: company.id, extra: { reason: 'collection-reminders-cron' } });
    }
  }
  return { processedCompanies, emailsSent };
}
