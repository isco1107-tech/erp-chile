import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import OrgChartManageClient from '@/components/org-chart/OrgChartManageClient';

export const metadata = { title: 'Gestionar Organigrama' };

export default async function OrgChartManagePage() {
  const context = await getAuthContext();
  if (!can(context, 'orgchart:write')) redirect('/dashboard/org-chart');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Gestionar Organigrama</h1>
      <OrgChartManageClient canUseAi={can(context, 'orgchart:ai')} />
    </div>
  );
}
