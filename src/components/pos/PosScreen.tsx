import { can, type AuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { getOpenShiftForUser } from '@/modules/pos/services/cash.service';
import { listWarehouses } from '@/modules/inventory/services/stock.service';
import OpenShiftPanel from '@/components/pos/OpenShiftPanel';
import PosWorkspace from '@/components/pos/PosWorkspace';
import ShiftHistoryPanel from '@/components/pos/ShiftHistoryPanel';
import { supersuiteHabilitada } from '@/lib/supersuite';

export default async function PosScreen({ context }: { context: AuthContext }) {
  if (context.mustChangePassword || !can(context, 'pos:operate')) return null;
  const shift = await getOpenShiftForUser(context.companyId, context.id);

  if (!shift) {
    const warehouses = await listWarehouses(context.companyId);
    return (
      <div className="space-y-8">
        <OpenShiftPanel
          cashierName={context.name || context.email}
          cashierEmail={context.email}
          canManageRegisters={can(context, 'settings:company')}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        />
        <ShiftHistoryPanel currentUserId={context.id} canSupervise={can(context, 'pos:close')} />
      </div>
    );
  }

  // Datos del emisor para el ticket. Se leen en el servidor: el ticket es un
  // documento tributario y su encabezado no puede depender de lo que el cliente
  // tenga cargado en memoria.
  const company = await prisma.company.findUnique({
    where: { id: context.companyId },
    select: { businessName: true, rut: true, address: true, comuna: true },
  });

  const address = [company?.address, company?.comuna].filter(Boolean).join(', ') || null;

  return (
    <PosWorkspace
      shiftId={shift.id}
      warehouseId={shift.cashRegister.warehouseId}
      warehouseName={shift.cashRegister.warehouse.name}
      cashRegisterName={shift.cashRegister.name}
      cashierName={shift.user?.name || shift.user?.email || 'Cajero'}
      openedAt={shift.openedAt.toISOString()}
      initialAmount={shift.initialAmount}
      canClose
      currentUserId={context.id}
      canSupervise={can(context, 'pos:close')}
      companyName={company?.businessName ?? 'Empresa'}
      companyRut={company?.rut ?? ''}
      companyAddress={address}
      reportarLatidos={supersuiteHabilitada()}
    />
  );
}
