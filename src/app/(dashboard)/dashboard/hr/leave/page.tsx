import { PageHeader } from '@/components/ui/PageHeader';
import { LeaveClient } from '@/components/hr/LeaveClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Vacaciones & Permisos' };

export default async function LeavePage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personas & Equipo"
        title="Vacaciones & Permisos"
        description="Solicitudes con aprobación de jefatura y saldo de feriado legal de cada trabajador (15 días hábiles por año, 1,25 por mes trabajado)."
      />
      <LeaveClient canWrite={can(context, 'payroll:write')} canApprove={can(context, 'leave:approve')} />
    </div>
  );
}
