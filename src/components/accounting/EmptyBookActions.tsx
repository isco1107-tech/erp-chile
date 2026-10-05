import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { can, getAuthContext } from '@/lib/auth/guards';

/**
 * Siguiente paso de un libro contable vacío. Los asientos no se escriben a mano:
 * los generan las ventas, las compras y los pagos, así que se ofrece ir a la
 * pantalla donde nacen. Solo aparecen los accesos que la empresa y el usuario
 * realmente tienen.
 */
export async function EmptyBookActions() {
  const context = await getAuthContext();
  const showSales = context.features.hasDteBilling && can(context, 'sales:read');
  const showPurchases = context.features.hasPurchases && can(context, 'purchases:read');
  if (!showSales && !showPurchases) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {showSales && (
        <Link href="/dashboard/sales" className={buttonVariants({ size: 'sm' })}>
          Ir a Ventas
        </Link>
      )}
      {showPurchases && (
        <Link href="/dashboard/purchases" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          Ir a Compras
        </Link>
      )}
    </div>
  );
}
