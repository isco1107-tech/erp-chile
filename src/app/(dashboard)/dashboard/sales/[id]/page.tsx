import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, FileCheck2 } from 'lucide-react';
import { getSalesDocumentAction } from '@/modules/sales/actions/sales.actions';
import { isBoleta, isDte } from '@/lib/chile/dte/codes';
import PrintButton from '@/components/PrintButton';
import SalesDocumentPaper from '@/components/sales/SalesDocumentPaper';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import DocumentPaymentsPanel from '@/components/treasury/DocumentPaymentsPanel';

export const metadata = { title: 'Documento de Venta' };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

export default async function SalesDocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cedible?: string }>;
}) {
  const [{ id }, { cedible }] = await Promise.all([params, searchParams]);
  const result = await getSalesDocumentAction(id);
  if (!result.success) notFound();

  const doc = result.data;
  const tributario = isDte(doc.dteType);
  // Copia cedible: facturas y guías, nunca boletas ni cotizaciones.
  const admiteCedible = tributario && !isBoleta(doc.dteType) && doc.dteType !== 'NOTA_CREDITO_61' && doc.dteType !== 'NOTA_DEBITO_56';
  const esCedible = admiteCedible && cedible === '1';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/sales" className={buttonVariants({ variant: 'outline' })}>
          <ArrowLeft aria-hidden="true" /> Volver al historial
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {doc.status === 'ISSUED' && (
            <StatusBadge tone={doc.paymentStatus === 'PAID' ? 'success' : doc.paymentStatus === 'PARTIAL' ? 'warning' : 'neutral'}>
              {PAYMENT_STATUS_LABEL[doc.paymentStatus]}
            </StatusBadge>
          )}
          {admiteCedible && doc.status === 'ISSUED' && (
            <Link
              href={esCedible ? `/dashboard/sales/${doc.id}` : `/dashboard/sales/${doc.id}?cedible=1`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <FileCheck2 aria-hidden="true" /> {esCedible ? 'Ver copia normal' : 'Copia cedible'}
            </Link>
          )}
          {doc.dteType === 'COTIZACION' && doc.status !== 'CANCELLED' && (
            <Link href={`/dashboard/sales/orders/new?quoteId=${doc.id}`} className={buttonVariants()}>
              <ClipboardList aria-hidden="true" /> Convertir en nota de venta
            </Link>
          )}
          {doc.salesOrderId && (
            <Link href={`/dashboard/sales/orders/${doc.salesOrderId}`} className={buttonVariants({ variant: 'outline' })}>
              <ClipboardList aria-hidden="true" /> Ver nota de venta
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      {doc.status === 'DRAFT' && (
        <p className="mx-auto max-w-[210mm] rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning print:hidden">
          Borrador: no es un documento tributario válido hasta que se emita.
        </p>
      )}
      {doc.status === 'CANCELLED' && (
        <p className="mx-auto max-w-[210mm] rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger print:hidden">
          Documento anulado.
        </p>
      )}

      <SalesDocumentPaper doc={doc} esCedible={esCedible} />

      {doc.status === 'ISSUED' && (
        <div className="mx-auto max-w-[210mm] print:hidden">
          <DocumentPaymentsPanel
            kind="sales"
            documentId={doc.id}
            totalAmount={doc.totalAmount}
            paidAmount={doc.paidAmount}
            contactLabel={`${doc.contact.rut} — ${doc.contact.razonSocial}`}
          />
        </div>
      )}
    </div>
  );
}
