import { redirect } from 'next/navigation';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import { listPlatformAuditLog } from '@/modules/platform/services/platform-audit.service';

export const metadata = { title: 'Bitácora de Plataforma' };

const ACTION_LABELS: Record<string, string> = {
  COMPANY_DELETED: 'Empresa eliminada permanentemente',
};

export default async function PlatformAuditLogPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) redirect('/dashboard');
    redirect('/login');
  }

  const entries = await listPlatformAuditLog();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Bitácora de Plataforma</h1>
        <p className="text-sm text-muted-foreground">
          Registro de acciones destructivas a nivel de plataforma (hoy: borrado permanente de empresas). Sobrevive
          aunque la empresa afectada ya no exista.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Acción</th>
              <th className="px-4 py-2 font-medium">Empresa</th>
              <th className="px-4 py-2 font-medium">RUT</th>
              <th className="px-4 py-2 font-medium">Ejecutado por</th>
              <th className="px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Sin registros todavía.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-2 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                </td>
                <td className="px-4 py-2">{entry.companyBusinessName}</td>
                <td className="px-4 py-2">{entry.companyRut}</td>
                <td className="px-4 py-2">{entry.performedByEmail}</td>
                <td className="px-4 py-2 text-muted-foreground">{entry.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
