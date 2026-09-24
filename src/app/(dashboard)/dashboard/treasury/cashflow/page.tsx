import CashFlowClient from '@/components/treasury/CashFlowClient';
import { PageHeader } from '@/components/ui/PageHeader';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listTreasuryAccountOptions } from '@/modules/treasury/services/accounts.service';

export const metadata = { title: 'Flujo de Caja' };

export default async function CashFlowPage() {
  const context = await getAuthContext();
  // Los datos del flujo los trae la acción (que exige `treasury:read`); acá
  // solo se cargan las cuentas del filtro, con el mismo permiso.
  const accounts = can(context, 'treasury:read') ? await listTreasuryAccountOptions(context.companyId) : [];
  return (
    <div className="space-y-6" data-tutorial="module-header">
      <PageHeader
        eyebrow="Tesorería"
        title="Flujo de Caja"
        description="Todo el dinero que entró y salió: ventas, compras, sueldos, honorarios, rendiciones, cuotas, entradas y más, con su origen."
      />
      <CashFlowClient accounts={accounts.map(({ id, name }) => ({ id, name }))} />
    </div>
  );
}
