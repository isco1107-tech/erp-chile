import Link from 'next/link';
import { FileSpreadsheet } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/guards';
import { canOpenExports, exportAccess } from '@/lib/exports/access';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { MovementsExportPanel } from '@/components/exports/MovementsExportPanel';
import { SalesExportPanel } from '@/components/exports/SalesExportPanel';
import { exportsHref } from '@/components/exports/ExportChrome';

export const metadata = { title: 'Exportar datos' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;

/**
 * Un solo lugar para ver y bajar a Excel todas las boletas (y demás documentos de venta) y todos los
 * movimientos de inventario de la empresa, con el mismo filtro en pantalla y en el archivo. Cada pestaña
 * aparece solo si el rol y el plan lo permiten.
 */
export default async function ExportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  const access = exportAccess(context);
  if (!canOpenExports(access)) return <PageAccessNotice denied="permission" />;

  const read = (key: string) => one(params[key]);
  const requested = read('datos');
  const dataset: 'boletas' | 'movimientos' =
    requested === 'movimientos' && access.movements ? 'movimientos' : requested === 'boletas' && access.sales ? 'boletas' : access.sales ? 'boletas' : 'movimientos';

  const tabs = [
    ...(access.sales ? [{ id: 'boletas' as const, label: 'Boletas y documentos de venta' }] : []),
    ...(access.movements ? [{ id: 'movimientos' as const, label: 'Movimientos de inventario' }] : []),
  ];
  // Al cambiar de pestaña se conserva el rango de fechas y la bodega.
  const carry = { rango: read('rango'), desde: read('desde'), hasta: read('hasta'), bodega: read('bodega') };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Herramientas"
        title="Exportar datos"
        description="Mira y descarga en Excel todas las boletas y todos los movimientos de inventario, por fechas y con los filtros que necesites."
        actions={
          access.fullReport ? (
            <Link href="/dashboard/reports" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
              <FileSpreadsheet className="size-4" aria-hidden="true" /> Libro completo en Excel
            </Link>
          ) : undefined
        }
      />

      {tabs.length > 1 && (
        <nav aria-label="Qué exportar" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={exportsHref({ datos: tab.id, ...carry })}
              aria-current={tab.id === dataset ? 'page' : undefined}
              className={`inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium ${tab.id === dataset ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}

      {dataset === 'boletas' ? (
        <SalesExportPanel companyId={context.companyId} read={read} />
      ) : (
        <MovementsExportPanel companyId={context.companyId} read={read} includeCosts={access.costs} />
      )}
    </div>
  );
}
