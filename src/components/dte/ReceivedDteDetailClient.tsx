'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Download, FilePlus2, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { receivedDteLabel } from '@/lib/chile/dte/received-meta';
import { cn } from '@/lib/utils';
import { decideReceivedDteAction, registerReceivedDteAction } from '@/modules/dte/actions/received.actions';
import { CLAIM_REASONS, RECEIVED_STATUS_LABELS, TED_STATUS_LABELS } from '@/modules/dte/schema';
import type { ReceivedDteDetail } from '@/modules/dte/services/received.service';
import { RECEIVED_STATUS_TONE, TED_TONE } from './ReceivedDteInboxClient';

function formatDay(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function formatMoment(value: Date | string | null): string {
  return value
    ? // 24 h a propósito: el "a. m." de 12 h usa espacios distintos en Node y en el navegador y rompe la hidratación.
      new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' })
    : '—';
}

function quantity(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: 6 });
}

const REFERENCE_CODES: Record<number, string> = { 1: 'Anula el documento', 2: 'Corrige texto', 3: 'Corrige montos' };

function referenceLabel(docType: string): string {
  if (/^\d+$/.test(docType)) {
    const code = Number(docType);
    if (code === 801) return 'Orden de compra';
    if (code === 802) return 'Nota de pedido';
    if (code === 803) return 'Contrato';
    return receivedDteLabel(code);
  }
  if (docType === 'HES') return 'Hoja de entrada de servicio';
  return docType || 'Documento';
}

export default function ReceivedDteDetailClient({ dte, canWrite }: { dte: ReceivedDteDetail; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [reason, setReason] = useState<string>(CLAIM_REASONS[0].code);
  const [detail, setDetail] = useState('');

  async function decide(status: 'PENDING' | 'ACCEPTED' | 'CLAIMED', note?: string) {
    setBusy(true);
    try {
      const result = await decideReceivedDteAction(dte.id, { status, note });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? 'Listo');
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (dte.tedStatus !== 'VALID') {
      const ok = await confirm({
        title: '¿Aceptar con el timbre en problemas?',
        description: 'El timbre de este documento no se pudo validar. Confirma con el proveedor antes de aceptarlo o pagarlo.',
        confirmLabel: 'Aceptar igual',
      });
      if (!ok) return;
    }
    await decide('ACCEPTED');
  }

  async function submitClaim() {
    const label = CLAIM_REASONS.find((item) => item.code === reason)?.label ?? reason;
    const note = detail.trim() ? `${label}: ${detail.trim()}` : label;
    if (await decide('CLAIMED', note)) {
      setClaiming(false);
      setDetail('');
    }
  }

  async function register() {
    if (dte.tedStatus !== 'VALID') {
      const ok = await confirm({
        title: '¿Registrar con el timbre en problemas?',
        description: 'Quedará como borrador en Compras. Antes de emitirla o pagarla, confirma el documento con el proveedor y en el RCV del SII.',
        confirmLabel: 'Registrar igual',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await registerReceivedDteAction(dte.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Compra creada');
      router.push(`/dashboard/purchases/${result.data.purchaseDocumentId}`);
    } finally {
      setBusy(false);
    }
  }

  const pending = dte.status === 'PENDING';
  const canRegister = canWrite && dte.status !== 'CLAIMED' && !(dte.status === 'REGISTERED' && dte.purchaseDocumentId);
  const TedIcon = dte.tedStatus === 'VALID' ? ShieldCheck : dte.tedStatus === 'MISSING' ? ShieldQuestion : ShieldAlert;
  const deadlineDate = new Date(new Date(dte.receivedAt).getTime() + dte.claimWindowDays * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/purchases/inbox" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> DTE recibidos
      </Link>

      <PageHeader
        eyebrow={`${dte.issuerName} · ${dte.issuerRut}`}
        title={`${dte.label} N° ${dte.folio}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={RECEIVED_STATUS_TONE[dte.status]}>{RECEIVED_STATUS_LABELS[dte.status]}</StatusBadge>
            <span>Emitida el {formatDay(dte.issueDate)}{dte.dueDate ? ` · vence el ${formatDay(dte.dueDate)}` : ''}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/purchases/received-dtes/${dte.id}/xml`} className={buttonVariants({ variant: 'outline' })}>
              <Download className="size-4" aria-hidden="true" /> XML
            </a>
            {canWrite && pending && (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setClaiming(true)}>
                  <XCircle className="size-4" aria-hidden="true" /> Reclamar
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={accept}>
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Aceptar
                </Button>
              </>
            )}
            {canWrite && (dte.status === 'ACCEPTED' || dte.status === 'CLAIMED') && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => decide('PENDING')}>
                <RotateCcw className="size-4" aria-hidden="true" /> Volver a revisar
              </Button>
            )}
            {canRegister && (
              <Button type="button" disabled={busy} onClick={register}>
                <FilePlus2 className="size-4" aria-hidden="true" /> {busy ? 'Registrando…' : 'Registrar en Compras'}
              </Button>
            )}
            {dte.purchaseDocument && (
              <Link href={`/dashboard/purchases/${dte.purchaseDocument.id}`} className={buttonVariants({ variant: 'default' })}>
                Ver compra
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Detalle">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Detalle</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Ítem</th>
                    <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-2 text-right font-medium">Precio</th>
                    <th className="px-4 py-2 text-right font-medium">Descuento</th>
                    <th className="px-4 py-2 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dte.lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">El documento no trae líneas de detalle.</td>
                    </tr>
                  )}
                  {dte.lines.map((line) => (
                    <tr key={line.lineNumber}>
                      <td className="px-4 py-2">
                        <p className="font-medium">
                          {line.name}
                          {line.exempt && <span className="ml-2 text-xs font-normal text-muted-foreground">exento</span>}
                        </p>
                        {line.description && <p className="text-xs text-muted-foreground">{line.description}</p>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {quantity(line.quantity)}
                        {line.unit && <span className="ml-1 text-xs text-muted-foreground">{line.unit}</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{line.unitPrice === null ? '—' : line.unitPrice.toLocaleString('es-CL', { maximumFractionDigits: 6 })}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{line.discount > 0 ? formatCurrency(line.discount) : '—'}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatCurrency(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto max-w-xs space-y-1 border-t border-border px-4 py-3 text-sm">
              {dte.netAmount > 0 && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Neto</dt><dd className="tabular-nums">{formatCurrency(dte.netAmount)}</dd></div>
              )}
              {dte.exemptAmount > 0 && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Exento</dt><dd className="tabular-nums">{formatCurrency(dte.exemptAmount)}</dd></div>
              )}
              {dte.ivaAmount > 0 && (
                <div className="flex justify-between"><dt className="text-muted-foreground">IVA</dt><dd className="tabular-nums">{formatCurrency(dte.ivaAmount)}</dd></div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(dte.totalAmount)}</dd></div>
            </dl>
          </section>

          {dte.references.length > 0 && (
            <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Referencias">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Referencias</h2>
              </div>
              <ul className="divide-y divide-border text-sm">
                {dte.references.map((reference) => (
                  <li key={reference.lineNumber} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                    <span>
                      <span className="font-medium">{referenceLabel(reference.docType)}</span> N° {reference.folio}
                      {reference.date && <span className="text-muted-foreground"> · {formatDay(reference.date)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[reference.code ? REFERENCE_CODES[reference.code] : null, reference.reason].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className={cn('rounded-lg border bg-card p-4 shadow-card', dte.tedStatus === 'VALID' ? 'border-border' : 'border-danger/40')} aria-label="Timbre electrónico">
            <div className="flex items-center gap-2">
              <TedIcon className={cn('size-5', dte.tedStatus === 'VALID' ? 'text-success' : dte.tedStatus === 'MISSING' ? 'text-warning' : 'text-danger')} aria-hidden="true" />
              <h2 className="text-sm font-semibold">Timbre electrónico</h2>
              <StatusBadge tone={TED_TONE[dte.tedStatus] ?? 'neutral'} className="ml-auto">{TED_STATUS_LABELS[dte.tedStatus] ?? dte.tedStatus}</StatusBadge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {dte.tedStatus === 'VALID'
                ? 'La firma del timbre cuadra con los datos del documento: no fue alterado después de emitirse. Su recepción en el SII se confirma al cuadrar el RCV del mes.'
                : dte.status === 'CLAIMED'
                  ? 'Documento reclamado.'
                  : `${dte.tedStatus === 'MISSING' ? 'El documento no trae timbre.' : 'El timbre no se pudo validar.'} No lo pagues sin confirmar con el proveedor y en el RCV del SII.`}
            </p>
            {dte.tedIssue && <p className="mt-2 text-xs font-medium text-danger">{dte.tedIssue}</p>}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Recepción">
            <h2 className="text-sm font-semibold">Recepción</h2>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="shrink-0 text-muted-foreground">Cargado</dt><dd>{formatMoment(dte.receivedAt)}</dd></div>
              {pending && (
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">Plazo para reclamar</dt>
                  <dd className={cn(dte.claimDaysLeft !== null && dte.claimDaysLeft <= 2 && 'font-medium text-warning')}>{formatMoment(deadlineDate)}</dd>
                </div>
              )}
              {dte.fileName && <div className="flex justify-between gap-2"><dt className="shrink-0 text-muted-foreground">Archivo</dt><dd className="truncate">{dte.fileName}</dd></div>}
              {dte.statusAt && !pending && (
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">{RECEIVED_STATUS_LABELS[dte.status]}</dt>
                  <dd className="text-right">{formatMoment(dte.statusAt)}{dte.statusByName ? ` · ${dte.statusByName}` : ''}</dd>
                </div>
              )}
            </dl>
            {dte.status === 'CLAIMED' && dte.statusNote && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{dte.statusNote}</p>}
            {pending && (
              <p className="mt-3 text-xs text-muted-foreground">
                La Ley 19.983 da {dte.claimWindowDays} días desde la recepción para reclamar el contenido. El reclamo con efecto legal se ingresa en sii.cl (Registro de Reclamos); aquí queda el control interno.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Proveedor">
            <h2 className="text-sm font-semibold">Proveedor</h2>
            <p className="mt-2 font-medium">{dte.issuerName}</p>
            <p className="text-xs text-muted-foreground">{dte.issuerRut}{dte.issuerGiro ? ` · ${dte.issuerGiro}` : ''}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {dte.supplier
                ? dte.supplier.isSupplier
                  ? 'Ya está en tus contactos como proveedor.'
                  : 'Está en tus contactos como cliente; al registrar la compra quedará también como proveedor.'
                : 'No está en tus contactos: se agregará como proveedor al registrar la compra.'}
            </p>
            {dte.purchaseDocument && (
              <p className="mt-3 rounded-md bg-success-soft px-3 py-2 text-xs text-success">
                Registrado en Compras ({dte.purchaseDocument.status === 'DRAFT' ? 'borrador' : dte.purchaseDocument.status === 'ISSUED' ? 'emitido' : 'anulado'}) por {formatCurrency(dte.purchaseDocument.totalAmount)}.
              </p>
            )}
          </section>
        </aside>
      </div>

      <Dialog open={claiming} onOpenChange={(open) => !busy && setClaiming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reclamar {dte.label.toLowerCase()} N° {dte.folio}</DialogTitle>
            <DialogDescription>
              Queda registrado aquí y el documento no se podrá pasar a Compras. Ingresa el mismo reclamo en sii.cl antes de que venza el plazo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-reason">Motivo</Label>
              <select id="claim-reason" className={nativeSelectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                {CLAIM_REASONS.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-detail">Detalle</Label>
              <textarea id="claim-detail" className={textareaClass} rows={3} maxLength={400} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Qué no corresponde: precio, cantidades, mercadería no recibida…" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setClaiming(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={submitClaim}>{busy ? 'Guardando…' : 'Registrar reclamo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
