import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import WhatsAppButton from '@/components/shared/WhatsAppButton';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { getCustomerStatement } from '@/modules/treasury/services/statement.service';

export const metadata = { title: 'Estado de cuenta' };
export const dynamic = 'force-dynamic';

const formatDate = (date: Date | null) => (date ? new Date(date).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '—');

const AGING_LABELS = [
  ['current', 'Al día'],
  ['d1to30', '1 a 30 días'],
  ['d31to60', '31 a 60 días'],
  ['d61to90', '61 a 90 días'],
  ['over90', 'Más de 90 días'],
] as const;

/**
 * Estado de cuenta imprimible de un cliente: saldo por documento, antigüedad
 * de la deuda y pagos de los últimos 6 meses. Pensado para imprimir en PDF o
 * enviar al cliente al cobrar.
 */
export default async function CustomerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context.features.hasTreasury || !can(context, 'treasury:read')) notFound();
  const statement = await getCustomerStatement(context.companyId, id);
  if (!statement) notFound();
  const { contact, company, documents, payments, totals } = statement;
  const reminder = `Hola ${contact.razonSocial}, te compartimos tu estado de cuenta con ${company.businessName}: saldo pendiente ${formatCurrency(totals.due)}${totals.overdue > 0 ? `, de los cuales ${formatCurrency(totals.overdue)} están vencidos` : ''}. Quedamos atentos.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/contacts/${contact.id}`} className={buttonVariants({ variant: 'outline' })}>
          <ArrowLeft aria-hidden="true" /> Volver a la ficha
        </Link>
        <div className="flex flex-wrap gap-2">
          {contact.phone && totals.due > 0 && <WhatsAppButton phone={contact.phone} name={contact.razonSocial} message={reminder} />}
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto max-w-4xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{company.businessName}</p>
            <p className="text-muted-foreground">RUT {company.rut}</p>
            {company.address && (
              <p className="text-muted-foreground">
                {company.address}
                {company.comuna ? `, ${company.comuna}` : ''}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado de cuenta</p>
            <p className="font-semibold">{contact.razonSocial}</p>
            <p className="text-muted-foreground">RUT {formatRut(contact.rut)}</p>
            <p className="text-xs text-muted-foreground">Al {formatDate(statement.generatedAt)}</p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Saldo total</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totals.due)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Vencido</p>
            <p className={`text-xl font-bold tabular-nums ${totals.overdue > 0 ? 'text-danger' : ''}`}>{formatCurrency(totals.overdue)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Documentos abiertos</p>
            <p className="text-xl font-bold tabular-nums">{documents.length}</p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Antigüedad de la deuda</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {AGING_LABELS.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-border p-2 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(totals.aging[key])}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos con saldo</h2>
          {documents.length === 0 ? (
            <p className="text-muted-foreground">El cliente no tiene documentos pendientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Documento</th>
                  <th className="py-1">Emisión</th>
                  <th className="py-1">Vencimiento</th>
                  <th className="py-1 text-right">Total</th>
                  <th className="py-1 text-right">Pagado</th>
                  <th className="py-1 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-border">
                    <td className="py-1.5">
                      {DTE_TYPE_LABELS[doc.dteType]} N° {doc.folio ?? '—'}
                      {doc.daysOverdue > 0 && (
                        <StatusBadge tone="danger" className="ml-2 print:hidden">
                          {doc.daysOverdue} días vencido
                        </StatusBadge>
                      )}
                    </td>
                    <td className="py-1.5">{formatDate(doc.issueDate)}</td>
                    <td className="py-1.5">{formatDate(doc.dueDate)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(doc.totalAmount)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(doc.paidAmount)}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{formatCurrency(doc.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagos recibidos (últimos 6 meses)</h2>
          {payments.length === 0 ? (
            <p className="text-muted-foreground">Sin pagos registrados en el período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Fecha</th>
                  <th className="py-1">Medio</th>
                  <th className="py-1">Aplicado a</th>
                  <th className="py-1">Comprobante</th>
                  <th className="py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="py-1.5">{formatDate(payment.paymentDate)}</td>
                    <td className="py-1.5">{PAYMENT_METHOD_TYPE_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_TYPE_LABELS] ?? payment.paymentMethod}</td>
                    <td className="py-1.5">{payment.documentFolio ? `Doc. N° ${payment.documentFolio}` : '—'}</td>
                    <td className="py-1.5">{payment.reference ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </article>
    </div>
  );
}
