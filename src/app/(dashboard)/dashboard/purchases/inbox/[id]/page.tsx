import { notFound } from 'next/navigation';
import ReceivedDteDetailClient from '@/components/dte/ReceivedDteDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getReceivedDteAction } from '@/modules/dte/actions/received.actions';

export const metadata = { title: 'DTE recibido' };

export default async function ReceivedDteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const result = await getReceivedDteAction(id);
  if (!result.success) notFound();
  return <ReceivedDteDetailClient dte={result.data} canWrite={can(context, 'purchases:write')} />;
}
