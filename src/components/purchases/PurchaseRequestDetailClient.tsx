'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, FilePlus2, Pencil, Send, ShoppingCart, Trash2, Trophy, X } from 'lucide-react';
import type { Contact } from '@prisma/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import {
  cancelPurchaseRequestAction,
  decidePurchaseRequestAction,
  deleteSupplierQuoteAction,
  generatePurchaseOrdersAction,
  saveSupplierQuoteAction,
  submitPurchaseRequestAction,
} from '@/modules/purchases/actions/purchase-request.actions';
import { PURCHASE_REQUEST_STATUS_LABELS } from '@/modules/purchases/schema';
import type { PurchaseRequestDetail } from '@/modules/purchases/services/purchase-request.service';
import { REQUEST_STATUS_TONE } from './PurchaseRequestsClient';

type Quote = PurchaseRequestDetail['quotes'][number];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

interface Props {
  request: PurchaseRequestDetail;
  currentUserId: string;
  canApprove: boolean;
  canQuote: boolean;
  canManage: boolean;
}

export default function PurchaseRequestDetailClient({ request, currentUserId, canApprove, canQuote, canManage }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [quoteDialog, setQuoteDialog] = useState<{ quote: Quote | null } | null>(null);
  const [award, setAward] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.comparison.rows.filter((row) => row.bestQuoteId).map((row) => [row.item.id, row.bestQuoteId as string]))
  );
  const [expectedDate, setExpectedDate] = useState('');

  const isOwnRequest = request.requestedById === currentUserId;
  const canEditOwn = (isOwnRequest || canManage) && (request.status === 'DRAFT' || request.status === 'REJECTED');
  const quotingOpen = canQuote && (request.status === 'SUBMITTED' || request.status === 'APPROVED');
  const canAward = canQuote && request.status === 'APPROVED' && request.quotes.length > 0;
  const showCosts = request.items.some((item) => item.estimatedUnitCost !== null);
  const quoteNames = useMemo(() => new Map(request.quotes.map((quote) => [quote.id, quote.supplierName])), [request.quotes]);

  const awardSummary = useMemo(() => {
    const perQuote = new Map<string, number>();
    let total = 0;
    for (const row of request.comparison.rows) {
      const quoteId = award[row.item.id];
      const cell = quoteId ? row.cells[quoteId] : undefined;
      if (!quoteId || !cell) continue;
      total += cell.lineTotal;
      perQuote.set(quoteId, (perQuote.get(quoteId) ?? 0) + cell.lineTotal);
    }
    return { total, suppliers: perQuote.size, items: Object.values(award).filter(Boolean).length };
  }, [award, request.comparison.rows]);

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>, after?: () => void) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      if (result.message) toast.success(result.message);
      after?.();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function awardAllTo(quoteId: string | 'BEST') {
    setAward(
      Object.fromEntries(
        request.comparison.rows
          .map((row) => [row.item.id, quoteId === 'BEST' ? row.bestQuoteId : row.cells[quoteId] ? quoteId : null] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
      )
    );
  }

  async function generate() {
    const ok = await confirm({
      title: `¿Generar ${awardSummary.suppliers} orden${awardSummary.suppliers === 1 ? '' : 'es'} de compra?`,
      description: `Se crean por ${formatCurrency(awardSummary.total)} neto, una por proveedor adjudicado. Los ítems sin adjudicar no se compran.`,
      confirmLabel: 'Generar OC',
      destructive: false,
    });
    if (!ok) return;
    const cleanAward = Object.fromEntries(Object.entries(award).filter(([, value]) => Boolean(value)));
    await run(() => generatePurchaseOrdersAction(request.id, { award: cleanAward, expectedDate }));
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canEditOwn && (
        <Link href={`/dashboard/purchase-requests/${request.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil className="size-4" aria-hidden="true" /> Editar
        </Link>
      )}
      {canEditOwn && (
        <Button type="button" disabled={busy} onClick={() => run(() => submitPurchaseRequestAction(request.id))}>
          <Send className="size-4" aria-hidden="true" /> Enviar a aprobación
        </Button>
      )}
      {canApprove && request.status === 'SUBMITTED' && (
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
            <X className="size-4" aria-hidden="true" /> Rechazar
          </Button>
          <Button type="button" disabled={busy} onClick={() => run(() => decidePurchaseRequestAction(request.id, { approve: true }))}>
            <Check className="size-4" aria-hidden="true" /> Aprobar
          </Button>
        </>
      )}
      {(isOwnRequest || canManage) && !['ORDERED', 'CANCELLED'].includes(request.status) && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (await confirm({ title: '¿Anular la solicitud?', description: 'Deja de estar disponible para cotizar y generar órdenes de compra.', confirmLabel: 'Anular' })) {
              await run(() => cancelPurchaseRequestAction(request.id));
            }
          }}
        >
          Anular
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Link href="/dashboard/purchase-requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Solicitudes de compra
      </Link>
      <PageHeader
        eyebrow={`Solicitud N° ${request.folio} · ${request.requestedByName ?? 'Sin solicitante'} · ${formatDate(request.createdAt)}`}
        title={request.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={REQUEST_STATUS_TONE[request.status]}>{PURCHASE_REQUEST_STATUS_LABELS[request.status]}</StatusBadge>
            {request.neededBy && <span>Se necesita para el {formatDate(request.neededBy)}</span>}
            {request.decidedByName && request.status !== 'SUBMITTED' && <span>· {request.status === 'REJECTED' ? 'Rechazada' : 'Aprobada'} por {request.decidedByName}</span>}
          </span>
        }
        actions={actions}
      />

      {request.status === 'REJECTED' && request.rejectionReason && (
        <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Motivo del rechazo:</strong> {request.rejectionReason}. Edítala y vuelve a enviarla si corresponde.
        </p>
      )}
      {request.notes && <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{request.notes}</p>}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Ítems solicitados">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Ítems solicitados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Ítem</th>
                <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                {showCosts && <th className="px-4 py-2 text-right font-medium">Costo de referencia</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {request.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    {item.description}
                    {item.productSku && <span className="ml-2 font-mono text-xs text-muted-foreground">{item.productSku}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {qty(item.quantity)} {item.unit ?? ''}
                  </td>
                  {showCosts && (
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                      {item.estimatedUnitCost !== null ? `${formatCurrency(item.estimatedUnitCost)} c/u` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(quotingOpen || request.quotes.length > 0) && (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Comparativo de cotizaciones">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Comparativo de cotizaciones</h2>
              <p className="text-xs text-muted-foreground">
                {request.quotes.length === 0
                  ? 'Carga los precios de cada proveedor: el mejor precio por ítem queda destacado.'
                  : request.status === 'SUBMITTED'
                    ? 'Puedes ir cotizando; las OC se generan cuando la solicitud esté aprobada.'
                    : 'Precio unitario neto por proveedor. El mejor de cada ítem queda destacado.'}
              </p>
            </div>
            {quotingOpen && (
              <Button type="button" variant="outline" onClick={() => setQuoteDialog({ quote: null })}>
                <FilePlus2 className="size-4" aria-hidden="true" /> Agregar cotización
              </Button>
            )}
          </div>

          {request.quotes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border align-bottom">
                    <th className="px-4 py-2 font-medium">Ítem</th>
                    {request.quotes.map((quote) => (
                      <th key={quote.id} className="min-w-[160px] px-4 py-2 font-medium">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground">{quote.supplierName}</p>
                            <p>
                              {quote.leadTimeDays !== null ? `${quote.leadTimeDays} días` : 'Plazo sin informar'}
                              {quote.validUntil ? ` · válida al ${formatDate(quote.validUntil)}` : ''}
                            </p>
                            {quote.paymentTerms && <p>{quote.paymentTerms}</p>}
                          </div>
                          {quotingOpen && (
                            <div className="flex shrink-0 gap-0.5">
                              <Button type="button" size="icon-xs" variant="ghost" aria-label={`Editar cotización de ${quote.supplierName}`} onClick={() => setQuoteDialog({ quote })}>
                                <Pencil aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Eliminar cotización de ${quote.supplierName}`}
                                onClick={async () => {
                                  if (await confirm({ title: `¿Eliminar la cotización de ${quote.supplierName}?`, confirmLabel: 'Eliminar' })) {
                                    await run(() => deleteSupplierQuoteAction(request.id, quote.id));
                                  }
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {request.comparison.rows.map((row) => (
                    <tr key={row.item.id}>
                      <td className="px-4 py-2">
                        <p className="font-medium">{row.item.description}</p>
                        <p className="text-xs text-muted-foreground">{qty(row.item.quantity)} unidades</p>
                      </td>
                      {request.quotes.map((quote) => {
                        const cell = row.cells[quote.id];
                        const chosen = award[row.item.id] === quote.id;
                        return (
                          <td key={quote.id} className={cn('px-4 py-2', cell?.isBest && 'bg-success-soft/60')}>
                            {cell ? (
                              <label className={cn('flex items-start gap-2', canAward && 'cursor-pointer')}>
                                {canAward && (
                                  <input
                                    type="radio"
                                    name={`award-${row.item.id}`}
                                    className="mt-1 accent-[var(--primary)]"
                                    checked={chosen}
                                    onChange={() => setAward((current) => ({ ...current, [row.item.id]: quote.id }))}
                                    aria-label={`Adjudicar a ${quote.supplierName}`}
                                  />
                                )}
                                <span>
                                  <span className={cn('font-medium tabular-nums', cell.isBest && 'text-success')}>{formatCurrency(cell.unitCost)}</span>
                                  {cell.isBest && <Trophy className="ml-1 inline size-3.5 text-success" aria-label="Mejor precio" />}
                                  <span className="block text-xs text-muted-foreground tabular-nums">{formatCurrency(cell.lineTotal)}</span>
                                </span>
                              </label>
                            ) : (
                              <span className="text-xs text-muted-foreground">No cotizó</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {canAward && (
                    <tr>
                      <td className="px-4 py-2 text-xs text-muted-foreground">No comprar</td>
                      <td colSpan={request.quotes.length} className="px-4 py-2 text-xs text-muted-foreground">
                        Para dejar un ítem fuera, desmárcalo:{' '}
                        {request.comparison.rows
                          .filter((row) => award[row.item.id])
                          .map((row) => (
                            <button
                              key={row.item.id}
                              type="button"
                              className="mr-2 underline-offset-2 hover:underline"
                              onClick={() => setAward((current) => ({ ...current, [row.item.id]: '' }))}
                            >
                              {row.item.description} ✕
                            </button>
                          ))}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 text-sm">
                    <td className="px-4 py-2 font-medium">Total cotizado</td>
                    {request.comparison.totals.map((total) => (
                      <td key={total.quoteId} className="px-4 py-2">
                        <p className={cn('font-semibold tabular-nums', total.quoteId === request.comparison.bestSingleQuoteId && 'text-success')}>{formatCurrency(total.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          {total.itemsQuoted}/{request.items.length} ítems · {total.bestCount} al mejor precio
                        </p>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {canAward && (
            <div className="flex flex-col gap-3 border-t border-border p-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2 text-sm">
                <p>
                  Adjudicado: <strong className="tabular-nums">{formatCurrency(awardSummary.total)}</strong> neto · {awardSummary.items} de {request.items.length} ítems ·{' '}
                  {awardSummary.suppliers} proveedor{awardSummary.suppliers === 1 ? '' : 'es'}
                </p>
                {request.comparison.bestSingleQuoteId && request.comparison.bestSplitTotal < (request.comparison.totals.find((total) => total.quoteId === request.comparison.bestSingleQuoteId)?.total ?? 0) && (
                  <p className="text-xs text-muted-foreground">
                    Repartir por mejor precio ahorra{' '}
                    {formatCurrency((request.comparison.totals.find((total) => total.quoteId === request.comparison.bestSingleQuoteId)?.total ?? 0) - request.comparison.bestSplitTotal)} frente a comprarle todo a{' '}
                    {quoteNames.get(request.comparison.bestSingleQuoteId)}.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => awardAllTo('BEST')}>
                    <Trophy className="size-3.5" aria-hidden="true" /> Mejor precio por ítem
                  </Button>
                  {request.quotes.map((quote) => (
                    <Button key={quote.id} type="button" size="sm" variant="ghost" onClick={() => awardAllTo(quote.id)}>
                      Todo a {quote.supplierName}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="po-expected">Entrega esperada</Label>
                  <Input id="po-expected" type="date" className="w-40" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                </div>
                <Button type="button" disabled={busy || awardSummary.items === 0} onClick={generate}>
                  <ShoppingCart className="size-4" aria-hidden="true" /> Generar {awardSummary.suppliers || ''} OC
                </Button>
              </div>
            </div>
          )}
          {request.status === 'SUBMITTED' && request.quotes.length > 0 && (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Falta la aprobación para generar las órdenes de compra.</p>
          )}
        </section>
      )}

      {request.orders.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Órdenes de compra generadas">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Órdenes de compra generadas</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            {request.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/dashboard/purchases/orders/${order.id}`} className="font-medium hover:underline">
                  OC N° {order.folio} · {order.supplierName}
                </Link>
                <span className="tabular-nums">{formatCurrency(order.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={rejecting} onOpenChange={(open) => !busy && setRejecting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud N° {request.folio}</DialogTitle>
            <DialogDescription>Quien la pidió verá el motivo y podrá corregirla y enviarla de nuevo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Motivo</Label>
            <textarea id="reject-reason" className={textareaClass} rows={3} maxLength={500} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejecting(false)}>Cancelar</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !rejectReason.trim()}
              onClick={() => run(() => decidePurchaseRequestAction(request.id, { approve: false, reason: rejectReason }), () => setRejecting(false))}
            >
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quoteDialog && (
        <QuoteDialog
          request={request}
          quote={quoteDialog.quote}
          onClose={() => setQuoteDialog(null)}
          onSaved={() => {
            setQuoteDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function QuoteDialog({ request, quote, onClose, onSaved }: { request: PurchaseRequestDetail; quote: Quote | null; onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState(quote?.contactId ?? '');
  const [quoteNumber, setQuoteNumber] = useState(quote?.quoteNumber ?? '');
  const [validUntil, setValidUntil] = useState(quote?.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : '');
  const [leadTime, setLeadTime] = useState(quote?.leadTimeDays !== null && quote?.leadTimeDays !== undefined ? String(quote.leadTimeDays) : '');
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTerms ?? '');
  const [notes, setNotes] = useState(quote?.notes ?? '');
  // 0 = no cotizó ese ítem (un precio cero no es una oferta real).
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(request.items.map((item) => [item.id, quote?.prices[item.id] ?? 0]))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((result) => {
      if (result.success) setSuppliers(result.data.filter((contact) => contact.isSupplier));
    });
  }, []);

  const taken = new Set(request.quotes.filter((existing) => existing.id !== quote?.id).map((existing) => existing.contactId));

  async function save() {
    setSaving(true);
    try {
      const lines = Object.entries(prices)
        .filter(([, unitCost]) => unitCost > 0)
        .map(([requestItemId, unitCost]) => ({ requestItemId, unitCost }));
      const result = await saveSupplierQuoteAction(request.id, {
        contactId,
        quoteNumber: quoteNumber.trim() || undefined,
        validUntil,
        leadTimeDays: leadTime.trim() === '' ? null : Number(leadTime),
        paymentTerms: paymentTerms.trim() || undefined,
        notes: notes.trim() || undefined,
        lines,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cotización guardada');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{quote ? `Cotización de ${quote.supplierName}` : 'Agregar cotización'}</DialogTitle>
          <DialogDescription>Precio unitario neto (sin IVA) por ítem. Deja en blanco lo que el proveedor no cotizó.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="quote-supplier">Proveedor</Label>
              <select id="quote-supplier" className={nativeSelectClass} value={contactId} disabled={Boolean(quote)} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Selecciona…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id} disabled={taken.has(supplier.id)}>
                    {supplier.razonSocial} · {supplier.rut}
                    {taken.has(supplier.id) ? ' (ya cotizó)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-number">N° de cotización</Label>
              <Input id="quote-number" value={quoteNumber} maxLength={40} onChange={(e) => setQuoteNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-valid">Válida hasta</Label>
              <Input id="quote-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-lead">Plazo de entrega (días)</Label>
              <Input id="quote-lead" inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-terms">Condición de pago</Label>
              <Input id="quote-terms" value={paymentTerms} maxLength={80} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ej: 30 días" />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 font-medium">Ítem</th>
                <th className="w-40 py-2 font-medium">Precio unitario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {request.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">
                    {item.description}
                    <span className="block text-xs text-muted-foreground">{qty(item.quantity)} {item.unit ?? 'unidades'}</span>
                  </td>
                  <td className="py-2">
                    <CurrencyInput
                      aria-label={`Precio de ${item.description}`}
                      value={prices[item.id] ?? 0}
                      onChange={(value) => setPrices((current) => ({ ...current, [item.id]: value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1.5">
            <Label htmlFor="quote-notes">Notas</Label>
            <textarea id="quote-notes" className={textareaClass} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || !contactId} onClick={save}>{saving ? 'Guardando…' : 'Guardar cotización'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
