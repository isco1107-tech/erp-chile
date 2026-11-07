import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import { checkPageAccess } from '@/lib/auth/guards';
import Link from 'next/link';

export const metadata = { title: 'Data Analytics' };

export default async function AnalyticsPage() {
  const access = await checkPageAccess('analytics:view');
  if (access.denied) return <p className="rounded-lg border border-border bg-card p-6">{access.denied === 'module' ? 'Activa Data Analytics en Configuración → Módulos y menú.' : 'Esta sección es exclusiva para dueños y administradores con permiso de Data Analytics.'} <Link className="underline" href="/dashboard/settings/modules">Ir a configuración</Link></p>;
  return <AnalyticsDashboard key={access.context.companyId} module="analytics" />;
}
