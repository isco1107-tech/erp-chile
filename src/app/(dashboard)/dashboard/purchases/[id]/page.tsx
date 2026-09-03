import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPurchaseDocumentAction } from '@/modules/purchases/actions/purchases.actions';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import DocumentPaymentsPanel from '@/components/treasury/DocumentPaymentsPanel';
import MatchOverrideButton from '@/components/MatchOverrideButton';
import DraftPurchaseActions from '@/components/DraftPurchaseActions';
import PrintButton from '@/components/PrintButton';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Documento de Compra' };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Registrado',
  CANCELLED: 'Anulado',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

export default async function PurchaseDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getPurchaseDocumentAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const doc = result.data;
  const canOverrideMatch = can(context, 'purchases:override_match');
  const canEditDraft = doc.status === 'DRAFT' && can(context, 'purchases:write');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/purchases" className={buttonVariants({ variant: 'outline' })}>← Volver al historial</Link>
        <div className="flex gap-2">
          {canEditDraft && <DraftPurchaseActions documentId={doc.id} />}
          {doc.status === 'ISSUED' && <PrintButton />}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5 print:border-black/20">
          <div>
            <h2 className="text-lg font-bold">{PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType]} N° {doc.folio}</h2>
            <p className="text-muted-foreground">Proveedor: {formatRut(doc.contact.rut)} — {doc.contact.razonSocial}</p>
            <p className="text-xs text-muted-foreground">Registro interno de {doc.company.businessName} (RUT {formatRut(doc.company.rut)}) — no reemplaza el documento tributario del proveedor</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {STATUS_LABEL[doc.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded border border-border p-3">
          <p><span className="font-medium">Fecha de Emisión:</span> {new Date(doc.issueDate).toLocaleDateString('es-CL')}</p>
          {doc.dueDate && <p><span className="font-medium">Vencimiento:</span> {new Date(doc.dueDate).toLocaleDateString('es-CL')}</p>}
        </div>

        {doc.approvalStatus !== 'NOT_REQUIRED' && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p>
              <span className="font-medium">Aprobación:</span>{' '}
              {doc.approvalStatus === 'PENDING' && 'Pendiente de aprobación'}
              {doc.approvalStatus === 'APPROVED' && `Aprobada por ${doc.approvedByUser?.name ?? 'usuario eliminado'}${doc.approvedAt ? ` el ${new Date(doc.approvedAt).toLocaleString('es-CL')}` : ''}`}
              {doc.approvalStatus === 'REJECTED' && `Rechazada por ${doc.approvedByUser?.name ?? 'usuario eliminado'}${doc.approvedAt ? ` el ${new Date(doc.approvedAt).toLocaleString('es-CL')}` : ''}`}
            </p>
            {doc.approvalNotes && <p className="mt-1 text-muted-foreground">Motivo: {doc.approvalNotes}</p>}
          </div>
        )}

        {doc.matchStatus !== 'NOT_APPLICABLE' && (
          <div className={`rounded border p-3 text-sm ${doc.matchStatus === 'MISMATCHED' ? 'border-destructive/30 bg-destructive/5' : 'border-green-500/30 bg-green-500/5'}`}>
            <div className="flex items-center justify-between gap-2">
              <p>
                <span className="font-medium">Matching con Orden de Compra:</span>{' '}
                {doc.matchStatus === 'MATCHED' && 'Coincide'}
                {doc.matchStatus === 'MISMATCHED' && 'No coincide — pago bloqueado'}
                {doc.matchStatus === 'OVERRIDDEN' && 'Diferencia forzada'}
              </p>
              {doc.matchStatus === 'MISMATCHED' && canOverrideMatch && <MatchOverrideButton documentId={doc.id} />}
            </div>
            {doc.matchNotes && <p className="mt-1 text-muted-foreground">{doc.matchNotes}</p>}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] table-auto border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-2">Descripción</th>
                <th className="p-2 text-right">Cantidad</th>
                <th className="p-2 text-right">Costo Unit.</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="p-2">{item.description}{item.isExempt ? ' (Exento)' : ''}</td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">{formatCurrency(item.unitCost)}</td>
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
                <div className="flex justify-between text-muted-foreground"><span>Pagado</span><span>{formatCurrency(doc.paidAmount)}</span></div>
                <div className="flex justify-between font-medium"><span>Saldo Pendiente</span><span>{formatCurrency(doc.totalAmount - doc.paidAmount)}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Estado de pago</span><span>{PAYMENT_STATUS_LABEL[doc.paymentStatus]}</span></div>
              </>
            )}
          </div>
        </div>

        {doc.notes && <p><span className="font-medium text-foreground">Notas:</span> {doc.notes}</p>}

        <p className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground print:border-black/20">
          Registro interno generado por {doc.company.businessName} el {new Date().toLocaleString('es-CL')}
        </p>
      </div>

      {doc.status === 'ISSUED' && (
        <div className="mx-auto max-w-3xl print:hidden">
          <DocumentPaymentsPanel
            kind="purchase"
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
