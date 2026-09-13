import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { buttonVariants } from '@/components/ui/button';
import ImportWizard from '@/components/settings/ImportWizard';
import AiInvoiceScanner from '@/components/settings/AiInvoiceScanner';
import AiPromptImporter from '@/components/settings/AiPromptImporter';
import { ENTITY_WRITE_PERMISSION, IMPORT_ENTITIES, type ImportEntity } from '@/modules/import/schema';

export const metadata = { title: 'Importación Masiva' };

export default async function ImportPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  if (!can(context, 'import:data')) redirect('/dashboard/settings');

  // Solo se ofrece importar lo que el usuario puede crear. `can` ya cruza rol
  // personalizado y módulos contratados, así que un plan sin Inventario no
  // muestra la opción de productos.
  const availableEntities = IMPORT_ENTITIES.filter((entity: ImportEntity) =>
    can(context, ENTITY_WRITE_PERMISSION[entity])
  );

  // El escaneo por foto puede producir tanto filas de venta como de compra en
  // el mismo lote (según lo que aparezca en cada imagen), así que se ofrece
  // solo si el usuario puede escribir ambas — mismo criterio que exige el
  // Route Handler `/api/import/ai-scan`.
  const canScanInvoices =
    can(context, ENTITY_WRITE_PERMISSION.historicalSales) && can(context, ENTITY_WRITE_PERMISSION.historicalPurchases);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-tutorial="module-header">Importación Masiva</h1>
          <p className="text-sm text-muted-foreground">
            Carga tu catálogo o tu cartera desde Excel. Nada se guarda hasta que revises la vista previa.
          </p>
        </div>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>
          ← Volver
        </Link>
      </div>

      <ImportWizard availableEntities={[...availableEntities]} />

      {canScanInvoices && <AiPromptImporter />}
      {canScanInvoices && <AiInvoiceScanner />}
    </div>
  );
}
