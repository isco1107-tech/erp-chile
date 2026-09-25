import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import PriceListEditor from '@/components/sales/PriceListEditor';
import { getPriceList } from '@/modules/sales/services/price-lists.service';

export const metadata = { title: 'Lista de precios' };

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const list = await getPriceList(context.companyId, id);
  if (!list) notFound();
  return (
    <div className="space-y-6">
      <Link href="/dashboard/sales/price-lists" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Listas de precios
      </Link>
      <PageHeader eyebrow="Lista de precios" title={list.name} description={list.description ?? undefined} />
      <PriceListEditor list={list} canWrite={can(context, 'sales:write')} />
    </div>
  );
}
