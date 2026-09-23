import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileCheck2 } from 'lucide-react';
import { getSalesDocumentAction } from '@/modules/sales/actions/sales.actions';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { isBoleta, isDte } from '@/lib/chile/dte/codes';
import { tedPdf417DataUri } from '@/lib/chile/dte/barcode';
import PrintButton from '@/components/PrintButton';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import DocumentPaymentsPanel from '@/components/treasury/DocumentPaymentsPanel';

export const metadata = { title: 'Documento de Venta' };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

/**
 * Leyenda del acuse de recibo (Ley 19.983). Va solo en la copia cedible de
 * facturas y guías: es la que permite ceder la factura (factoring), y el SII
 * exige este texto literal.
 */
const ACUSE_RECIBO_LEYENDA =
  'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).';

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

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
  const docLabel = DTE_TYPE_LABELS[doc.dteType];
  const tributario = isDte(doc.dteType);
  // Copia cedible: facturas y guías, nunca boletas ni cotizaciones.
  const admiteCedible = tributario && !isBoleta(doc.dteType) && doc.dteType !== 'NOTA_CREDITO_61' && doc.dteType !== 'NOTA_DEBITO_56';
  const esCedible = admiteCedible && cedible === '1';
  const timbre = doc.status === 'ISSUED' && doc.tedXml ? tedPdf417DataUri(doc.tedXml) : null;
  const emisorLocalidad = [doc.company.comuna, doc.company.ciudad].filter(Boolean).join(', ');
  const receptorEsConsumidorFinal = isBoleta(doc.dteType) && doc.contact.rut.replace(/\D/g, '').startsWith('66666666');

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

      <article
        className="relative mx-auto max-w-[210mm] space-y-6 overflow-hidden rounded-xl border border-border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
        aria-label={`${docLabel} ${doc.folio ?? ''}`}
      >
        {doc.status !== 'ISSUED' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[88px] font-black tracking-widest text-neutral-900/[0.05] [transform:rotate(-24deg)]"
          >
            {doc.status === 'DRAFT' ? 'BORRADOR' : 'ANULADO'}
          </div>
        )}

        {/* Encabezado: emisor a la izquierda, recuadro del documento a la derecha. */}
        <header className="flex items-start justify-between gap-8">
          <div className="flex min-w-0 items-start gap-4">
            {doc.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.company.logoUrl} alt="" className="size-16 shrink-0 object-contain" />
            )}
            <div className="min-w-0 space-y-0.5">
              <h1 className="text-lg font-bold uppercase leading-tight tracking-tight">{doc.company.businessName}</h1>
              {doc.company.giro && <p className="text-neutral-700">Giro: {doc.company.giro}</p>}
              {doc.company.address && <p className="text-neutral-700">{doc.company.address}</p>}
              {emisorLocalidad && <p className="text-neutral-700">{emisorLocalidad}</p>}
              {(doc.company.phone || doc.company.email) && (
                <p className="text-neutral-500">{[doc.company.phone, doc.company.email].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>

          {tributario ? (
            <div className="w-60 shrink-0 border-[3px] border-red-600 px-4 py-3 text-center font-bold leading-snug text-red-600">
              <p>R.U.T.: {formatRut(doc.company.rut)}</p>
              <p className="my-1.5 uppercase">{docLabel}</p>
              <p className="text-base">N° {doc.folio ?? 'S/N'}</p>
            </div>
          ) : (
            <div className="w-60 shrink-0 rounded-md border-2 border-neutral-300 px-4 py-3 text-center font-semibold leading-snug text-neutral-700">
              <p>R.U.T.: {formatRut(doc.company.rut)}</p>
              <p className="my-1.5 uppercase">{docLabel}</p>
              <p className="text-base">N° {doc.folio ?? 'S/N'}</p>
            </div>
          )}
        </header>

        {/* Receptor */}
        <section aria-label="Datos del receptor" className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-1 rounded-md border border-neutral-300 px-4 py-3">
          <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5">
            <dt className="font-semibold">Señor(es):</dt>
            <dd>{receptorEsConsumidorFinal ? 'Consumidor final' : doc.contact.razonSocial}</dd>
            <dt className="font-semibold">R.U.T.:</dt>
            <dd>{doc.contact.rut}</dd>
            {!isBoleta(doc.dteType) && (
              <>
                <dt className="font-semibold">Giro:</dt>
                <dd>{doc.contact.giro ?? '—'}</dd>
                <dt className="font-semibold">Dirección:</dt>
                <dd>{[doc.contact.address, doc.contact.comuna].filter(Boolean).join(', ') || '—'}</dd>
              </>
            )}
          </dl>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-3 gap-y-0.5">
            <dt className="font-semibold">Fecha emisión:</dt>
            <dd>{formatDate(doc.issueDate)}</dd>
            {doc.dueDate && (
              <>
                <dt className="font-semibold">Vencimiento:</dt>
                <dd>{formatDate(doc.dueDate)}</dd>
              </>
            )}
            <dt className="font-semibold">Forma de pago:</dt>
            <dd>{PAYMENT_METHOD_LABELS[doc.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? doc.paymentMethod}</dd>
          </dl>
        </section>

        {doc.referenceFolio && (
          <section aria-label="Referencias" className="rounded-md border border-neutral-300 px-4 py-2">
            <p>
              <span className="font-semibold">Referencia:</span>{' '}
              {doc.referenceType ? DTE_TYPE_LABELS[doc.referenceType] : 'Documento'} N° {doc.referenceFolio}
            </p>
          </section>
        )}

        {/* Detalle */}
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[14%]" />
            <col />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-y-2 border-neutral-800 text-left text-[11px] uppercase tracking-wide">
              <th className="py-2 pr-2 font-semibold">Código</th>
              <th className="py-2 pr-2 font-semibold">Descripción</th>
              <th className="py-2 pr-2 text-right font-semibold">Cant.</th>
              <th className="py-2 pr-2 text-right font-semibold">P. unitario</th>
              <th className="py-2 pr-2 text-right font-semibold">Dcto.</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {doc.items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-2 text-neutral-600">{item.sku ?? '—'}</td>
                <td className="py-2 pr-2">
                  {item.description}
                  {item.isExempt && <span className="ml-1 text-[11px] font-semibold text-neutral-500">(Exento)</span>}
                </td>
                <td className="py-2 pr-2 text-right">{item.quantity.toLocaleString('es-CL')}</td>
                <td className="py-2 pr-2 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 pr-2 text-right">{item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Timbre + totales */}
        <section className="flex items-start justify-between gap-8 break-inside-avoid">
          <div className="max-w-[9cm] text-center text-[11px] leading-snug text-neutral-700">
            {timbre ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={timbre} alt="Timbre electrónico SII (código PDF417)" className="h-auto w-[8cm] max-w-full" />
                <p className="mt-1.5 font-semibold">Timbre Electrónico SII</p>
                <p>Verifique documento: www.sii.cl</p>
              </>
            ) : tributario && doc.status === 'ISSUED' ? (
              <p className="rounded-md border border-dashed border-neutral-400 px-3 py-2 text-left text-neutral-600">
                Documento emitido con numeración interna, sin timbre electrónico del SII. Carga los folios autorizados (CAF) en
                Configuración para emitir documentos timbrados.
              </p>
            ) : null}
          </div>

          <dl className="w-72 shrink-0 space-y-1 tabular-nums">
            {doc.netAmount > 0 && (
              <div className="flex justify-between"><dt>Monto neto</dt><dd>{formatCurrency(doc.netAmount)}</dd></div>
            )}
            {doc.exemptAmount > 0 && (
              <div className="flex justify-between"><dt>Monto exento</dt><dd>{formatCurrency(doc.exemptAmount)}</dd></div>
            )}
            {doc.ivaAmount > 0 && (
              <div className="flex justify-between"><dt>I.V.A. 19%</dt><dd>{formatCurrency(doc.ivaAmount)}</dd></div>
            )}
            <div className="flex justify-between border-t-2 border-neutral-800 pt-1.5 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatCurrency(doc.totalAmount)}</dd>
            </div>
            {doc.status === 'ISSUED' && doc.paidAmount > 0 && doc.paidAmount < doc.totalAmount && (
              <div className="flex justify-between pt-1 text-neutral-600 print:hidden">
                <dt>Saldo pendiente</dt>
                <dd>{formatCurrency(doc.totalAmount - doc.paidAmount)}</dd>
              </div>
            )}
          </dl>
        </section>

        {doc.notes && (
          <section aria-label="Observaciones" className="border-t border-neutral-200 pt-3">
            <p><span className="font-semibold">Observaciones:</span> {doc.notes}</p>
          </section>
        )}

        {esCedible && (
          <section aria-label="Acuse de recibo" className="break-inside-avoid rounded-md border border-neutral-800 p-4 text-[12px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {['Nombre', 'R.U.T.', 'Fecha', 'Recinto', 'Firma'].map((field) => (
                <p key={field} className="flex items-end gap-2">
                  <span className="shrink-0 font-semibold">{field}:</span>
                  <span className="h-5 flex-1 border-b border-neutral-500" />
                </p>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-snug text-neutral-600">{ACUSE_RECIBO_LEYENDA}</p>
          </section>
        )}

        <footer className="flex items-center justify-between border-t border-neutral-200 pt-3 text-[10px] text-neutral-500">
          <span>{doc.company.businessName} · R.U.T. {formatRut(doc.company.rut)}</span>
          {esCedible && <span className="text-sm font-bold tracking-widest text-neutral-900">CEDIBLE</span>}
        </footer>
      </article>

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
