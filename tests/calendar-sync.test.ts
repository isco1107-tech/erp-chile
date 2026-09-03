import {
  createGoogleCalendarUrl,
  buildIcsFeed,
  formatGoogleCalendarDate,
} from '@/modules/calendar/services/calendar.service';
import { buildEventReminderEmail } from '@/modules/calendar/services/event-reminders.service';
import type { CalendarItem } from '@/modules/calendar/schema';

describe('Módulo Calendario & Sincronización Google Calendar', () => {
  const adminEmail = 'admin@certamen.cl';

  describe('createGoogleCalendarUrl', () => {
    it('genera URL de Google Calendar para eventos de día completo (cumpleaños)', () => {
      const bday = new Date(Date.UTC(2026, 8, 15)); // 15 de septiembre 2026
      const urlStr = createGoogleCalendarUrl({
        title: '🎂 Cumpleaños Miss: Camila Valenzuela',
        details: 'Certamen Miss Universe Temuco 2026',
        startDate: bday,
        isAllDay: true,
        adminEmail,
      });

      const url = new URL(urlStr);
      expect(url.hostname).toBe('calendar.google.com');
      expect(url.searchParams.get('action')).toBe('TEMPLATE');
      expect(url.searchParams.get('text')).toBe('🎂 Cumpleaños Miss: Camila Valenzuela');
      expect(url.searchParams.get('dates')).toBe('20260915/20260916'); // día completo: siguiente día como fin
      expect(url.searchParams.get('add')).toBe(adminEmail);
    });

    it('genera URL de Google Calendar con horario para eventos con hora específica', () => {
      const startDate = new Date('2026-10-20T20:00:00.000Z');
      const endDate = new Date('2026-10-20T23:30:00.000Z');
      const urlStr = createGoogleCalendarUrl({
        title: '🏆 Gala Final Miss Chile 2026',
        details: 'Teatro Municipal',
        startDate,
        endDate,
        isAllDay: false,
        location: 'Santiago, Chile',
        adminEmail,
      });

      const url = new URL(urlStr);
      expect(url.searchParams.get('dates')).toBe('20261020T200000Z/20261020T233000Z');
      expect(url.searchParams.get('location')).toBe('Santiago, Chile');
      expect(url.searchParams.get('add')).toBe(adminEmail);
    });
  });

  describe('buildIcsFeed', () => {
    it('genera un feed RFC 5545 válido con eventos y cumpleaños recurrentes anuales', () => {
      const items: CalendarItem[] = [
        {
          id: 'proj-1',
          type: 'PROJECT',
          title: '🏆 Gala Coronación',
          description: 'Evento oficial de coronación',
          startDate: new Date('2026-11-05T19:00:00.000Z'),
          endDate: new Date('2026-11-05T22:00:00.000Z'),
          isAllDay: false,
          googleCalendarUrl: 'https://calendar.google.com/...',
        },
        {
          id: 'bday-1',
          type: 'CANDIDATE_BIRTHDAY',
          title: '🎂 Cumpleaños Miss: Sofía Morales',
          description: 'Cumpleaños oficial de la miss',
          startDate: new Date(Date.UTC(2026, 4, 10)),
          isAllDay: true,
          googleCalendarUrl: 'https://calendar.google.com/...',
        },
      ];

      const ics = buildIcsFeed('Miss Universe Chile', items);

      // Cabeceras RFC 5545
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('X-WR-CALNAME:Miss Universe Chile - Eventos & Misses');
      expect(ics).toContain('END:VCALENDAR');

      // Evento de Certamen con horario y alarmas
      expect(ics).toContain('UID:proj-1@erp.certamenes');
      expect(ics).toContain('SUMMARY:🏆 Gala Coronación');
      expect(ics).toContain('DTSTART:20261105T190000Z');
      expect(ics).toContain('DTEND:20261105T220000Z');
      expect(ics).toContain('TRIGGER:-P1D'); // Recordatorio 1 día antes
      expect(ics).toContain('TRIGGER:-PT2H'); // Recordatorio 2 horas antes

      // Evento de Cumpleaños de Miss de día completo y recurrente
      expect(ics).toContain('UID:bday-1@erp.certamenes');
      expect(ics).toContain('SUMMARY:🎂 Cumpleaños Miss: Sofía Morales');
      expect(ics).toContain('DTSTART;VALUE=DATE:20260510');
      expect(ics).toContain('DTEND;VALUE=DATE:20260511');
      expect(ics).toContain('RRULE:FREQ=YEARLY'); // Recurrencia anual
    });
  });

  describe('buildEventReminderEmail', () => {
    it('construye la plantilla de recordatorio con eventos y cumpleaños formateados', () => {
      const email = buildEventReminderEmail({
        companyName: 'Organización Miss Chile',
        adminEmail: 'director@misschile.cl',
        upcomingEvents: [
          {
            title: 'Ensayo General de Pasarela',
            dateFormatted: 'Jue, 15 Oct, 18:00',
            googleCalendarUrl: 'https://calendar.google.com/test-event',
          },
        ],
        upcomingBirthdays: [
          {
            name: 'Valentina Silva (Miss Antofagasta)',
            age: 22,
            dateFormatted: '18/10',
            daysUntil: 3,
            googleCalendarUrl: 'https://calendar.google.com/test-bday',
          },
        ],
        dashboardCalendarUrl: 'https://erp.cl/dashboard/calendar',
      });

      expect(email.subject).toContain('[Recordatorio] 2 evento(s) y cumpleaños próximos');
      expect(email.html).toContain('Ensayo General de Pasarela');
      expect(email.html).toContain('Valentina Silva (Miss Antofagasta)');
      expect(email.html).toContain('Cumple 22 años');
      expect(email.html).toContain('+ Google Calendar');
      expect(email.text).toContain('Eventos próximos: 1');
      expect(email.text).toContain('Cumpleaños próximos: 1');
    });
  });
});
