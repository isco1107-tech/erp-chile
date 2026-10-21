import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { toFeatureFlags, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { captureException } from '@/lib/observability';
import {
  CONTACT_FORM_FIELDS,
  DESTINATION_INFO,
  FORM_DESTINATIONS,
  FORM_PURPOSES,
  PURPOSE_LABELS,
  answersText,
  destinationHref,
  needsConsentCheckbox,
  parseStoredAnswers,
  roleValues,
  validateFormAnswers,
  type DataRole,
  type FormAnswer,
  type FormDestination,
  type FormPurpose,
} from '@/lib/web-sites/forms';
import { findPublishedForm, type SiteForm } from '@/lib/web-sites/site-forms';
import { publicApplicationSchema, type PublicApplicationInput } from '@/modules/academy/schema';
import { submitApplication } from '@/modules/academy/services/academy-enrollment.service';
import { createInboundWebLead } from '@/modules/crm/services/crm.service';
import type { PublicWebSite } from './web-sites.service';

/**
 * Envíos de los formularios de los sitios y su llegada al ERP.
 *
 * Cada envío se valida contra el formulario PUBLICADO (nunca contra lo que
 * diga el navegador), queda siempre en la bandeja del sitio y, según el
 * destino configurado, además crea una oportunidad en el CRM, una inscripción
 * de la academia o una tarea del equipo. La empresa sale del sitio publicado,
 * nunca del cuerpo. Si el módulo del destino no está contratado, el envío
 * queda solo en la bandeja con la explicación (`routeNote`).
 *
 * Lo que el destino exige (la ficha de la academia valida edad y apoderado)
 * se revisa ANTES de guardar: el visitante ve el error y puede corregirlo.
 */

export class FormRoutingError extends Error {}

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// Plan de llegada al destino
// ---------------------------------------------------------------------------

interface RouteContext {
  siteName: string;
  form: Pick<SiteForm, 'title' | 'purpose' | 'dealType' | 'tag'>;
  answers: FormAnswer[];
}

type RoutePlan =
  | { kind: 'inbox'; note: string | null }
  | { kind: 'crm'; name: string; organization: string | null; email: string | null; phone: string | null; amount: number; summary: string }
  | { kind: 'academy'; input: PublicApplicationInput; groupName: string | null }
  | { kind: 'tasks'; title: string; description: string };

export type PlanResult = { ok: true; plan: RoutePlan } | { ok: false; error: string };

function personName(roles: Partial<Record<DataRole, string>>): string | null {
  return roles.name || roles.organization || null;
}

/**
 * Qué se va a crear en el destino, o por qué no se puede. Pura respecto de la
 * base: solo mira el destino, los módulos contratados y las respuestas.
 */
export function planRoute(destination: FormDestination, features: Partial<CompanyFeatureFlags>, ctx: RouteContext): PlanResult {
  const info = DESTINATION_INFO[destination];
  if (destination === 'inbox') return { ok: true, plan: { kind: 'inbox', note: null } };
  if (info.feature && !features[info.feature]) {
    return { ok: true, plan: { kind: 'inbox', note: `El módulo de ${info.area} no está activo en el plan: quedó solo en la bandeja del sitio.` } };
  }
  const roles = roleValues(ctx.answers);
  const name = personName(roles);
  const summary = answersText(ctx.answers);

  switch (destination) {
    case 'crm': {
      if (!name) return { ok: false, error: 'Para registrarlo en el CRM se necesita un nombre.' };
      return {
        ok: true,
        plan: {
          kind: 'crm',
          name: roles.name || name,
          organization: roles.organization || null,
          email: roles.email || null,
          phone: roles.phone || null,
          amount: roles.amount ? Number(roles.amount) || 0 : 0,
          summary,
        },
      };
    }
    case 'academy': {
      const parsed = publicApplicationSchema.safeParse({
        fullName: roles.name ?? '',
        rut: roles.rut ?? '',
        birthDate: roles.birthDate ?? '',
        phone: roles.phone ?? '',
        email: roles.email ?? '',
        address: roles.address || undefined,
        guardianName: roles.guardianName || undefined,
        guardianPhone: roles.guardianPhone || undefined,
        guardianEmail: roles.guardianEmail ?? '',
        photoConsent: roles.photoConsent === 'Sí',
        // La ficha guarda hasta 500 caracteres de comentario: lo demás queda en la bandeja.
        message: [roles.message, summaryWithout(ctx.answers, ACADEMY_ROLES)].filter(Boolean).join('\n').slice(0, 500) || undefined,
        // La casilla del aviso de privacidad la exige el formulario antes de llegar acá.
        acceptPrivacy: true,
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const missing = (['name', 'rut', 'birthDate', 'phone'] as const).filter((role) => !roles[role]);
        if (missing.length > 0) return { ok: false, error: 'Para enviarlo a la academia se necesitan nombre, RUT, fecha de nacimiento y teléfono.' };
        return { ok: false, error: issue?.message ?? 'Revisa los datos de la inscripción.' };
      }
      return { ok: true, plan: { kind: 'academy', input: parsed.data, groupName: roles.group || null } };
    }
    case 'tasks': {
      if (!name) return { ok: false, error: 'Para crear la tarea se necesita el nombre de quien escribió.' };
      return {
        ok: true,
        plan: {
          kind: 'tasks',
          title: `Responder a ${name}: ${ctx.form.title}`.slice(0, 140),
          description: `${summary}\n\nRecibido desde el sitio «${ctx.siteName}».`.slice(0, 1000),
        },
      };
    }
  }
}

/** Datos que la ficha de la academia guarda en su propio campo (no se repiten en el comentario). */
const ACADEMY_ROLES: ReadonlySet<string> = new Set(['name', 'rut', 'birthDate', 'phone', 'email', 'address', 'guardianName', 'guardianPhone', 'guardianEmail', 'photoConsent', 'message']);

function summaryWithout(answers: FormAnswer[], roles: ReadonlySet<string>): string {
  return answersText(answers.filter((answer) => !answer.role || !roles.has(answer.role)));
}

/** Mañana en Chile, como día guardado a las 12:00 UTC (la convención de tareas). */
function tomorrowDay(now: Date = new Date()): Date {
  const { year, month, day } = santiagoDateParts(now);
  return new Date(Date.UTC(year, month - 1, day + 1, 12));
}

interface Routed {
  kind: Exclude<FormDestination, 'inbox'>;
  id: string | null;
  note: string | null;
}

async function executePlan(companyId: string, plan: Exclude<RoutePlan, { kind: 'inbox' }>, ctx: RouteContext, actorUserId: string | null): Promise<Routed> {
  switch (plan.kind) {
    case 'crm': {
      const lead = await createInboundWebLead(companyId, {
        siteName: ctx.siteName,
        formTitle: ctx.form.title,
        purposeLabel: PURPOSE_LABELS[ctx.form.purpose],
        dealType: ctx.form.dealType,
        tag: ctx.form.tag,
        name: plan.name,
        organization: plan.organization,
        email: plan.email,
        phone: plan.phone,
        amount: plan.amount,
        summary: plan.summary,
      });
      return { kind: 'crm', id: lead.opportunityId, note: lead.deduplicated ? 'La misma persona escribió en las últimas 24 horas: se sumó como nota a esa oportunidad.' : null };
    }
    case 'academy': {
      // El grupo elegido se busca por nombre entre los grupos activos de ESTA empresa.
      let preferredGroupId: string | null = null;
      if (plan.groupName) {
        const group = await prisma.academyGroup.findFirst({ where: { companyId, isActive: true, name: { equals: plan.groupName, mode: 'insensitive' } }, select: { id: true } });
        preferredGroupId = group?.id ?? null;
      }
      const result = await submitApplication({ companyId, companyName: '' }, { ...plan.input, preferredGroupId });
      return result.created
        ? { kind: 'academy', id: result.id, note: null }
        : { kind: 'academy', id: null, note: 'Esa persona ya es alumna o tiene una inscripción pendiente: no se duplicó.' };
    }
    case 'tasks': {
      const task = await prisma.teamTask.create({
        data: { companyId, title: plan.title, description: plan.description, priority: 'NORMAL', dueDate: tomorrowDay(), assigneeId: actorUserId, createdById: actorUserId },
        select: { id: true },
      });
      return { kind: 'tasks', id: task.id, note: null };
    }
  }
}

async function companyFeatures(companyId: string): Promise<CompanyFeatureFlags> {
  return toFeatureFlags(await prisma.companyFeatures.findUnique({ where: { companyId } }));
}

// ---------------------------------------------------------------------------
// Envío público
// ---------------------------------------------------------------------------

export interface PublicFormInput {
  /** Id del bloque del formulario; vacío = el formulario de contacto (navegadores con la página de antes). */
  formId?: string | null;
  answers: unknown;
  acceptPrivacy?: boolean;
}

export type PublicSubmitResult =
  | { ok: true; messageId: string; form: SiteForm; name: string; email: string | null; phone: string | null; message: string; summary: string; routed: Routed | null }
  | { ok: false; status: 400 | 404; error: string; fieldId?: string };

export async function submitPublicForm(site: Pick<PublicWebSite, 'id' | 'companyId' | 'name' | 'document'>, input: PublicFormInput): Promise<PublicSubmitResult> {
  const form = findPublishedForm(site.document, input.formId);
  if (!form) return { ok: false, status: 404, error: 'Este formulario ya no está disponible' };

  const validated = validateFormAnswers(form.fields, input.answers);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error, fieldId: validated.fieldId };
  if (needsConsentCheckbox(form) && input.acceptPrivacy !== true) return { ok: false, status: 400, error: 'Debes aceptar el aviso de privacidad para enviar el formulario' };

  const answers = validated.answers;
  const ctx: RouteContext = { siteName: site.name, form, answers };
  // Solo se consulta el plan si el formulario tributa a un módulo.
  const features = form.destination === 'inbox' ? {} : await companyFeatures(site.companyId);
  const planned = planRoute(form.destination, features, ctx);
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  const roles = roleValues(answers);
  const name = (personName(roles) ?? roles.email ?? roles.phone ?? 'Sin nombre').slice(0, 120);
  const summary = answersText(answers);
  const text = (roles.message || summaryWithout(answers, new Set(['name', 'email', 'phone'])) || '(sin mensaje)').slice(0, 4000);
  const message = await prisma.webSiteMessage.create({
    data: {
      companyId: site.companyId,
      siteId: site.id,
      name,
      email: roles.email ?? null,
      phone: roles.phone ?? null,
      message: text,
      formId: form.blockId,
      formTitle: form.title.slice(0, 120),
      purpose: form.purpose,
      destination: form.destination,
      tag: form.tag || null,
      answers: json(answers),
      routeNote: planned.plan.kind === 'inbox' ? planned.plan.note : null,
    },
    select: { id: true },
  });

  let routed: Routed | null = null;
  if (planned.plan.kind !== 'inbox') {
    const plan = planned.plan;
    try {
      routed = await executePlan(site.companyId, plan, ctx, null);
      await prisma.webSiteMessage.updateMany({
        where: { id: message.id, companyId: site.companyId },
        data: { routedKind: routed.kind, routedId: routed.id, routedAt: new Date(), routeNote: routed.note },
      });
    } catch (error) {
      // El envío ya quedó en la bandeja: un problema del destino no lo pierde.
      captureException(error, { module: 'sitios-web', companyId: site.companyId, extra: { reason: 'form-route', destination: plan.kind, messageId: message.id } });
      await prisma.webSiteMessage
        .updateMany({ where: { id: message.id, companyId: site.companyId }, data: { routeNote: `No se pudo registrar en «${DESTINATION_INFO[plan.kind].label}»: quedó solo en la bandeja. Envíalo de nuevo desde aquí.` } })
        .catch(() => undefined);
    }
  }

  return { ok: true, messageId: message.id, form, name, email: roles.email ?? null, phone: roles.phone ?? null, message: text, summary, routed };
}

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------

export const MESSAGE_STATUSES = ['inbox', 'unread', 'archived', 'all'] as const;
export type MessageStatusFilter = (typeof MESSAGE_STATUSES)[number];

export interface MessageFilter {
  siteId?: string | null;
  /** Id del bloque del formulario; `legacy` = mensajes anteriores a los formularios a medida. */
  formId?: string | null;
  purpose?: FormPurpose | null;
  destination?: FormDestination | null;
  tag?: string | null;
  status?: MessageStatusFilter;
  q?: string | null;
}

export interface FormMessageRow {
  id: string;
  siteId: string;
  siteName: string;
  formId: string | null;
  formTitle: string;
  purpose: FormPurpose;
  destination: FormDestination;
  tag: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  answers: FormAnswer[];
  routedKind: FormDestination | null;
  routedId: string | null;
  routedAt: Date | null;
  routeNote: string | null;
  /** Enlace del panel al registro creado (oportunidad, inscripción, tarea). */
  routedHref: string | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface FormFacet {
  siteId: string;
  siteName: string;
  /** `null` = mensajes de antes de los formularios a medida (formulario de contacto). */
  formId: string | null;
  title: string;
  total: number;
  unread: number;
}

export interface FormMessagesPage {
  rows: FormMessageRow[];
  /** Mensajes que calzan con el filtro (puede haber más que los que se muestran). */
  total: number;
  unread: number;
  forms: FormFacet[];
  tags: string[];
  sites: Array<{ id: string; name: string }>;
}

export const MAX_MESSAGES_PAGE = 200;

const isPurpose = (value: string | null): value is FormPurpose => value !== null && (FORM_PURPOSES as readonly string[]).includes(value);
const isDestination = (value: string | null): value is FormDestination => value !== null && (FORM_DESTINATIONS as readonly string[]).includes(value);

function whereOf(companyId: string, filter: MessageFilter): Prisma.WebSiteMessageWhereInput {
  const q = filter.q?.trim().slice(0, 100);
  const status = filter.status ?? 'inbox';
  return {
    companyId,
    ...(filter.siteId ? { siteId: filter.siteId } : {}),
    ...(filter.formId === 'legacy' ? { formId: null } : filter.formId ? { formId: filter.formId } : {}),
    ...(filter.purpose ? (filter.purpose === 'contact' ? { OR: [{ purpose: 'contact' }, { purpose: null }] } : { purpose: filter.purpose }) : {}),
    ...(filter.destination ? (filter.destination === 'inbox' ? { OR: [{ destination: 'inbox' }, { destination: null }] } : { destination: filter.destination }) : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
    ...(status === 'inbox' ? { archivedAt: null } : status === 'unread' ? { archivedAt: null, readAt: null } : status === 'archived' ? { archivedAt: { not: null } } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { message: { contains: q, mode: 'insensitive' } },
                { formTitle: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : {}),
  };
}

function toRow(message: Prisma.WebSiteMessageGetPayload<{ include: { site: { select: { name: true } } } }>): FormMessageRow {
  const destination = isDestination(message.destination) ? message.destination : 'inbox';
  const routedKind = isDestination(message.routedKind) ? message.routedKind : null;
  // Los mensajes de antes no guardaban respuestas: se arman con sus campos fijos.
  const stored = parseStoredAnswers(message.answers);
  const answers: FormAnswer[] = stored.length > 0
    ? stored
    : CONTACT_FORM_FIELDS.map((field) => ({ id: field.id, label: field.label, kind: field.kind, role: field.role, value: (field.id === 'name' ? message.name : field.id === 'email' ? message.email : field.id === 'phone' ? message.phone : message.message) ?? '' }));
  return {
    id: message.id,
    siteId: message.siteId,
    siteName: message.site.name,
    formId: message.formId,
    formTitle: message.formTitle || 'Contacto',
    purpose: isPurpose(message.purpose) ? message.purpose : 'contact',
    destination,
    tag: message.tag,
    name: message.name,
    email: message.email,
    phone: message.phone,
    message: message.message,
    answers,
    routedKind,
    routedId: message.routedId,
    routedAt: message.routedAt,
    routeNote: message.routeNote,
    routedHref: routedKind ? destinationHref(routedKind, message.routedId) : null,
    readAt: message.readAt,
    archivedAt: message.archivedAt,
    createdAt: message.createdAt,
  };
}

export async function listFormMessages(companyId: string, filter: MessageFilter = {}): Promise<FormMessagesPage> {
  const where = whereOf(companyId, filter);
  const scope: Prisma.WebSiteMessageWhereInput = { companyId, ...(filter.siteId ? { siteId: filter.siteId } : {}) };
  const [rows, total, unread, grouped, unreadGrouped, tagRows, sites] = await Promise.all([
    prisma.webSiteMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: MAX_MESSAGES_PAGE, include: { site: { select: { name: true } } } }),
    prisma.webSiteMessage.count({ where }),
    prisma.webSiteMessage.count({ where: { ...scope, readAt: null, archivedAt: null } }),
    prisma.webSiteMessage.groupBy({ by: ['siteId', 'formId', 'formTitle'], where: scope, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.webSiteMessage.groupBy({ by: ['siteId', 'formId'], where: { ...scope, readAt: null, archivedAt: null }, _count: { _all: true } }),
    prisma.webSiteMessage.findMany({ where: { ...scope, tag: { not: null } }, distinct: ['tag'], select: { tag: true }, take: 50 }),
    prisma.webSite.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const siteNames = new Map(sites.map((site) => [site.id, site.name]));
  const unreadBy = new Map(unreadGrouped.map((row) => [`${row.siteId}:${row.formId ?? ''}`, row._count._all]));
  // Un formulario renombrado aparece con varios títulos: se agrupa por bloque y se queda el más reciente.
  const facets = new Map<string, FormFacet & { latest: number }>();
  for (const row of grouped) {
    const key = `${row.siteId}:${row.formId ?? ''}`;
    const latest = row._max.createdAt?.getTime() ?? 0;
    const current = facets.get(key);
    const title = row.formTitle || 'Contacto';
    if (current) {
      current.total += row._count._all;
      if (latest > current.latest) Object.assign(current, { title, latest });
    } else {
      facets.set(key, { siteId: row.siteId, siteName: siteNames.get(row.siteId) ?? 'Sitio', formId: row.formId, title, total: row._count._all, unread: unreadBy.get(key) ?? 0, latest });
    }
  }
  return {
    rows: rows.map(toRow),
    total,
    unread,
    forms: [...facets.values()].sort((a, b) => b.latest - a.latest).map(({ latest: _latest, ...facet }) => facet),
    tags: tagRows.flatMap((row) => (row.tag ? [row.tag] : [])).sort((a, b) => a.localeCompare(b, 'es')),
    sites,
  };
}

export async function setMessageArchived(companyId: string, messageId: string, archived: boolean): Promise<void> {
  const result = await prisma.webSiteMessage.updateMany({ where: { id: messageId, companyId }, data: { archivedAt: archived ? new Date() : null, ...(archived ? { readAt: new Date() } : {}) } });
  if (result.count === 0) throw new FormRoutingError('Mensaje no encontrado');
}

/** Marca como leídos todos los pendientes que calzan con el filtro. Devuelve cuántos. */
export async function markAllRead(companyId: string, filter: MessageFilter): Promise<number> {
  const result = await prisma.webSiteMessage.updateMany({ where: { ...whereOf(companyId, { ...filter, status: 'unread' }) }, data: { readAt: new Date() } });
  return result.count;
}

// ---------------------------------------------------------------------------
// Enviar al ERP desde la bandeja (mensajes que quedaron solo ahí)
// ---------------------------------------------------------------------------

export interface RouteActor {
  companyId: string;
  userId: string;
  features: Partial<CompanyFeatureFlags>;
}

/**
 * Lleva un mensaje de la bandeja a otra parte del ERP (p. ej. un contacto que
 * resultó ser una venta). Se reserva el mensaje con un `UPDATE` condicionado
 * a que no tenga destino todavía, así un doble clic no crea dos registros; si
 * la creación falla, la reserva se devuelve. Una tarea creada a mano queda a
 * nombre de quien la envía.
 */
export async function routeExistingMessage(actor: RouteActor, messageId: string, destination: Exclude<FormDestination, 'inbox'>): Promise<{ kind: FormDestination; id: string | null; href: string | null; note: string | null }> {
  const message = await prisma.webSiteMessage.findFirst({ where: { id: messageId, companyId: actor.companyId }, include: { site: { select: { name: true } } } });
  if (!message) throw new FormRoutingError('Mensaje no encontrado');
  if (message.routedId) throw new FormRoutingError(`Este mensaje ya está registrado en «${DESTINATION_INFO[isDestination(message.routedKind) ? message.routedKind : destination].label}».`);
  const info = DESTINATION_INFO[destination];
  if (info.feature && !actor.features[info.feature]) throw new FormRoutingError(`Tu plan no incluye el módulo de ${info.area}.`);

  const row = toRow(message);
  const ctx: RouteContext = {
    siteName: message.site.name,
    form: { title: row.formTitle, purpose: row.purpose, dealType: 'OTHER', tag: row.tag ?? '' },
    answers: row.answers,
  };
  const planned = planRoute(destination, actor.features, ctx);
  if (!planned.ok) throw new FormRoutingError(planned.error);
  if (planned.plan.kind === 'inbox') throw new FormRoutingError(planned.plan.note ?? 'No se pudo enviar a ese destino.');

  const claimedAt = new Date();
  const claim = await prisma.webSiteMessage.updateMany({ where: { id: messageId, companyId: actor.companyId, routedId: null, routedAt: message.routedAt }, data: { routedAt: claimedAt, routedKind: destination } });
  if (claim.count === 0) throw new FormRoutingError('Otra persona acaba de enviar este mensaje a otra parte. Actualiza la bandeja.');
  try {
    const routed = await executePlan(actor.companyId, planned.plan, ctx, actor.userId);
    await prisma.webSiteMessage.updateMany({ where: { id: messageId, companyId: actor.companyId }, data: { routedKind: routed.kind, routedId: routed.id, routeNote: routed.note, readAt: message.readAt ?? claimedAt } });
    return { kind: routed.kind, id: routed.id, href: destinationHref(routed.kind, routed.id), note: routed.note };
  } catch (error) {
    await prisma.webSiteMessage.updateMany({ where: { id: messageId, companyId: actor.companyId, routedAt: claimedAt }, data: { routedAt: message.routedAt, routedKind: message.routedKind } }).catch(() => undefined);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

/** Todos los mensajes que calzan con el filtro (para la planilla), hasta 5.000. */
export async function messagesForExport(companyId: string, filter: MessageFilter): Promise<FormMessageRow[]> {
  const rows = await prisma.webSiteMessage.findMany({ where: whereOf(companyId, filter), orderBy: { createdAt: 'desc' }, take: 5000, include: { site: { select: { name: true } } } });
  return rows.map(toRow);
}
