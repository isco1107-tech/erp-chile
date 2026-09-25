import Link from 'next/link';
import { Banknote, FileText, Landmark, Receipt, Wrench } from 'lucide-react';
import {
  PublicBadge,
  PublicCard,
  PublicCardHeader,
  PublicFooter,
  PublicPage,
  PublicRow,
  PublicShell,
  PublicTopBar,
  PublicTotal,
} from '@/components/public/PublicShell';
import { formatCurrency } from '@/lib/chile/tax';
import { SERVICE_STATUS_LABELS, type ServiceStatus } from '@/lib/service/tickets';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import type { CustomerPortalView } from '@/modules/contacts/services/customer-portal.service';

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

const STATE_BADGE = {
  PAID: { tone: 'ok', label: 'Pagado' },
  PENDING: { tone: 'accent', label: 'Pendiente' },
  PARTIAL: { tone: 'accent', label: 'Abonado' },
  OVERDUE: { tone: 'warn', label: 'Vencido' },
  INFO: { tone: 'neutral', label: 'Emitido' },
} as const;

/**
 * Portal del cliente (`/cliente/[token]`): estado de cuenta, documentos para
 * ver o descargar, pagos recibidos, cotizaciones y órdenes de servicio.
 * Componente de servidor: no hay nada que editar aquí.
 */
export default function CustomerPortalClient({ token, view }: { token: string; view: CustomerPortalView }) {
  const { summary } = view;
  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={view.company.name} right={<PublicBadge tone="accent">Portal de clientes</PublicBadge>} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Receipt className="size-5" />}
            eyebrow={`${view.customer.name} · RUT ${view.customer.rut}`}
            title="Tu estado de cuenta"
            subtitle={summary.balance > 0 ? `Tienes ${summary.openCount} documento${summary.openCount === 1 ? '' : 's'} por pagar.` : 'Estás al día: no tienes saldos pendientes.'}
          />
          <PublicTotal
            label="Saldo pendiente"
            value={formatCurrency(summary.balance)}
            note={summary.overdue > 0 ? `${formatCurrency(summary.overdue)} vencido (${summary.overdueCount} documento${summary.overdueCount === 1 ? '' : 's'})` : summary.nextDue ? `Próximo vencimiento: ${formatDate(summary.nextDue)}` : undefined}
          />
        </PublicCard>

        {summary.balance > 0 && view.bankAccounts.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" icon={<Landmark className="size-5" />} title="Cómo pagar" subtitle={`Transfiere a nombre de ${view.company.name} e indica el número de documento.`} />
            {view.bankAccounts.map((account, index) => (
              <div key={index} className="mb-2">
                <PublicRow label="Banco" value={account.bank} />
                <PublicRow label="Cuenta" value={`${account.accountType} N° ${account.accountNumber}`} />
              </div>
            ))}
            <PublicRow label="RUT" value={view.company.rut} />
            {view.company.email && <PublicRow label="Aviso de pago" value={view.company.email} />}
          </PublicCard>
        )}

        <PublicCard>
          <PublicCardHeader align="start" icon={<FileText className="size-5" />} title="Documentos" subtitle="Ábrelos para verlos o descargarlos en PDF." />
          {view.documents.length === 0 ? (
            <p className="pub-subtitle">Aún no hay documentos emitidos.</p>
          ) : (
            view.documents.map((document) => {
              const badge = STATE_BADGE[document.state];
              return (
                <Link key={document.id} href={`/cliente/${token}/documentos/${document.id}`} className="block rounded-lg transition-opacity hover:opacity-80">
                  <PublicRow
                    label={
                      <span>
                        {DTE_TYPE_LABELS[document.dteType]} N° {document.folio ?? 'S/N'}
                        <span className="block text-xs opacity-70">
                          {formatDate(document.issueDate)}
                          {document.dueDate && document.balance > 0 ? ` · vence ${formatDate(document.dueDate)}` : ''}
                        </span>
                      </span>
                    }
                    value={
                      <span className="flex items-center gap-2">
                        <span className="text-right">
                          {formatCurrency(document.total)}
                          {document.balance > 0 && document.balance < document.total && <span className="block text-xs opacity-70">saldo {formatCurrency(document.balance)}</span>}
                        </span>
                        <PublicBadge tone={badge.tone}>{badge.label}</PublicBadge>
                      </span>
                    }
                  />
                </Link>
              );
            })
          )}
        </PublicCard>

        {view.payments.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" icon={<Banknote className="size-5" />} title="Pagos recibidos" />
            {view.payments.map((payment, index) => (
              <PublicRow
                key={index}
                label={`${formatDate(payment.date)} · ${PAYMENT_METHOD_TYPE_LABELS[payment.method as keyof typeof PAYMENT_METHOD_TYPE_LABELS] ?? payment.method}${payment.reference ? ` · ${payment.reference}` : ''}`}
                value={formatCurrency(payment.amount)}
              />
            ))}
          </PublicCard>
        )}

        {view.quotes.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" title="Cotizaciones recientes" />
            {view.quotes.map((quote) => (
              <Link key={quote.id} href={`/cliente/${token}/documentos/${quote.id}`} className="block rounded-lg transition-opacity hover:opacity-80">
                <PublicRow label={`Cotización N° ${quote.folio ?? 'S/N'} · ${formatDate(quote.issueDate)}`} value={formatCurrency(quote.total)} />
              </Link>
            ))}
          </PublicCard>
        )}

        {view.serviceTickets.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" icon={<Wrench className="size-5" />} title="Servicio técnico" />
            {view.serviceTickets.map((ticket) => (
              <Link key={ticket.folio} href={`/servicio/${ticket.trackingToken}`} className="block rounded-lg transition-opacity hover:opacity-80">
                <PublicRow label={`Orden N° ${ticket.folio} · ${ticket.equipment}`} value={<PublicBadge tone={ticket.status === 'READY' ? 'ok' : ticket.status === 'WAITING_APPROVAL' ? 'warn' : 'neutral'}>{SERVICE_STATUS_LABELS[ticket.status as ServiceStatus] ?? ticket.status}</PublicBadge>} />
              </Link>
            ))}
          </PublicCard>
        )}

        <PublicFooter>
          {[view.company.name, view.company.address, view.company.phone, view.company.email].filter(Boolean).join(' · ')}. Este enlace es personal de tu empresa: no lo publiques.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}
