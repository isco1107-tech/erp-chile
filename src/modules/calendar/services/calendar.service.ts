import crypto from 'crypto';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import { prisma } from '@/lib/prisma';
import type { CalendarCandidateInfo, CalendarFeedData, CalendarItem } from '../schema';

/** Obtiene o genera el token seguro de sincronización con Google Calendar para la empresa. */
export async function ensureCalendarSyncToken(companyId: string): Promise<string> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { calendarSyncToken: true },
  });

  if (settings?.calendarSyncToken) {
    return settings.calendarSyncToken;
  }

  const token = crypto.randomBytes(24).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { calendarSyncToken: token },
    create: { companyId, calendarSyncToken: token },
  });

  return token;
}

/** Regenera el token de sincronización, invalidando la URL anterior. */
export async function regenerateCalendarSyncToken(companyId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { calendarSyncToken: token },
    create: { companyId, calendarSyncToken: token },
  });
  return token;
}

/** Obtiene el correo del usuario administrador principal (OWNER o ADMIN). */
export async function getAdminEmail(companyId: string): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { companyId, role: { in: ['OWNER', 'ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { email: true },
  });
  return admin?.email ?? '';
}

/** Formatea una fecha para URLs de Google Calendar. */
export function formatGoogleCalendarDate(date: Date, isAllDay: boolean): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (isAllDay) {
    return `${year}${month}${day}`;
  }
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/** Genera el link directo web para agregar un evento a Google Calendar con 1 clic. */
export function createGoogleCalendarUrl(params: {
  title: string;
  details: string;
  startDate: Date;
  endDate?: Date;
  isAllDay: boolean;
  location?: string;
  adminEmail?: string;
}): string {
  const startStr = formatGoogleCalendarDate(params.startDate, params.isAllDay);
  let endStr: string;
  if (params.isAllDay) {
    const nextDay = new Date(params.startDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    endStr = formatGoogleCalendarDate(nextDay, true);
  } else {
    const end = params.endDate ?? new Date(params.startDate.getTime() + 3 * 3600 * 1000);
    endStr = formatGoogleCalendarDate(end, false);
  }

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', params.title);
  url.searchParams.set('dates', `${startStr}/${endStr}`);
  url.searchParams.set('details', params.details);
  if (params.location) url.searchParams.set('location', params.location);
  if (params.adminEmail) url.searchParams.set('add', params.adminEmail);

  return url.toString();
}

/** Obtiene todos los eventos de certámenes y cumpleaños de candidatas para el calendario. */
export async function getCalendarData(companyId: string, baseUrl: string): Promise<CalendarFeedData> {
  const [company, token, adminEmail, projects, stageItems, candidates] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { businessName: true } }),
    ensureCalendarSyncToken(companyId),
    getAdminEmail(companyId),
    prisma.project.findMany({
      where: { companyId, status: { not: 'CANCELLED' } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.stageTimelineItem.findMany({
      where: { companyId },
      include: { project: true, candidate: { select: { fullName: true, stageName: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.candidate.findMany({
      where: { companyId, status: { in: ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'] } },
      include: { project: { select: { id: true, name: true, code: true } } },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const companyName = company.businessName;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const items: CalendarItem[] = [];
  const upcomingBirthdays: CalendarCandidateInfo[] = [];

  // 1. Proyectos / Certámenes Oficiales
  for (const p of projects) {
    const details = `Certamen Oficial: ${p.name}\nCódigo: ${p.code}\nEstado: ${p.status}${p.notes ? `\nNotas: ${p.notes}` : ''}`;
    const gUrl = createGoogleCalendarUrl({
      title: `🏆 Certamen: ${p.name}`,
      details,
      startDate: p.startDate,
      endDate: p.endDate ?? undefined,
      isAllDay: false,
      adminEmail,
    });

    items.push({
      id: `project-${p.id}`,
      type: 'PROJECT',
      title: `🏆 ${p.name}`,
      description: details,
      startDate: p.startDate,
      endDate: p.endDate ?? undefined,
      isAllDay: false,
      googleCalendarUrl: gUrl,
      project: { id: p.id, name: p.name, code: p.code },
    });
  }

  // 2. Hitos de Escenario / Pauta
  for (const s of stageItems) {
    const details = `Hito de Pauta: ${s.title}\nCertamen: ${s.project.name}${s.candidate ? `\nCandidata: ${s.candidate.stageName || s.candidate.fullName}` : ''}${s.description ? `\nDetalles: ${s.description}` : ''}`;
    const endDate = new Date(s.startTime.getTime() + s.durationMinutes * 60 * 1000);
    const gUrl = createGoogleCalendarUrl({
      title: `🎭 Pauta: ${s.title}`,
      details,
      startDate: s.startTime,
      endDate,
      isAllDay: false,
      adminEmail,
    });

    items.push({
      id: `stage-${s.id}`,
      type: 'STAGE_BLOCK',
      title: `🎭 ${s.title}${s.candidate ? ` (${s.candidate.stageName || s.candidate.fullName})` : ''}`,
      description: details,
      startDate: s.startTime,
      endDate,
      isAllDay: false,
      googleCalendarUrl: gUrl,
      project: { id: s.project.id, name: s.project.name, code: s.project.code },
    });
  }

  // 3. Cumpleaños de las Misses / Candidatas
  for (const c of candidates) {
    if (!c.birthDate) continue;

    const birth = new Date(c.birthDate);
    const currentYear = now.getFullYear();
    let nextBday = new Date(Date.UTC(currentYear, birth.getUTCMonth(), birth.getUTCDate()));

    // Si ya pasó este año, el próximo ocurre el año siguiente
    if (nextBday < todayUtc) {
      nextBday = new Date(Date.UTC(currentYear + 1, birth.getUTCMonth(), birth.getUTCDate()));
    }

    const turningAge = nextBday.getUTCFullYear() - birth.getUTCFullYear();
    const diffMs = nextBday.getTime() - todayUtc.getTime();
    const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const bdayInfo: CalendarCandidateInfo = {
      id: c.id,
      fullName: c.fullName,
      stageName: c.stageName,
      photoUrl: c.photoUrl,
      birthDate: c.birthDate,
      turningAge,
      daysUntil,
      phone: c.phone,
      email: c.email,
    };
    upcomingBirthdays.push(bdayInfo);

    const missTitle = c.stageName ? `${c.stageName} (${c.fullName})` : c.fullName;
    const details = `🎂 Cumpleaños oficial de ${missTitle}\nCertamen: ${c.project.name}\nCumple: ${turningAge} años\nFecha de Nacimiento: ${birth.getUTCDate()}/${birth.getUTCMonth() + 1}/${birth.getUTCFullYear()}${c.phone ? `\nTeléfono: ${c.phone}` : ''}${c.email ? `\nEmail: ${c.email}` : ''}`;

    const gUrl = createGoogleCalendarUrl({
      title: `🎂 Cumpleaños Miss: ${missTitle}`,
      details,
      startDate: nextBday,
      isAllDay: true,
      adminEmail,
    });

    items.push({
      id: `bday-${c.id}`,
      type: 'CANDIDATE_BIRTHDAY',
      title: `🎂 Cumpleaños: ${missTitle}`,
      description: details,
      startDate: nextBday,
      isAllDay: true,
      googleCalendarUrl: gUrl,
      candidate: bdayInfo,
      project: { id: c.project.id, name: c.project.name, code: c.project.code },
    });
  }

  // Ordenar cumpleaños por proximidad
  upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  // Ordenar eventos por fecha
  items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const upcomingEvents = items.filter((item) => item.type !== 'CANDIDATE_BIRTHDAY' && item.startDate >= now);

  const cleanBase = baseUrl.replace(/\/$/, '');
  const httpsUrl = `${cleanBase}/api/calendar/feed/${token}`;
  const webcalUrl = httpsUrl.replace(/^http/, 'webcal');
  const googleCalendarSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`;

  return {
    companyName,
    adminEmail,
    syncToken: token,
    httpsUrl,
    webcalUrl,
    googleCalendarSubscribeUrl,
    items,
    upcomingBirthdays,
    upcomingEvents,
  };
}

/** Genera el feed iCalendar RFC 5545 (.ics) completo para suscripción en vivo en Google Calendar. */
export function buildIcsFeed(companyName: string, items: CalendarItem[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ERP Certamenes//Calendario Oficial//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${companyName} - Eventos & Misses`,
    'X-WR-TIMEZONE:America/Santiago',
  ];

  const nowStr = formatGoogleCalendarDate(new Date(), false);

  for (const item of items) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${item.id}@erp.certamenes`);
    lines.push(`DTSTAMP:${nowStr}`);

    if (item.isAllDay) {
      const startStr = formatGoogleCalendarDate(item.startDate, true);
      const nextDay = new Date(item.startDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const endStr = formatGoogleCalendarDate(nextDay, true);
      lines.push(`DTSTART;VALUE=DATE:${startStr}`);
      lines.push(`DTEND;VALUE=DATE:${endStr}`);
      if (item.type === 'CANDIDATE_BIRTHDAY') {
        lines.push('RRULE:FREQ=YEARLY');
      }
    } else {
      const startStr = formatGoogleCalendarDate(item.startDate, false);
      const end = item.endDate ?? new Date(item.startDate.getTime() + 3 * 3600 * 1000);
      const endStr = formatGoogleCalendarDate(end, false);
      lines.push(`DTSTART:${startStr}`);
      lines.push(`DTEND:${endStr}`);
    }

    const cleanSummary = item.title.replace(/,/g, '\\,').replace(/;/g, '\\;');
    const cleanDescription = item.description.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    lines.push(`SUMMARY:${cleanSummary}`);
    lines.push(`DESCRIPTION:${cleanDescription}`);

    // Alarmas y recordatorios automáticos
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Recordatorio: ${cleanSummary}`);
    lines.push('TRIGGER:-P1D');
    lines.push('END:VALARM');

    if (!item.isAllDay) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:Recordatorio próximo: ${cleanSummary}`);
      lines.push('TRIGGER:-PT2H');
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Resuelve el feed .ics por token público seguro. */
export async function getCalendarFeedByToken(token: string, baseUrl: string): Promise<{ filename: string; ics: string } | null> {
  const settings = await prisma.companySettings.findUnique({
    where: { calendarSyncToken: token },
    select: { companyId: true, company: { select: { status: true } } },
  });

  // El feed público deja de publicar la agenda de una empresa suspendida o cancelada (SEG-10).
  if (!settings || !isOperationalTenant(settings.company.status)) return null;

  const data = await getCalendarData(settings.companyId, baseUrl);
  const ics = buildIcsFeed(data.companyName, data.items);
  const filename = `certamenes_${data.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.ics`;

  return { filename, ics };
}
