import { PageHeader } from '@/components/ui/PageHeader';
import TimesheetsClient from '@/components/timesheets/TimesheetsClient';

export const metadata = { title: 'Control de Horas' };

export default function TimesheetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Servicios" title="Control de Horas" description="Registra el tiempo por cliente y proyecto, y convierte las horas facturables en factura." />
      <TimesheetsClient />
    </div>
  );
}
