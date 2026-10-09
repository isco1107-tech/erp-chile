import Link from 'next/link';
import SalesDocumentForm, { type SalesFolioStatus } from '@/components/SalesDocumentForm';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { getFolioAvailability } from '@/modules/dte/services/caf.service';
import { DTE_TYPES } from '@/modules/sales/schema';
import { getSalesDraftForEdit } from '@/modules/sales/services/sales.service';

export const metadata = { title: 'Nueva Venta' };

type DteTypeParam = (typeof DTE_TYPES)[number];

export default async function NewSalesDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[]; type?: string | string[]; draft?: string | string[]; contactId?: string | string[] }>;
}) {
  const params = await searchParams;
  // Un parámetro repetido (`?draft=a&draft=b`) llega como arreglo: solo se acepta texto.
  const single = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
  const orderId = single(params.orderId);
  const type = single(params.type);
  const draftId = single(params.draft);
  const contactId = single(params.contactId);

  // Emitir exige `sales:write`: quien solo puede ver ventas ve el motivo en vez de un formulario que fallaría al guardar.
  const access = await checkPageAccess('sales:write');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const context = access.context;

  const initialType = DTE_TYPES.includes(type as DteTypeParam) ? (type as DteTypeParam) : undefined;

  const draft = draftId ? await getSalesDraftForEdit(context.companyId, draftId) : null;
  if (draftId && !draft) {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState
          title="Este borrador ya no está disponible"
          description="Pudo haberse emitido o eliminado. Revisa el historial de ventas para encontrar el documento."
          action={
            <Link href="/dashboard/sales" className={buttonVariants({ size: 'sm' })}>
              Ir al historial de ventas
            </Link>
          }
        />
      </div>
    );
  }

  const availability = await getFolioAvailability(context.companyId);
  const folioStatus: SalesFolioStatus = {
    hasDteBilling: context.features.hasDteBilling,
    canManageFolios: can(context, 'dte:manage_caf'),
    typesWithFolios: availability.filter((entry) => entry.remaining > 0).map((entry) => entry.dteType),
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">
        {orderId ? 'Emitir desde nota de venta' : draft ? 'Editar y emitir borrador' : 'Nueva Venta / Facturador'}
      </h1>
      <SalesDocumentForm orderId={orderId} initialType={initialType} initialDraft={draft ?? undefined} initialContactId={contactId} folioStatus={folioStatus} />
    </div>
  );
}
