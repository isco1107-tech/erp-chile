import Link from 'next/link';
import { can, getAuthContext } from '@/lib/auth/guards';
import OrgChartTree from '@/components/org-chart/OrgChartTree';

export const metadata = { title: 'Organigrama' };

export default async function OrgChartPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'orgchart:write');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Organigrama</h1>
        {canWrite && (
          <Link
            href="/dashboard/org-chart/manage"
            className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
          >
            Gestionar cargos y jerarquía
          </Link>
        )}
      </div>
      <OrgChartTree />
    </div>
  );
}
