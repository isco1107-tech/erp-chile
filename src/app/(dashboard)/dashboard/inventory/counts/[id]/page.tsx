import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getInventoryCountAction } from '@/modules/inventory/actions/inventory-count.actions';
import InventoryCountClient from '@/components/inventory/InventoryCountClient';

export const metadata = { title: 'Toma de inventario' };

export default async function InventoryCountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [context, result] = await Promise.all([getAuthContext(), getInventoryCountAction(id)]);
  if (!result.success) notFound();

  return (
    <div className="space-y-6">
      <Link href="/dashboard/inventory/counts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> Tomas de inventario
      </Link>
      <InventoryCountClient count={result.data} canWrite={can(context, 'inventory:write')} canSeeCosts={can(context, 'products:costs')} />
    </div>
  );
}
