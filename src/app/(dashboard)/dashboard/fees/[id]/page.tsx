import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getFeeDocumentAction } from '@/modules/fees/actions/fees.actions';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import { can, getAuthContext } from '@/lib/auth/guards';
import MarkFeeDocumentPaidButton from '@/components/fees/MarkFeeDocumentPaidButton';
import DeleteFeeDocumentButton from '@/components/fees/DeleteFeeDocumentButton';

export const metadata = { title: 'Boleta de Honorarios' };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
};

export default async function FeeDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getFeeDocumentAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const doc = result.data;
  const canWrite = can(context, 'fees:write');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/fees" className={buttonVariants({ variant: 'outline' })}>← Volver al listado</Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            {doc.paymentStatus !== 'PAID' && <MarkFeeDocumentPaidButton documentId={doc.id} />}
            <DeleteFeeDocumentButton documentId={doc.id} folioNumber={doc.folioNumber} />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <h2 className="text-lg font-bold">Boleta de Honorarios N° {doc.folioNumber}</h2>
            <p className="text-muted-foreground">Prestador: {formatRut(doc.contact.rut)} — {doc.contact.razonSocial}</p>
            {doc.project && <p className="text-muted-foreground">Proyecto: {doc.project.name}</p>}
            <p className="text-xs text-muted-foreground">
              Registro interno — la BHE es emitida por el prestador ante el SII, esto solo la registra en el ERP
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {PAYMENT_STATUS_LABEL[doc.paymentStatus]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded border border-border p-3">
          <p><span className="font-medium">Fecha de Emisión:</span> {new Date(doc.issueDate).toLocaleDateString('es-CL')}</p>
          <p><span className="font-medium">Tasa de retención:</span> {(doc.retentionRateBps / 100).toFixed(2)}%</p>
        </div>

        <div>
          <p className="font-medium text-foreground">Descripción del servicio</p>
          <p className="text-muted-foreground">{doc.serviceDescription}</p>
        </div>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 rounded border border-border p-3">
            <div className="flex justify-between"><span>Monto Bruto</span><span>{formatCurrency(doc.grossAmount)}</span></div>
            <div className="flex justify-between"><span>Retención 2ª Categoría</span><span>-{formatCurrency(doc.retentionAmount)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Líquido a Pagar</span><span>{formatCurrency(doc.netToPay)}</span></div>
            {doc.paymentStatus === 'PAID' && (
              <>
                <div className="flex justify-between text-muted-foreground"><span>Pagado</span><span>{formatCurrency(doc.paidAmount)}</span></div>
                {doc.paymentDate && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fecha de pago</span><span>{new Date(doc.paymentDate).toLocaleDateString('es-CL')}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
