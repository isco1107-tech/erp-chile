import { notFound } from 'next/navigation';
import AssetSheetClient from '@/components/fixed-assets/AssetSheetClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getFixedAssetAction } from '@/modules/fixed-assets/actions/fixed-assets.actions';

export const metadata = { title: 'Ficha del bien' };

export default async function AssetSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const result = await getFixedAssetAction(id);
  if (!result.success) notFound();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  return <AssetSheetClient asset={result.data} canWrite={can(context, 'assets:write')} today={today} />;
}
