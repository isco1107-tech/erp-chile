import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import AssetLabelsClient from '@/components/fixed-assets/AssetLabelsClient';
import { getAuthContext } from '@/lib/auth/guards';
import { getFixedAssetsAction } from '@/modules/fixed-assets/actions/fixed-assets.actions';

export const metadata = { title: 'Etiquetas de activo fijo' };

export default async function AssetLabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const context = await getAuthContext();
  const result = await getFixedAssetsAction();
  const assets = (result.success ? result.data.assets : [])
    .filter((asset) => asset.status === 'ACTIVE')
    .map((asset) => ({ id: asset.id, code: asset.code, name: asset.name, location: asset.location, category: asset.category }));
  const preselected = (ids ?? '').split(',').filter((id) => assets.some((asset) => asset.id === id));
  return (
    <div className="space-y-6">
      <Link href="/dashboard/fixed-assets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> Activo fijo
      </Link>
      <PageHeader eyebrow="Activo fijo" title="Etiquetas de inventario" description="Imprime la etiqueta con código de barras de cada bien para pegarla en él: el inventario físico se hace escaneando." />
      <AssetLabelsClient assets={assets} companyName={context.companyName} preselected={preselected} />
    </div>
  );
}
