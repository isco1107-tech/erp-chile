import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { getPublicInvoiceLink } from '@/modules/treasury/online/invoice-links.service';

export const metadata: Metadata = { title: 'Pagar documento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Página pública de un link de pago de factura. Quien paga no tiene cuenta:
 * la "credencial" es el token del link (64 hex). Muestra lo mínimo para
 * reconocer el cobro: empresa, documento, cliente y monto.
 */
export default async function InvoicePaymentPage({ params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;
  const view = await getPublicInvoiceLink(accessToken);
  if (!view) notFound();

  return (
    <main className="theme-saas-light flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{view.companyName}</p>
          <h1 className="mt-1 text-xl font-semibold">{view.documentLabel}</h1>
          <p className="text-sm text-muted-foreground">{view.customerName}</p>
        </div>
        <p className="text-3xl font-bold tabular-nums">{formatCurrency(view.amount)}</p>

        {view.status === 'PAID' && (
          <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Pago recibido{view.paidAt ? ` el ${new Date(view.paidAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}` : ''}. ¡Gracias!
          </p>
        )}
        {view.status === 'PENDING' && view.paymentUrl && (
          <>
            <a
              href={view.paymentUrl}
              className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Pagar con transferencia (Khipu)
            </a>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden="true" /> Si ya pagaste, la confirmación puede tardar unos minutos: recarga esta página.
            </p>
          </>
        )}
        {(view.status === 'EXPIRED' || view.status === 'FAILED') && (
          <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            <XCircle className="size-4" aria-hidden="true" /> Este link ya no está vigente. Pide uno nuevo a {view.companyName}.
          </p>
        )}
      </div>
    </main>
  );
}
