import { PageHeader } from '@/components/ui/PageHeader';
import { FixedAssetsClient } from '@/components/fixed-assets/FixedAssetsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Activo Fijo' };

export default async function FixedAssetsPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzas"
        title="Activo Fijo"
        description="Bienes de uso de la empresa con su depreciación lineal o acelerada y su valor libro al día. Con Contabilidad, la depreciación del mes se contabiliza con un clic."
      />
      <FixedAssetsClient
        canWrite={can(context, 'assets:write')}
        canPostEntries={context.features.hasAccounting && can(context, 'assets:write') && can(context, 'accounting:manual_entry')}
      />
    </div>
  );
}
