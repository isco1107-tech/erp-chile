import { prisma } from '@/lib/prisma';
import { del } from '@/lib/storage/blob';
import { sendEmail } from '@/lib/email/mailer';
import { buildAcademyMaterialEmail } from '@/lib/email/templates';
import { captureException } from '@/lib/observability';
import { longDate, timeRangeLabel } from '@/lib/academy/calendar';
import {
  RESEND_COOLDOWN_SECONDS,
  collectRecipients,
  formatBytes,
  materialTypeLabel,
  type RecipientPlan,
} from '@/lib/academy/materials';
import type { MaterialLinkInput } from '../schema';
import { AcademyError } from './academy.service';

/**
 * Material de estudio de la academia: archivos (documentos, presentaciones,
 * planillas, imágenes) o enlaces, de un grupo y, si se quiere, de una clase. Se
 * puede enviar por correo a las alumnas activas del grupo y a sus apoderados.
 *
 * Toda consulta lleva `companyId`. Los ids que llegan del cliente (grupo, clase)
 * se verifican contra la empresa, y la clase debe ser del mismo grupo.
 */

export interface MaterialRow {
  id: string;
  groupId: string;
  groupName: string;
  sessionId: string | null;
  /** "sábado 11 de octubre · 10:00 – 12:00" cuando es de una clase. */
  sessionLabel: string | null;
  kind: 'FILE' | 'LINK';
  title: string;
  description: string | null;
  url: string;
  fileName: string | null;
  typeLabel: string;
  sizeBytes: number | null;
  createdAt: string;
  lastSentAt: string | null;
  lastSentCount: number;
}

const materialSelect = {
  id: true,
  groupId: true,
  sessionId: true,
  kind: true,
  title: true,
  description: true,
  url: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  lastSentAt: true,
  lastSentCount: true,
  group: { select: { name: true } },
  session: { select: { date: true, startTime: true, endTime: true } },
} as const;

type MaterialRecord = {
  id: string;
  groupId: string;
  sessionId: string | null;
  kind: 'FILE' | 'LINK';
  title: string;
  description: string | null;
  url: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  lastSentAt: Date | null;
  lastSentCount: number;
  group: { name: string };
  session: { date: Date; startTime: string; endTime: string } | null;
};

function sessionLabelOf(session: MaterialRecord['session']): string | null {
  return session ? `${longDate(session.date.toISOString().slice(0, 10))} · ${timeRangeLabel(session.startTime, session.endTime)}` : null;
}

function toRow(m: MaterialRecord): MaterialRow {
  return {
    id: m.id,
    groupId: m.groupId,
    groupName: m.group.name,
    sessionId: m.sessionId,
    sessionLabel: sessionLabelOf(m.session),
    kind: m.kind,
    title: m.title,
    description: m.description,
    url: m.url,
    fileName: m.fileName,
    typeLabel: materialTypeLabel(m.kind, m.contentType),
    sizeBytes: m.sizeBytes,
    createdAt: m.createdAt.toISOString(),
    lastSentAt: m.lastSentAt ? m.lastSentAt.toISOString() : null,
    lastSentCount: m.lastSentCount,
  };
}

export async function listMaterials(companyId: string, filter: { groupId?: string; sessionId?: string }): Promise<MaterialRow[]> {
  const rows = await prisma.academyMaterial.findMany({
    where: { companyId, ...(filter.groupId ? { groupId: filter.groupId } : {}), ...(filter.sessionId ? { sessionId: filter.sessionId } : {}) },
    orderBy: { createdAt: 'desc' },
    select: materialSelect,
    take: 300,
  });
  return rows.map(toRow);
}

/** El grupo debe ser de la empresa y la clase (si hay) de ese mismo grupo. */
export async function assertMaterialTarget(companyId: string, groupId: string, sessionId: string | null | undefined): Promise<void> {
  const group = await prisma.academyGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true } });
  if (!group) throw new AcademyError('El grupo seleccionado no existe');
  if (!sessionId) return;
  const session = await prisma.academySession.findFirst({ where: { id: sessionId, companyId, groupId }, select: { id: true } });
  if (!session) throw new AcademyError('La clase seleccionada no existe en ese grupo');
}

export interface FileMaterialInput {
  groupId: string;
  sessionId?: string | null;
  title: string;
  description?: string | null;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export async function createFileMaterial(companyId: string, userId: string, data: FileMaterialInput): Promise<MaterialRow> {
  await assertMaterialTarget(companyId, data.groupId, data.sessionId);
  const created = await prisma.academyMaterial.create({
    data: {
      companyId,
      groupId: data.groupId,
      sessionId: data.sessionId ?? null,
      kind: 'FILE',
      title: data.title,
      description: data.description ?? null,
      url: data.url,
      fileName: data.fileName,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      uploadedById: userId,
    },
    select: materialSelect,
  });
  return toRow(created);
}

export async function createLinkMaterial(companyId: string, userId: string, data: MaterialLinkInput): Promise<MaterialRow> {
  await assertMaterialTarget(companyId, data.groupId, data.sessionId);
  const created = await prisma.academyMaterial.create({
    data: {
      companyId,
      groupId: data.groupId,
      sessionId: data.sessionId ?? null,
      kind: 'LINK',
      title: data.title,
      description: data.description ?? null,
      url: data.url,
      uploadedById: userId,
    },
    select: materialSelect,
  });
  return toRow(created);
}

/** Quita el material y, si era un archivo, también borra el archivo (el enlace enviado deja de abrir). */
export async function deleteMaterial(companyId: string, id: string): Promise<void> {
  const material = await prisma.academyMaterial.findFirst({ where: { id, companyId }, select: { kind: true, url: true } });
  if (!material) throw new AcademyError('El material no existe');
  await prisma.academyMaterial.deleteMany({ where: { id, companyId } });
  if (material.kind === 'FILE') await deleteStoredFile(material.url, companyId);
}

/** Borra un archivo del almacenamiento sin frenar la operación si el proveedor falla. */
export async function deleteStoredFile(url: string, companyId?: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    captureException(error, { module: 'academia', companyId, extra: { reason: 'no se pudo borrar el archivo del material', url } });
  }
}

// ── A quién llega ────────────────────────────────────────────────────────────

export interface MaterialRecipients {
  /** Alumnas activas del grupo. */
  students: number;
  /** A cuántas direcciones distintas llegaría (las direcciones mismas no salen del servidor). */
  emailCount: number;
  /** Alumnas sin ninguna dirección: hay que completarlas en su ficha. */
  withoutEmail: string[];
  truncated: boolean;
}

async function loadRecipients(companyId: string, groupId: string): Promise<RecipientPlan & { students: number }> {
  const students = await prisma.academyStudent.findMany({
    where: { companyId, groupId, isActive: true },
    orderBy: { fullName: 'asc' },
    select: { fullName: true, email: true, guardianEmail: true },
  });
  return { ...collectRecipients(students), students: students.length };
}

/** Cuántas direcciones recibirían el material de un grupo, y qué alumnas quedan sin correo. */
export async function getRecipients(companyId: string, groupId: string): Promise<MaterialRecipients> {
  const group = await prisma.academyGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true } });
  if (!group) throw new AcademyError('El grupo seleccionado no existe');
  const plan = await loadRecipients(companyId, groupId);
  return { students: plan.students, emailCount: plan.emails.length, withoutEmail: plan.withoutEmail, truncated: plan.truncated };
}

// ── Envío por correo ─────────────────────────────────────────────────────────

export interface SendMaterialResult {
  sent: number;
  failed: number;
  withoutEmail: string[];
  truncated: boolean;
}

const SEND_CONCURRENCY = 5;

async function inBatches<T>(items: readonly T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

/**
 * Envía el material a las alumnas activas del grupo y a sus apoderados. El
 * envío se "reserva" con una escritura condicionada a `lastSentAt`, así un
 * doble clic (o dos personas a la vez) no manda el correo dos veces; si no
 * salió ninguno, la reserva se devuelve para poder reintentar.
 */
export async function sendMaterial(companyId: string, id: string): Promise<SendMaterialResult> {
  const material = await prisma.academyMaterial.findFirst({ where: { id, companyId }, select: materialSelect });
  if (!material) throw new AcademyError('El material no existe');

  const now = new Date();
  const claim = await prisma.academyMaterial.updateMany({
    where: { id, companyId, OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000) } }] },
    data: { lastSentAt: now },
  });
  if (claim.count === 0) throw new AcademyError('Este material se acaba de enviar. Espera un minuto antes de reenviarlo');

  const restore = () => prisma.academyMaterial.updateMany({ where: { id, companyId }, data: { lastSentAt: material.lastSentAt, lastSentCount: material.lastSentCount } });

  try {
    const recipients = await loadRecipients(companyId, material.groupId);
    if (recipients.emails.length === 0) {
      await restore();
      throw new AcademyError(
        recipients.students === 0
          ? 'Este grupo no tiene alumnas activas, no hay a quién enviarlo'
          : 'Ninguna alumna de este grupo tiene un correo registrado. Agrégalo en su ficha (o el de su apoderado)'
      );
    }

    const [site, company] = await Promise.all([
      prisma.academySite.findUnique({ where: { companyId }, select: { name: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true } }),
    ]);
    const email = buildAcademyMaterialEmail({
      academyName: site?.name || company?.businessName || 'Academia',
      groupName: material.group.name,
      title: material.title,
      description: material.description,
      kind: material.kind,
      url: material.url,
      fileName: material.fileName,
      typeLabel: materialTypeLabel(material.kind, material.contentType),
      sizeLabel: material.sizeBytes ? formatBytes(material.sizeBytes) : null,
      classLabel: sessionLabelOf(material.session),
    });

    let sent = 0;
    let failed = 0;
    let notConfigured = 0;
    await inBatches(recipients.emails, SEND_CONCURRENCY, async (to) => {
      try {
        const result = await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, companyId });
        if (result.status === 'sent') sent += 1;
        else if (result.status === 'logged') notConfigured += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        captureException(error, { module: 'academia', companyId, extra: { reason: 'envío de material', materialId: id } });
      }
    });

    if (sent === 0) {
      await restore();
      if (notConfigured > 0 && failed === 0) throw new AcademyError('El envío de correos no está configurado en la plataforma, así que no salió ninguno. Avisa al administrador');
      throw new AcademyError('No se pudo enviar ningún correo. Intenta de nuevo en unos minutos');
    }

    await prisma.academyMaterial.updateMany({ where: { id, companyId }, data: { lastSentAt: new Date(), lastSentCount: sent } });
    return { sent, failed: failed + notConfigured, withoutEmail: recipients.withoutEmail, truncated: recipients.truncated };
  } catch (error) {
    if (!(error instanceof AcademyError)) await restore().catch(() => undefined);
    throw error;
  }
}
