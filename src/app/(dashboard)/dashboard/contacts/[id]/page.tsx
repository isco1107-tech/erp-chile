import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Building2, Handshake, Receipt, FileSignature, CreditCard, ShoppingCart, ArrowRight } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getContactAction } from '@/modules/contacts/actions/contacts.actions';
import { listSponsorshipContractsAction } from '@/modules/sponsorships/actions/sponsorships.actions';
import { listFeeDocumentsAction } from '@/modules/fees/actions/fees.actions';
import { listPromissoryNotesAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';
import { listPaymentPlansAction } from '@/modules/payment-plans/actions/payment-plans.actions';
import { listSalesDocumentsAction } from '@/modules/sales/actions/sales.actions';
import { listPurchaseDocumentsAction } from '@/modules/purchases/actions/purchases.actions';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_STATUS_LABELS } from '@/modules/sponsorships/schema';
import { PROMISSORY_NOTE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/modules/promissory-notes/schema';
import { PAYMENT_STATUS_LABELS as INSTALLMENT_PAYMENT_STATUS_LABELS } from '@/modules/payment-plans/schema';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';

export const metadata = { title: 'Ficha de Contacto' };

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitido',
  CANCELLED: 'Anulado',
};

/** Tarjeta de sección con encabezado iconizado — misma unidad visual que la ficha de Candidata. */
function SectionCard({ icon: Icon, title, action, children }: { icon: LucideIcon; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
            <Icon className="size-4 text-accent-foreground" strokeWidth={1.75} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'contacts:read')) notFound();

  const contactResult = await getContactAction(id);
  if (!contactResult.success) notFound();
  const contact = contactResult.data;

  // Cada sección se pide solo si el módulo correspondiente está contratado Y
  // el usuario tiene permiso de leerlo — mismo criterio que el resto del
  // panel. Todas en paralelo: son 5 lecturas independientes por `contactId`.
  const [sponsorships, fees, promissoryNotes, paymentPlans, sales, purchases] = await Promise.all([
    context.features.hasSponsorships && can(context, 'sponsorships:read')
      ? listSponsorshipContractsAction(undefined, id)
      : Promise.resolve(null),
    context.features.hasFeeDocuments && can(context, 'fees:read')
      ? listFeeDocumentsAction({ contactId: id })
      : Promise.resolve(null),
    context.features.hasPromissoryNotes && can(context, 'promissorynotes:read')
      ? listPromissoryNotesAction(id)
      : Promise.resolve(null),
    context.features.hasInstallmentPlans && can(context, 'paymentplans:read')
      ? listPaymentPlansAction(id)
      : Promise.resolve(null),
    context.features.hasDteBilling && can(context, 'sales:read')
      ? listSalesDocumentsAction(undefined, undefined, undefined, 1, 10, 'issueDate', 'desc', id)
      : Promise.resolve(null),
    context.features.hasPurchases && can(context, 'purchases:read')
      ? listPurchaseDocumentsAction(undefined, undefined, 1, 10, id)
      : Promise.resolve(null),
  ]);

  const sponsorshipRows = sponsorships?.success ? sponsorships.data : [];
  const feeRows = fees?.success ? fees.data : [];
  const noteRows = promissoryNotes?.success ? promissoryNotes.data : [];
  const planRows = paymentPlans?.success ? paymentPlans.data : [];
  const saleRows = sales?.success ? sales.data.items : [];
  const purchaseRows = purchases?.success ? purchases.data.items : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/contacts" className="text-xs text-muted-foreground hover:underline">
            ← Clientes & Proveedores
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{contact.razonSocial}</h1>
          <p className="text-sm text-muted-foreground">{formatRut(contact.rut)}</p>
        </div>
        <div className="flex gap-1.5">
          {contact.isCustomer && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium">Cliente</span>}
          {contact.isSupplier && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">Proveedor</span>}
        </div>
      </div>

      <SectionCard icon={Building2} title="Datos de contacto">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Giro" value={contact.giro} />
          <Field label="Email" value={contact.email} />
          <Field label="Teléfono" value={contact.phone} />
          <Field label="Comuna" value={contact.comuna} />
          <Field label="Dirección" value={contact.address} />
          <Field label="Límite de crédito" value={contact.creditLimit ? formatCurrency(contact.creditLimit) : 'Sin límite'} />
          <Field label="Días de crédito" value={contact.creditDays > 0 ? `${contact.creditDays} días` : 'Al contado'} />
        </div>
      </SectionCard>

      {sponsorships && sponsorshipRows.length > 0 && (
        <SectionCard
          icon={Handshake}
          title="Auspicios"
          action={<Link href="/dashboard/sponsorships" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todos <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Tier</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Monto</th>
                </tr>
              </thead>
              <tbody>
                {sponsorshipRows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{SPONSORSHIP_TIER_LABELS[row.tier]}</td>
                    <td className="py-1.5 pr-3">{SPONSORSHIP_STATUS_LABELS[row.status]}</td>
                    <td className="py-1.5 pr-3">{row.isBarter ? 'Canje' : formatCurrency(row.cashAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {fees && feeRows.length > 0 && (
        <SectionCard
          icon={Receipt}
          title="Boletas de Honorarios"
          action={<Link href="/dashboard/fees" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todas <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Fecha</th>
                  <th className="py-1.5 pr-3">Bruto</th>
                  <th className="py-1.5 pr-3">Retención</th>
                  <th className="py-1.5 pr-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{new Date(row.issueDate).toLocaleDateString('es-CL')}</td>
                    <td className="py-1.5 pr-3">{formatCurrency(row.grossAmount)}</td>
                    <td className="py-1.5 pr-3">{formatCurrency(row.retentionAmount)}</td>
                    <td className="py-1.5 pr-3">{PAYMENT_STATUS_LABELS[row.paymentStatus]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {promissoryNotes && noteRows.length > 0 && (
        <SectionCard
          icon={FileSignature}
          title="Pagarés"
          action={<Link href="/dashboard/promissory-notes" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todos <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Monto</th>
                  <th className="py-1.5 pr-3">Vencimiento</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {noteRows.map((note) => (
                  <tr key={note.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{formatCurrency(note.amount)}</td>
                    <td className="py-1.5 pr-3">{new Date(note.dueDate).toLocaleDateString('es-CL')}</td>
                    <td className="py-1.5 pr-3">{PROMISSORY_NOTE_STATUS_LABELS[note.status]}</td>
                    <td className="py-1.5 pr-3">{formatCurrency(note.paidAmount)} ({PAYMENT_STATUS_LABELS[note.paymentStatus]})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {paymentPlans && planRows.length > 0 && (
        <SectionCard
          icon={CreditCard}
          title="Planes de pago"
          action={<Link href="/dashboard/payment-plans" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todos <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="space-y-4">
            {planRows.map((plan) => (
              <div key={plan.id}>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {plan.installmentCount} cuotas — Total {formatCurrency(plan.totalAmount)}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3">N°</th>
                        <th className="py-1.5 pr-3">Vencimiento</th>
                        <th className="py-1.5 pr-3">Monto</th>
                        <th className="py-1.5 pr-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.installments.map((installment) => (
                        <tr key={installment.id} className="border-t border-border">
                          <td className="py-1.5 pr-3">{installment.installmentNumber}</td>
                          <td className="py-1.5 pr-3">{new Date(installment.dueDate).toLocaleDateString('es-CL')}</td>
                          <td className="py-1.5 pr-3">{formatCurrency(installment.amount)}</td>
                          <td className="py-1.5 pr-3">{INSTALLMENT_PAYMENT_STATUS_LABELS[installment.paymentStatus]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {sales && saleRows.length > 0 && (
        <SectionCard
          icon={ShoppingCart}
          title="Ventas recientes"
          action={<Link href="/dashboard/sales" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todas <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Folio</th>
                  <th className="py-1.5 pr-3">Tipo</th>
                  <th className="py-1.5 pr-3">Fecha</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {saleRows.map((doc) => (
                  <tr key={doc.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{doc.folio ?? '—'}</td>
                    <td className="py-1.5 pr-3">{DTE_TYPE_LABELS[doc.dteType]}</td>
                    <td className="py-1.5 pr-3">{new Date(doc.issueDate).toLocaleDateString('es-CL')}</td>
                    <td className="py-1.5 pr-3">{DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}</td>
                    <td className="py-1.5 pr-3">{formatCurrency(doc.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {purchases && purchaseRows.length > 0 && (
        <SectionCard
          icon={ShoppingCart}
          title="Compras recientes"
          action={<Link href="/dashboard/purchases" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver todas <ArrowRight className="size-3.5" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Folio proveedor</th>
                  <th className="py-1.5 pr-3">Fecha</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRows.map((doc) => (
                  <tr key={doc.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{doc.folio}</td>
                    <td className="py-1.5 pr-3">{new Date(doc.issueDate).toLocaleDateString('es-CL')}</td>
                    <td className="py-1.5 pr-3">{DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}</td>
                    <td className="py-1.5 pr-3">{formatCurrency(doc.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
