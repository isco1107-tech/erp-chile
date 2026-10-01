import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import ExcelExportClient from '@/components/reports/ExcelExportClient';

export const metadata = {
  title: 'Reportes Excel',
};

export default async function ReportsPage() {
  // Libro básico: `reports:basic` (Core). Con Reportes Avanzados contratado y
  // `reports:read` el libro trae además márgenes, Kardex y panel de F29.
  const context = await getAuthContext();
  const advanced = can(context, 'reports:read');
  if (!advanced && !can(context, 'reports:basic')) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-tutorial="module-header">Reportes Excel</h1>
        <p className="text-sm text-muted-foreground">
          Descarga tus productos, inventario, ventas, compras y pagos en un libro de Excel.{advanced ? ' Incluye el panel de indicadores, márgenes y Kardex valorizado.' : ''}
        </p>
      </div>
      <ExcelExportClient advanced={advanced} />
    </div>
  );
}
