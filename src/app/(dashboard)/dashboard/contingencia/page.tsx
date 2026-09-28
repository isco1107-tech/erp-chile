import { can, getAuthContext, AuthError, TenantInactiveError } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import ContingencyWorkspace from '@/components/offline/ContingencyWorkspace';
import type { ContingencyForm } from '@/lib/offline/contingency';

export const metadata = { title: 'Modo sin conexión' };

/**
 * Registro sin conexión de movimientos de stock, compras y recepciones de OC
 * (docs/adr/0002). El service worker guarda esta pantalla para abrirla sin red.
 * Cada formulario aparece solo con el permiso que exige la acción que lo
 * aplica al sincronizar (que además vuelve a verificarlo).
 */
export default async function ContingencyPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  const forms: ContingencyForm[] = [];
  if (can(context, 'inventory:write')) forms.push('STOCK_MOVEMENT');
  if (can(context, 'purchases:write')) forms.push('PURCHASE');
  if (can(context, 'purchases:orders')) forms.push('GOODS_RECEIPT');
  if (forms.length === 0) return <PageAccessNotice denied="permission" />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Contingencia"
        title="Modo sin conexión"
        description="Si se cae internet, sigue registrando movimientos de bodega, compras y recepciones de órdenes de compra hasta por 2 horas. Todo se aplica solo al volver la conexión."
      />
      <ContingencyWorkspace companyId={context.companyId} userId={context.id} forms={forms} />
    </div>
  );
}
