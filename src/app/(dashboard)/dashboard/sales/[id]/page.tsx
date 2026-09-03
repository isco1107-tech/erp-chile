import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSalesDocumentAction } from '@/modules/sales/actions/sales.actions';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import PrintButton from '@/components/PrintButton';
import { buttonVariants } from '@/components/ui/button';
import DocumentPaymentsPanel from '@/components/treasury/DocumentPaymentsPanel';

export const metadata = { title: 'Documento de Venta' };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'BORRADOR — NO VÁLIDO COMO DOCUMENTO TRIBUTARIO',
  ISSUED: 'EMITIDO',
  CANCELLED: 'ANULADO',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

export default async function SalesDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getSalesDocumentAction(id);
  if (!result.success) notFound();

  const doc = result.data;
  const dteLabel = DTE_TYPE_LABELS[doc.dteType].toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/sales" className={buttonVariants({ variant: 'outline' })}>← Volver al historial</Link>
        <PrintButton />
      </div>

      {doc.status !== 'ISSUED' && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground print:hidden">
          {STATUS_LABEL[doc.status]}
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5 print:border-black/20">
          <div className="flex items-start gap-3">
            {doc.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.company.logoUrl} alt={doc.company.businessName} className="size-14 shrink-0 rounded-md object-contain" />
            )}
            <div>
              <h2 className="text-lg font-bold">{doc.company.businessName}</h2>
              <p className="text-muted-foreground">RUT: {formatRut(doc.company.rut)}</p>
              {doc.company.address && <p className="text-muted-foreground">{doc.company.address}</p>}
            </div>
          </div>
          <div className="w-64 shrink-0 rounded border-2 border-red-600 p-3 text-center text-red-600">
            <p className="font-bold">R.U.T.: {formatRut(doc.company.rut)}</p>
            <p className="mt-1 font-bold">{dteLabel}</p>
            <p className="mt-1 text-lg font-bold">N° {doc.folio ?? '(sin folio)'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded border border-border p-3">
          <div>
            <p><span className="font-medium">Señor(es):</span> {doc.contact.razonSocial}</p>
            <p><span className="font-medium">RUT:</span> {doc.contact.rut}</p>
            <p><span className="font-medium">Giro:</span> {doc.contact.giro ?? '—'}</p>
          </div>
          <div>
            <p><span className="font-medium">Dirección:</span> {doc.contact.address ?? '—'}</p>
            <p><span className="font-medium">Comuna:</span> {doc.contact.comuna ?? '—'}</p>
            <p><span className="font-medium">Fecha:</span> {new Date(doc.issueDate).toLocaleDateString('es-CL')}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] table-auto border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-2">SKU</th>
                <th className="p-2">Descripción</th>
                <th className="p-2 text-right">Cantidad</th>
                <th className="p-2 text-right">P. Unitario</th>
                <th className="p-2 text-right">% Dsc.</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="p-2">{item.sku ?? '—'}</td>
                  <td className="p-2">{item.description}{item.isExempt ? ' (Exento)' : ''}</td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="p-2 text-right">{item.discountPercent}%</td>
                  <td className="p-2 text-right">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 rounded border border-border p-3">
            <div className="flex justify-between"><span>Monto Neto</span><span>{formatCurrency(doc.netAmount)}</span></div>
            <div className="flex justify-between"><span>Monto Exento</span><span>{formatCurrency(doc.exemptAmount)}</span></div>
            <div className="flex justify-between"><span>IVA (19%)</span><span>{formatCurrency(doc.ivaAmount)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total</span><span>{formatCurrency(doc.totalAmount)}</span></div>
            {doc.status === 'ISSUED' && (
              <>
                <div className="flex justify-between text-muted-foreground"><span>Abonado</span><span>{formatCurrency(doc.paidAmount)}</span></div>
                <div className="flex justify-between font-medium"><span>Saldo Pendiente</span><span>{formatCurrency(doc.totalAmount - doc.paidAmount)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Estado de pago</span><span>{PAYMENT_STATUS_LABEL[doc.paymentStatus]}</span></div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-muted-foreground">
          <p><span className="font-medium text-foreground">Forma de pago:</span> {PAYMENT_METHOD_LABELS[doc.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? doc.paymentMethod}</p>
          {doc.dueDate && <p><span className="font-medium text-foreground">Vencimiento:</span> {new Date(doc.dueDate).toLocaleDateString('es-CL')}</p>}
          {doc.referenceFolio && (
            <p><span className="font-medium text-foreground">Referencia:</span> {doc.referenceType ? DTE_TYPE_LABELS[doc.referenceType] : ''} N° {doc.referenceFolio}</p>
          )}
          {doc.notes && <p className="col-span-2"><span className="font-medium text-foreground">Notas:</span> {doc.notes}</p>}
        </div>

        <p className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground print:border-black/20">
          Documento generado por {doc.company.businessName} el {new Date().toLocaleString('es-CL')}
        </p>
      </div>

      {doc.status === 'ISSUED' && (
        <div className="mx-auto max-w-3xl print:hidden">
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
