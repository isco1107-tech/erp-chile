import { requireAuthWithPermission } from '@/lib/auth/guards';
import CalendarDashboardClient from '@/components/calendar/CalendarDashboardClient';

export const metadata = {
  title: 'Calendario & Google Calendar | ERP Certámenes',
};

export default async function CalendarPage() {
  const session = await requireAuthWithPermission('projects:read');
  const canWrite = session.permissions.includes('projects:write');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Calendario & Sincronización Google Calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Sincroniza tus certámenes, galas y los cumpleaños de las candidatas (misses) directamente en tu Google Calendar, con recordatorios periódicos automáticos.
        </p>
      </div>

      <CalendarDashboardClient userEmail={session.email} canWrite={canWrite} />
    </div>
  );
}
