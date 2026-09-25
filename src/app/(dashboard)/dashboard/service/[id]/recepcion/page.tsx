/* eslint-disable @next/next/no-img-element -- QR en data URI: next/image no aporta nada acá */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import { getAuthContext } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { prisma } from '@/lib/prisma';
import { SERVICE_PRIORITY_LABELS, type SERVICE_PRIORITIES } from '@/modules/service-desk/schema';
import { getServiceTicketAction } from '@/modules/service-desk/actions/service-tickets.actions';

export const metadata = { title: 'Comprobante de recepción' };

function longDate(value: Date): string {
  return value.toLocaleString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });
}

export default async function ServiceReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const result = await getServiceTicketAction(id);
  if (!result.success) notFound();
  const ticket = result.data;
  const company = await prisma.company.findFirst({ where: { id: context.companyId }, select: { businessName: true, rut: true, address: true, comuna: true, phone: true, email: true } });
  const trackingUrl = `${getAppUrl()}/servicio/${ticket.trackingToken}`;
  const qr = await QRCode.toDataURL(trackingUrl, { width: 240, margin: 1 });

  const rows: Array<[string, string]> = [
    ['Equipo', [ticket.equipment, ticket.brand, ticket.model].filter(Boolean).join(' · ')],
    ['N° de serie', ticket.serialNumber ?? '—'],
    ['Accesorios', ticket.accessories ?? 'Sin accesorios'],
    ['Prioridad', SERVICE_PRIORITY_LABELS[ticket.priority as (typeof SERVICE_PRIORITIES)[number]] ?? ticket.priority],
    ['Fecha comprometida', ticket.promisedDate ? ticket.promisedDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Por confirmar tras el diagnóstico'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/service/${ticket.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Orden N° {ticket.folio}
        </Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-8 text-sm text-foreground shadow-card print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-foreground/15 pb-4">
          <div>
            <p className="text-base font-bold">{company?.businessName}</p>
            <p className="text-xs">RUT {company?.rut}</p>
            {company?.address && <p className="text-xs">{company.address}{company.comuna ? `, ${company.comuna}` : ''}</p>}
            {(company?.phone || company?.email) && <p className="text-xs">{[company?.phone, company?.email].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide">Orden de servicio</p>
            <p className="text-2xl font-bold">N° {ticket.folio}</p>
            <p className="text-xs">{longDate(ticket.createdAt)}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
            <p className="font-semibold">{ticket.customer.name}</p>
            <p className="text-xs">RUT {ticket.customer.rut}</p>
            {ticket.customer.phone && <p className="text-xs">{ticket.customer.phone}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recibido por</p>
            <p>{ticket.receivedByName ?? '—'}</p>
            {ticket.warranty && <p className="mt-1 inline-block rounded border border-foreground/30 px-2 py-0.5 text-xs font-semibold">EN GARANTÍA</p>}
          </div>
        </section>

        <table className="mt-5 w-full">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-foreground/10">
                <th className="w-44 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</th>
                <td className="py-1.5">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Falla reportada por el cliente</p>
          <p className="mt-1 whitespace-pre-line rounded border border-foreground/15 p-3">{ticket.reportedIssue}</p>
        </section>

        <section className="mt-6 flex items-center gap-5 rounded border border-foreground/15 p-4">
          <img src={qr} alt="Código QR del enlace de seguimiento" width={120} height={120} />
          <div>
            <p className="font-semibold">Sigue tu reparación en línea</p>
            <p className="text-xs">Escanea el código o entra a:</p>
            <p className="mt-1 break-all font-mono text-xs">{trackingUrl}</p>
            <p className="mt-2 text-xs">Ahí verás el diagnóstico y podrás aprobar el presupuesto antes de que reparemos.</p>
          </div>
        </section>

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          El diagnóstico y presupuesto se informan antes de reparar; ninguna reparación con costo se realiza sin tu aprobación. Presenta este comprobante (o el número de orden) para retirar el equipo. Los equipos no retirados dentro de 90 días desde el aviso de término podrán generar cobro por bodegaje.
        </p>

        <footer className="mt-14 grid grid-cols-2 gap-12 text-center text-xs">
          <div className="border-t border-foreground/40 pt-2">Firma cliente</div>
          <div className="border-t border-foreground/40 pt-2">Recibido por {company?.businessName}</div>
        </footer>
      </article>
    </div>
  );
}
