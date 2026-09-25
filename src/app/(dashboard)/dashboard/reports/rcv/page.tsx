import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import RcvClient from '@/components/reports/RcvClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { santiagoDateParts } from '@/lib/chile/timezone';

export const metadata = { title: 'Registro de Compras y Ventas (RCV)' };

export default async function RcvPage() {
  const context = await getAuthContext();
  if (!can(context, 'reports:read')) redirect('/dashboard');
  // Por defecto el mes anterior: es el que se declara en el F29 de este mes.
  const today = santiagoDateParts(new Date());
  const previous = today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzas · SII"
        title="Registro de Compras y Ventas"
        description="Cuadra el RCV que arma el SII con tus documentos del mes antes de declarar el F29: facturas de proveedores que faltan registrar, montos distintos y documentos que el SII no tiene."
      />
      <RcvClient initialYear={previous.year} initialMonth={previous.month} canCreatePurchases={can(context, 'purchases:write')} />
    </div>
  );
}
