import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import BomsClient from '@/components/manufacturing/BomsClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listBomsAction } from '@/modules/manufacturing/actions/manufacturing.actions';

export const metadata = { title: 'Recetas de producción' };

export default async function BomsPage() {
  const context = await getAuthContext();
  const boms = await listBomsAction();
  return (
    <div className="space-y-6">
      <Link href="/dashboard/manufacturing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Producción
      </Link>
      <PageHeader eyebrow="Operaciones · Producción" title="Recetas" description="Lista de materiales de cada producto que fabricas: qué insumos lleva y en qué cantidad." />
      <BomsClient boms={boms.success ? boms.data : []} canWrite={can(context, 'manufacturing:write')} showCosts={can(context, 'products:costs')} />
    </div>
  );
}
