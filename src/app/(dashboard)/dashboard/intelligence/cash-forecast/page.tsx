import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { CashForecastClient } from '@/components/intelligence/CashForecastClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getCashForecast } from '@/modules/intelligence/services/cash-forecast.service';

export const metadata = { title: 'Caja a 13 semanas' };

export default async function CashForecastPage() {
  const context = await getAuthContext();
  if (!context.features.hasIntelligence || !can(context, 'intelligence:view')) return null;

  const data = await getCashForecast(context.companyId, {
    hasInstallmentPlans: context.features.hasInstallmentPlans,
    hasPromissoryNotes: context.features.hasPromissoryNotes,
    hasPayroll: context.features.hasPayroll,
    hasExpenseReports: context.features.hasExpenseReports,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de Negocio"
        title="Caja proyectada a 13 semanas"
        description="Todo lo que ya está comprometido con fecha: cobros, pagos, cuotas, pagarés, remuneraciones e IVA. Detecta un descalce antes de que ocurra."
        actions={
          <Link href="/dashboard/intelligence" className={buttonVariants({ variant: 'outline' })}>
            ← Radiografía 360
          </Link>
        }
      />
      <CashForecastClient data={data} />
    </div>
  );
}
