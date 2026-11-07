import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import { checkPageAccess } from '@/lib/auth/guards';
import Link from 'next/link';

export const metadata = { title: 'Data Science' };

export default async function DataSciencePage() {
  const access = await checkPageAccess('science:view');
  if (access.denied) return <p className="rounded-lg border border-border bg-card p-6">{access.denied === 'module' ? 'Activa Data Science en Configuración → Módulos y menú.' : 'Esta sección es exclusiva para dueños y administradores con permiso de Data Science.'} <Link className="underline" href="/dashboard/settings/modules">Ir a configuración</Link></p>;
  return <AnalyticsDashboard key={access.context.companyId} module="science" />;
}
