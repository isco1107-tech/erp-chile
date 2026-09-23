import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { CrmBoardClient } from '@/components/crm/CrmBoardClient';
import { CrmTabs } from '@/components/crm/CrmTabs';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'CRM · Embudo de negocios' };

export default async function CrmPage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM comercial"
        title="Embudo de negocios"
        description="Auspicios, producción de eventos, entradas corporativas y más: cada negocio con su etapa, probabilidad y próximo paso. Arrastra las tarjetas para avanzarlas."
      />
      <CrmTabs />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando embudo…</p>}>
        <CrmBoardClient canWrite={can(context, 'crm:write')} />
      </Suspense>
    </div>
  );
}
