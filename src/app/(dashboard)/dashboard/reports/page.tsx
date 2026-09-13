import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import ExcelExportClient from '@/components/reports/ExcelExportClient';

export const metadata = {
  title: 'Reportes Excel',
};

export default async function ReportsPage() {
  // El feature gate del plan lo aplica el layout del módulo; acá solo queda el
  // permiso del usuario, resuelto con `can` para respetar los roles personalizados.
  const context = await getAuthContext();
  if (!can(context, 'reports:read')) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-tutorial="module-header">Reportes Excel</h1>
        <p className="text-sm text-muted-foreground">
          Descarga la base completa de productos, inventario y finanzas en un libro con panel de indicadores.
        </p>
      </div>
      <ExcelExportClient />
    </div>
  );
}
