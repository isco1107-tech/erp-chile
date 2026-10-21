'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Ban,
  Calculator,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-provider';
import PosTicket, { type TicketData } from './PosTicket';
import {
  cancelPosSaleAction,
  closeShiftAction,
  createPosCreditNoteAction,
  getPosTicketAction,
  getShiftSummaryAction,
  listCashMovementsAction,
  listShiftSalesAction,
  registerCashMovementAction,
} from '@/modules/pos/actions/pos.actions';
import type { ShiftSummary } from '@/modules/pos/services/cash.service';
import type { PosSaleListItem } from '@/modules/pos/services/pos.service';
import { CHILE_CASH_DENOMINATIONS, sumCashDenominations } from '@/modules/pos/calc';
import { POS_DTE_SHORT_LABELS, POS_PAYMENT_METHOD_LABELS, type PosPaymentMethod } from '@/modules/pos/schema';
import type { CashMovement } from '@prisma/client';
import { formatCurrency } from '@/lib/chile/tax';

interface Props {
  shiftId: string;
  cashierName: string;
  cashRegisterName: string;
  openedAt: string;
  canClose: boolean;
}

export default function CashPanel(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();

  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [sales, setSales] = useState<PosSaleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [movementType, setMovementType] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  const [actualAmount, setActualAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closing, setClosing] = useState(false);

  // Contador de billetes y monedas chilenas para arqueo de caja
  const [showDenominationCounter, setShowDenominationCounter] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});

  // Ticket para reimpresión 80mm
  const [reprintTicket, setReprintTicket] = useState<TicketData | null>(null);
  const [loadingTicketId, setLoadingTicketId] = useState<string | null>(null);

  // Modal de Devolución / Nota de Crédito (61)
  const [creditNoteSale, setCreditNoteSale] = useState<PosSaleListItem | null>(null);
  const [creditNoteReason, setCreditNoteReason] = useState('Devolución de mercadería en caja');
  const [refundFromDrawer, setRefundFromDrawer] = useState(true);
  const [creditQuantities, setCreditQuantities] = useState<Record<string, number>>({});
  const [submittingCreditNote, setSubmittingCreditNote] = useState(false);

  // Modal de Anulación directa
  const [cancellingSale, setCancellingSale] = useState<PosSaleListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [summaryResult, movementsResult, salesResult] = await Promise.all([
      getShiftSummaryAction(props.shiftId),
      listCashMovementsAction(props.shiftId),
      listShiftSalesAction(props.shiftId),
    ]);
    if (summaryResult.success) setSummary(summaryResult.data);
    else toast.error(summaryResult.error);
    if (movementsResult.success) setMovements(movementsResult.data);
    if (salesResult.success) setSales(salesResult.data);
    setLoading(false);
  }, [props.shiftId]);

  useEffect(() => {
    load();
  }, [load]);

  function updateDenomCount(denomValue: number, rawCount: string) {
    const next = { ...denomCounts, [denomValue]: rawCount };
    setDenomCounts(next);
    const numericMap: Record<number, number> = {};
    for (const [k, v] of Object.entries(next)) {
      numericMap[Number(k)] = Math.max(0, Math.floor(Number(v) || 0));
    }
    const totalCounted = sumCashDenominations(numericMap);
    setActualAmount(String(totalCounted));
  }

  async function handleMovement() {
    const amount = Number(movementAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('El monto debe ser un entero mayor a cero');
      return;
    }
    if (movementReason.trim().length < 3) {
      toast.error('Indique el motivo del movimiento');
      return;
    }

    const result = await registerCashMovementAction(props.shiftId, {
      type: movementType,
      amount,
      reason: movementReason.trim(),
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Movimiento registrado');
    setMovementAmount('');
    setMovementReason('');
    load();
  }

  async function handleClose() {
    const counted = Number(actualAmount);
    if (actualAmount.trim() === '' || !Number.isInteger(counted) || counted < 0) {
      toast.error('Ingrese el efectivo contado (entero, mayor o igual a cero)');
      return;
    }
    if (!summary) return;

    const difference = counted - summary.expectedAmount;
    const confirmMessage =
      difference === 0
        ? '¿Cerrar la caja? El arqueo cuadra exactamente.'
        : `El arqueo tiene un descuadre de ${formatCurrency(Math.abs(difference))} (${difference > 0 ? 'sobrante' : 'faltante'}). Quedará registrado en la bitácora y contabilidad. ¿Cerrar de todos modos?`;
    if (!(await confirm(confirmMessage))) return;

    setClosing(true);
    try {
      const result = await closeShiftAction(props.shiftId, { actualAmount: counted, closingNotes });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Caja cerrada');
      router.refresh();
    } finally {
      setClosing(false);
    }
  }

  async function handleReprint(documentId: string) {
    setLoadingTicketId(documentId);
    try {
      const res = await getPosTicketAction(documentId);
      if (!res.success || !res.data) {
        toast.error(res.success ? 'Comprobante no encontrado' : res.error);
        return;
      }
      const doc = res.data;
      const address = [doc.company.address, doc.company.comuna].filter(Boolean).join(', ') || null;
      setReprintTicket({
        dteType: doc.dteType,
        companyName: doc.company.businessName,
        companyRut: doc.company.rut,
        companyGiro: doc.company.giro,
        companyAddress: address,
        folio: doc.folio,
        issuedAt: new Date(doc.issueDate),
        cashRegisterName: props.cashRegisterName,
        cashierName: props.cashierName,
        customerName: doc.contact.razonSocial,
        customerRut: doc.contact.rut,
        customerGiro: doc.contact.giro,
        customerAddress: doc.contact.address,
        customerComuna: doc.contact.comuna,
        referenceLabel: doc.referenceType ? (POS_DTE_SHORT_LABELS[doc.referenceType] ?? doc.referenceType) : null,
        referenceFolio: doc.referenceFolio,
        lines: doc.items.map((item) => ({
          description: item.description,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          total: item.total,
          discountPercent: item.discountPercent,
          isExempt: item.isExempt,
        })),
        netAmount: doc.netAmount,
        exemptAmount: doc.exemptAmount,
        ivaAmount: doc.ivaAmount,
        totalAmount: doc.totalAmount,
        paymentMethodLabel:
          POS_PAYMENT_METHOD_LABELS[doc.paymentMethod as PosPaymentMethod] ?? doc.paymentMethod,
        timbrePdf417: doc.timbrePdf417 ?? null,
      });
    } finally {
      setLoadingTicketId(null);
    }
  }

  function printLoadedTicket() {
    document.documentElement.classList.add('pos-printing');
    window.print();
    document.documentElement.classList.remove('pos-printing');
  }

  function openCreditNoteModal(sale: PosSaleListItem) {
    setCreditNoteSale(sale);
    setCreditNoteReason('Devolución de productos en caja');
    setRefundFromDrawer(sale.paymentMethod === 'EFECTIVO');
    const initialQty: Record<string, number> = {};
    for (const item of sale.items) {
      if (item.productId) {
        initialQty[item.productId] = (initialQty[item.productId] ?? 0) + item.quantity;
      }
    }
    setCreditQuantities(initialQty);
  }

  async function submitCreditNote() {
    if (!creditNoteSale) return;
    if (creditNoteReason.trim().length < 3) {
      toast.error('Ingresa el motivo de la Nota de Crédito');
      return;
    }

    const itemsPayload = Object.entries(creditQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (itemsPayload.length === 0) {
      toast.error('Selecciona al menos un producto con cantidad mayor a cero para devolver');
      return;
    }

    setSubmittingCreditNote(true);
    try {
      const res = await createPosCreditNoteAction(props.shiftId, {
        originalDocumentId: creditNoteSale.id,
        reason: creditNoteReason.trim(),
        refundCashFromDrawer: refundFromDrawer,
        items: itemsPayload,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? `Nota de Crédito #${res.data.folio} emitida`);
      const ncId = res.data.id;
      setCreditNoteSale(null);
      await load();
      await handleReprint(ncId);
    } finally {
      setSubmittingCreditNote(false);
    }
  }

  async function submitCancelSale() {
    if (!cancellingSale) return;
    if (cancelReason.trim().length < 3) {
      toast.error('Indica el motivo de la anulación');
      return;
    }
    setSubmittingCancel(true);
    try {
      const res = await cancelPosSaleAction(props.shiftId, cancellingSale.id, cancelReason.trim());
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Venta anulada');
      setCancellingSale(null);
      setCancelReason('');
      await load();
    } finally {
      setSubmittingCancel(false);
    }
  }

  const counted = Number(actualAmount);
  const liveDifference = summary && actualAmount.trim() !== '' ? counted - summary.expectedAmount : null;

  if (loading || !summary) {
    return <p className="text-sm text-muted-foreground">Cargando arqueo…</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold">Resumen del turno</h2>
          <p className="text-xs text-muted-foreground">
            {props.cashRegisterName} · {props.cashierName} · abierto{' '}
            {new Date(props.openedAt).toLocaleString('es-CL')}
          </p>

          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-1 font-medium">Medio de pago</th>
                <th className="pb-1 font-medium">Documentos</th>
                <th className="pb-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byPaymentMethod.length === 0 && (
                <tr>
                  <td className="py-3 text-center text-muted-foreground" colSpan={3}>
                    Sin ventas en este turno
                  </td>
                </tr>
              )}
              {summary.byPaymentMethod.map((row) => (
                <tr key={row.method} className="border-t border-border">
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5">{row.documentCount}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5">Total vendido</td>
                <td className="py-1.5">{summary.documentCount}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(summary.salesTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Efectivo esperado en el cajón</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Fondo inicial</dt>
              <dd className="tabular-nums">{formatCurrency(summary.initialAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Ventas en efectivo</dt>
              <dd className="tabular-nums">{formatCurrency(summary.cashSales)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Ingresos manuales</dt>
              <dd className="tabular-nums">{formatCurrency(summary.inflows)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">− Retiros y devoluciones en efectivo</dt>
              <dd className="tabular-nums">{formatCurrency(summary.outflows)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt>Esperado en gaveta</dt>
              <dd className="tabular-nums">{formatCurrency(summary.expectedAmount)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Débito, crédito y transferencia no entran al cajón: se concilian con el banco, no con el arqueo.
          </p>
          {summary.cancelledCount > 0 && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
              {summary.cancelledCount} documento(s) anulado(s) por {formatCurrency(summary.cancelledTotal)}, de los
              cuales {formatCurrency(summary.cancelledCashTotal)} eran en efectivo.{' '}
              <strong>Ya están descontados del esperado</strong>: no registres además un retiro por ese monto o la
              caja quedará con un sobrante falso.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Movimiento de efectivo (Retiro a bóveda / Sencillo)</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={movementType === 'INFLOW' ? 'default' : 'outline'}
              onClick={() => setMovementType('INFLOW')}
            >
              <ArrowDownCircle className="mr-1 size-4" /> Ingreso
            </Button>
            <Button
              type="button"
              size="sm"
              variant={movementType === 'OUTFLOW' ? 'default' : 'outline'}
              onClick={() => setMovementType('OUTFLOW')}
            >
              <ArrowUpCircle className="mr-1 size-4" /> Retiro
            </Button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <div>
              <Label htmlFor="mov-amount">Monto</Label>
              <Input
                id="mov-amount"
                type="number"
                min={1}
                step={1}
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mov-reason">Motivo</Label>
              <Input
                id="mov-reason"
                placeholder="Ej: retiro parcial a bóveda, ingreso de sencillo"
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={handleMovement}>
                Registrar
              </Button>
            </div>
          </div>

          {movements.length > 0 && (
            <ul className="mt-3 divide-y divide-border text-sm">
              {movements.map((movement) => (
                <li key={movement.id} className="flex items-center justify-between py-1.5">
                  <span>
                    <span className={movement.type === 'INFLOW' ? 'text-success font-medium' : 'text-destructive font-medium'}>
                      {movement.type === 'INFLOW' ? '+' : '−'}
                      {formatCurrency(movement.amount)}
                    </span>
                    <span className="ml-2 text-muted-foreground">{movement.reason}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(movement.createdAt).toLocaleTimeString('es-CL')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cerrar caja y arquear</h2>
            {props.canClose && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setShowDenominationCounter((v) => !v)}
              >
                <Calculator className="mr-1 size-3.5" />
                {showDenominationCounter ? 'Ocultar contador de billetes' : 'Contar billetes y monedas'}
              </Button>
            )}
          </div>

          {!props.canClose ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
              Tu rol no puede cerrar la caja. Avisa a un Administrador o Supervisor para que haga el arqueo.
            </p>
          ) : (
            <div className="space-y-3">
              {showDenominationCounter && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Banknote className="size-3.5" /> Contador por denominación (CLP)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDenomCounts({});
                        setActualAmount('0');
                      }}
                      className="text-xs underline hover:text-foreground"
                    >
                      Limpiar conteo
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CHILE_CASH_DENOMINATIONS.map((denom) => (
                      <div key={denom.value} className="rounded-lg border border-border bg-card p-2">
                        <Label htmlFor={`denom-${denom.value}`} className="text-xs font-semibold">
                          {denom.label}
                        </Label>
                        <input
                          id={`denom-${denom.value}`}
                          type="number"
                          min={0}
                          step={1}
                          placeholder="0"
                          value={denomCounts[denom.value] ?? ''}
                          onChange={(e) => updateDenomCount(denom.value, e.target.value)}
                          className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-sm tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="actual">Efectivo contado en el cajón</Label>
                <Input
                  id="actual"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Cuenta el dinero antes de escribirlo"
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                  className="h-12 text-lg tabular-nums"
                />
              </div>

              {liveDifference !== null && (
                <div
                  className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${
                    liveDifference === 0
                      ? 'bg-success-soft text-success'
                      : liveDifference > 0
                        ? 'bg-info-soft text-info'
                        : 'bg-danger-soft text-danger'
                  }`}
                >
                  <span className="text-sm font-medium">
                    {liveDifference === 0 ? 'Cuadra exacto' : liveDifference > 0 ? 'Sobrante' : 'Faltante'}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(Math.abs(liveDifference))}
                  </span>
                </div>
              )}

              <div>
                <Label htmlFor="closing-notes">Observaciones del cierre</Label>
                <Input
                  id="closing-notes"
                  placeholder="Explica el descuadre si lo hay"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>

              <Button type="button" className="h-11 w-full" disabled={closing} onClick={handleClose}>
                {closing ? 'Cerrando…' : 'Cerrar caja'}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">
            Ventas del turno ({sales.length}) — Reimpresión, Devoluciones y Anulación
          </h2>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-1 font-medium">Doc / Folio</th>
                  <th className="pb-1 font-medium">Hora</th>
                  <th className="pb-1 font-medium">Pago</th>
                  <th className="pb-1 text-right font-medium">Total</th>
                  <th className="pb-1 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={5}>
                      Sin ventas todavía en este turno
                    </td>
                  </tr>
                )}
                {sales.map((sale) => {
                  const isCancelled = sale.status === 'CANCELLED';
                  const dteShort = POS_DTE_SHORT_LABELS[sale.dteType] ?? sale.dteType;
                  return (
                    <tr key={sale.id} className="border-t border-border">
                      <td className="py-2">
                        <span className="font-medium">
                          {dteShort} #{sale.folio}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {sale.contact.razonSocial}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(sale.createdAt).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 text-xs">
                        {POS_PAYMENT_METHOD_LABELS[sale.paymentMethod as PosPaymentMethod] ?? sale.paymentMethod}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {isCancelled ? (
                          <span className="text-muted-foreground line-through">
                            {formatCurrency(sale.totalAmount)}
                          </span>
                        ) : (
                          formatCurrency(sale.totalAmount)
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={loadingTicketId === sale.id}
                            onClick={() => void handleReprint(sale.id)}
                            title="Ver / Reimprimir ticket 80mm"
                          >
                            <Printer className="size-3.5" />
                          </Button>
                          {!isCancelled && (
                            <>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => openCreditNoteModal(sale)}
                                title="Emitir Nota de Crédito (Devolución)"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setCancellingSale(sale);
                                  setCancelReason('');
                                }}
                                title="Anular venta"
                              >
                                <Ban className="size-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Vista Previa / Reimpresión Ticket 80mm */}
      {reprintTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Reimprimir ticket 80mm"
        >
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Comprobante 80mm (#{reprintTicket.folio})</h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => setReprintTicket(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <PosTicket data={reprintTicket} preview />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReprintTicket(null)}>
                Cerrar
              </Button>
              <Button type="button" onClick={printLoadedTicket}>
                <Printer className="mr-2 size-4" /> Imprimir 80mm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Emitir Devolución / Nota de Crédito Electrónica (Tipo 61) */}
      {creditNoteSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Emitir Nota de Crédito"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  Devolución / Nota de Crédito (Ref. #{creditNoteSale.folio})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Emite una Nota de Crédito Electrónica (61) oficial, reingresa el stock al Kardex y ajusta contabilidad.
                </p>
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setCreditNoteSale(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                Cantidades a devolver a bodega
              </p>
              {creditNoteSale.items.map((item) => {
                if (!item.productId) return null;
                const currentQty = creditQuantities[item.productId] ?? 0;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Vendido: {item.quantity} · Total línea: {formatCurrency(item.total)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      step="any"
                      value={currentQty}
                      onChange={(e) =>
                        setCreditQuantities((prev) => ({
                          ...prev,
                          [item.productId!]: Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0)),
                        }))
                      }
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-right text-sm tabular-nums"
                    />
                  </div>
                );
              })}
            </div>

            <div>
              <Label htmlFor="nc-reason">Motivo de la devolución</Label>
              <Input
                id="nc-reason"
                value={creditNoteReason}
                onChange={(e) => setCreditNoteReason(e.target.value)}
                placeholder="Ej: Devolución de producto por cambio o desistimiento"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={refundFromDrawer}
                onChange={(e) => setRefundFromDrawer(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Se entregó el dinero en efectivo desde el cajón de esta caja (registra egreso en el arqueo)
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreditNoteSale(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={submittingCreditNote} onClick={() => void submitCreditNote()}>
                {submittingCreditNote ? 'Emitiendo NC…' : 'Emitir Nota de Crédito (61)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Anular Venta del Turno */}
      {cancellingSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Anular venta"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Anular documento #{cancellingSale.folio}</h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => setCancellingSale(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anulará el documento por {formatCurrency(cancellingSale.totalAmount)}, repondrá el stock en bodega y reversará el cobro y asiento contable.
            </p>
            <div>
              <Label htmlFor="cancel-reason">Motivo de la anulación</Label>
              <Input
                id="cancel-reason"
                autoFocus
                placeholder="Ej: Error de digitación en cobro"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancellingSale(null)}>
                Volver
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={submittingCancel}
                onClick={() => void submitCancelSale()}
              >
                {submittingCancel ? 'Anulando…' : 'Confirmar anulación'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket oculto para @media print cuando se reimprime desde el panel de arqueo */}
      {reprintTicket && <PosTicket data={reprintTicket} />}
    </div>
  );
}
