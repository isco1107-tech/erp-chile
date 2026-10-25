'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  closeShiftAction,
  getShiftSummaryAction,
  listCashMovementsAction,
  listShiftSalesAction,
  registerCashMovementAction,
} from '@/modules/pos/actions/pos.actions';
import type { ShiftSummary } from '@/modules/pos/services/cash.service';
import type { PosSaleListItem } from '@/modules/pos/services/pos.service';
import type { CashMovement } from '@prisma/client';
import { formatCurrency } from '@/lib/chile/tax';
import { createIdempotencyTracker } from '@/lib/idempotency';
import CashShiftReceipt from './CashShiftReceipt';
import { usePosHardware } from './hardware/PosHardwareProvider';
import { POS_PAYMENT_METHOD_LABELS, type PosPaymentMethod } from '@/modules/pos/schema';

import { useConfirm } from '@/components/ui/confirm-provider';
interface Props {
  shiftId: string;
  cashierName: string;
  cashRegisterName: string;
  openedAt: string;
  canClose: boolean;
  canOperate?: boolean;
  active?: boolean;
  onClosed?: () => void;
  onPendingChange?: (value: boolean) => void;
  closedShift?: {
    actualAmount: number | null;
    expectedAmount: number | null;
    difference: number | null;
    closedAt: string | null;
    closingNotes: string | null;
  };
}

/**
 * Arqueo del turno: resumen por medio de pago, movimientos de efectivo y cierre.
 *
 * El monto esperado se muestra pero no se puede editar, y el cierre lo recalcula
 * en el servidor: si el cajero pudiera declararlo, un descuadre siempre daría
 * cero y el arqueo no controlaría nada.
 */
export default function CashPanel(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const hardware = usePosHardware();

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
  const [moving, setMoving] = useState(false);
  const [uncertainMovement, setUncertainMovement] = useState(false);
  const movementPending = useRef(false);
  const { onPendingChange } = props;
  useEffect(() => { onPendingChange?.(moving || closing || uncertainMovement); }, [moving, closing, uncertainMovement, onPendingChange]);
  useEffect(() => {
    if (!uncertainMovement) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [uncertainMovement]);
  const [loadError, setLoadError] = useState(false);
  const operationInFlight = useRef(false);
  const movementIdempotency = useRef(createIdempotencyTracker());
  const isClosed = Boolean(props.closedShift);
  const canOperate = props.canOperate !== false && !isClosed;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [summaryResult, movementsResult, salesResult] = await Promise.all([
        getShiftSummaryAction(props.shiftId),
        listCashMovementsAction(props.shiftId),
        listShiftSalesAction(props.shiftId),
      ]);
      if (!summaryResult.success) throw new Error(summaryResult.error);
      if (!movementsResult.success) throw new Error(movementsResult.error);
      if (!salesResult.success) throw new Error(salesResult.error);
      setSummary(summaryResult.data);
      setMovements(movementsResult.data);
      setSales(salesResult.data);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el arqueo. Revisa la conexión y actualiza.');
    } finally {
      setLoading(false);
    }
  }, [props.shiftId]);

  useEffect(() => {
    if (props.active !== false) void load();
  }, [load, isClosed, props.active]);

  async function handleMovement() {
    if (operationInFlight.current || (!canOperate && !movementPending.current)) return;
    const amount = Number(movementAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast.error('El monto debe ser un entero mayor a cero');
      return;
    }
    if (movementReason.trim().length < 3) {
      toast.error('Indique el motivo del movimiento');
      return;
    }
    operationInFlight.current = true;
    setMoving(true);
    const payload = { type: movementType, amount, reason: movementReason.trim() };
    try {
      const result = await registerCashMovementAction(props.shiftId, {
        ...payload,
        idempotencyKey: movementIdempotency.current.keyFor({ shiftId: props.shiftId, ...payload }),
      });
      if (!result.success) { movementPending.current = false; setUncertainMovement(false); toast.error(result.error); return; }
      movementPending.current = false;
      setUncertainMovement(false);
      movementIdempotency.current.reset();
      toast.success(result.message ?? 'Movimiento registrado');
      setMovementAmount('');
      setMovementReason('');
      // El efectivo entra o sale del cajón: se abre para que el cajero lo mueva. Si falla, el movimiento ya quedó registrado.
      if (hardware.direct && hardware.config.openOnMovement) {
        void hardware.openDrawer().then((opened) => { if (!opened.ok) toast.error(`El movimiento quedó registrado, pero ${opened.error}`); });
      }
      await load();
    } catch {
      movementPending.current = true;
      setUncertainMovement(true);
      toast.error('No se pudo confirmar el movimiento. Reintenta el mismo movimiento para recuperar el resultado sin duplicarlo.');
    } finally {
      operationInFlight.current = false;
      setMoving(false);
    }
  }

  async function handleClose() {
    if (operationInFlight.current || movementPending.current || isClosed || !props.canClose) return;
    const counted = Number(actualAmount);
    if (actualAmount.trim() === '' || !Number.isSafeInteger(counted) || counted < 0) {
      toast.error('Ingrese el efectivo contado (entero, mayor o igual a cero)');
      return;
    }
    if (!summary || loadError) return;

    const difference = counted - summary.expectedAmount;
    if (difference !== 0 && closingNotes.trim().length < 3) {
      toast.error('Explica el sobrante o faltante en las observaciones del cierre');
      return;
    }
    operationInFlight.current = true;
    const confirmMessage =
      difference === 0
        ? '¿Cerrar la caja? El arqueo cuadra exactamente.'
        : `El arqueo tiene un descuadre de ${formatCurrency(Math.abs(difference))} (${difference > 0 ? 'sobrante' : 'faltante'}). Quedará registrado en la bitácora. ¿Cerrar de todos modos?`;
    if (!await confirm({ title: 'Cerrar el turno de caja', description: confirmMessage, confirmLabel: 'Cerrar caja', destructive: false })) {
      operationInFlight.current = false;
      return;
    }

    setClosing(true);
    try {
      const result = await closeShiftAction(props.shiftId, { actualAmount: counted, closingNotes });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result.data.summary);
      toast.success(result.message ?? 'Caja cerrada');
      props.onClosed?.();
      router.refresh();
    } catch {
      toast.error('No se pudo confirmar el cierre. Actualiza el historial para comprobar si se guardó antes de volver a intentarlo.');
    } finally {
      operationInFlight.current = false;
      setClosing(false);
    }
  }

  const counted = Number(actualAmount);
  const liveDifference = summary && actualAmount.trim() !== '' && Number.isSafeInteger(counted) ? counted - summary.expectedAmount : null;

  if (!summary) {
    return <div className="rounded-xl border border-border p-4" role="status">
      <p className="text-sm text-muted-foreground">{loading ? 'Cargando arqueo…' : 'No se pudo cargar el arqueo.'}</p>
      {!loading && <Button type="button" variant="outline" className="mt-2" onClick={() => void load()}>Volver a intentar</Button>}
    </div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" role="status">{loadError ? 'No se pudo actualizar. Actualiza el arqueo antes de continuar.' : loading ? 'Actualizando arqueo…' : isClosed ? 'Turno cerrado: datos de arqueo guardados.' : 'Arqueo de esta caja y este turno. Actualiza antes del conteo final.'}</p>
        <Button type="button" variant="outline" size="sm" disabled={loading || closing || moving} onClick={() => void load()}>
          <RefreshCw className={`mr-1 size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar arqueo
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Resumen del turno</h2>
          <p className="text-xs text-muted-foreground">
            {props.cashRegisterName} · {props.cashierName} · abierto {new Date(props.openedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
          </p>

          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-1 font-medium">Medio de pago</th>
                <th className="pb-1 font-medium">Boletas</th>
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
                  <td className="py-1.5 text-right">{formatCurrency(row.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5">Total vendido</td>
                <td className="py-1.5">{summary.documentCount}</td>
                <td className="py-1.5 text-right">{formatCurrency(summary.salesTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Efectivo esperado en el cajón</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Fondo inicial</dt>
              <dd>{formatCurrency(summary.initialAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Ventas en efectivo</dt>
              <dd>{formatCurrency(summary.cashSales)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Ingresos manuales</dt>
              <dd>{formatCurrency(summary.inflows)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">− Retiros</dt>
              <dd>{formatCurrency(summary.outflows)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
              <dt>Esperado</dt>
              <dd>{formatCurrency(summary.expectedAmount)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Débito, crédito y transferencia no entran al cajón: se concilian con el banco, no con el arqueo.
          </p>
          {summary.cancelledCount > 0 && (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning-soft p-2 text-xs text-warning">
              {summary.cancelledCount} boleta(s) anulada(s) por {formatCurrency(summary.cancelledTotal)}, de las
              cuales {formatCurrency(summary.cancelledCashTotal)} eran en efectivo.{' '}
              <strong>Ya están descontadas del esperado</strong>: no registres además un retiro por ese monto o la
              caja quedará con un sobrante falso.
            </p>
          )}
        </div>

        {uncertainMovement && <div role="alert" className="space-y-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          <p>Hay un movimiento pendiente de confirmación. No cambies sus datos ni cierres el turno hasta consultar el resultado.</p>
          <Button type="button" variant="outline" disabled={moving || closing} onClick={handleMovement}>{moving ? 'Confirmando…' : 'Confirmar el mismo movimiento'}</Button>
        </div>}
        {canOperate && <fieldset disabled={moving || closing || loading || loadError || uncertainMovement} className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Movimiento de efectivo</h2>
          <p className="mb-3 text-xs text-muted-foreground">Registra solo efectivo que entra o sale físicamente del cajón. Una venta ya queda registrada al cobrar. Si pagaste insumos, registra además el documento de gasto en el módulo correspondiente.</p>
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
                maxLength={200}
                placeholder="Ej: retiro a bóveda, compra de insumos"
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={handleMovement}>
                {moving ? 'Registrando…' : 'Registrar'}
              </Button>
            </div>
          </div>

        </fieldset>}

        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Bitácora de efectivo</h2>
          {movements.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Sin ingresos ni retiros manuales en este turno.</p>}
          {movements.length > 0 && (
            <ul className="mt-3 divide-y divide-border text-sm">
              {movements.map((movement) => (
                <li key={movement.id} className="flex items-start justify-between gap-3 py-2">
                  <span>
                    <span className={movement.type === 'INFLOW' ? 'text-success' : 'text-destructive'}>
                      {movement.type === 'INFLOW' ? '+' : '−'}
                      {formatCurrency(movement.amount)}
                    </span>
                    <span className="ml-2 break-words text-muted-foreground">{movement.reason}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(movement.createdAt).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">{isClosed ? 'Comprobante de cierre' : 'Cerrar caja'}</h2>
          {props.closedShift ? (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Efectivo esperado</dt><dd>{formatCurrency(props.closedShift.expectedAmount ?? summary.expectedAmount)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Efectivo contado</dt><dd>{formatCurrency(props.closedShift.actualAmount ?? 0)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold"><dt>Diferencia</dt><dd>{formatCurrency(props.closedShift.difference ?? 0)}</dd></div>
              </dl>
              {props.closedShift.closedAt && <p className="text-xs text-muted-foreground">Cerrado {new Date(props.closedShift.closedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>}
              {props.closedShift.closingNotes && <p className="break-words rounded-lg bg-muted p-3 text-sm">{props.closedShift.closingNotes}</p>}
              <CashShiftReceipt {...props} summary={summary} closedShift={props.closedShift} />
            </div>
          ) : !props.canClose ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              Este turno no está disponible para cierre desde esta vista. Consulta su estado en el historial o avisa al supervisor.
            </p>
          ) : (
            <fieldset disabled={closing || moving || loading || loadError || uncertainMovement} className="space-y-3">
              <p className="text-xs text-muted-foreground">Termina las ventas pendientes, cuenta el efectivo y declara lo que realmente hay. El sistema recalcula el esperado al cerrar.</p>
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
                  className="h-12 text-lg"
                />
              </div>

              {liveDifference !== null && (
                <div
                  className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${
                    liveDifference === 0
                      ? 'bg-success-soft text-success'
                      : liveDifference > 0
                        ? 'bg-info-soft text-info'
                        : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  <span className="text-sm font-medium">
                    {liveDifference === 0 ? 'Cuadra' : liveDifference > 0 ? 'Sobrante' : 'Faltante'}
                  </span>
                  <span className="text-2xl font-bold">{formatCurrency(Math.abs(liveDifference))}</span>
                </div>
              )}

              <div>
                <Label htmlFor="closing-notes">Observaciones del cierre</Label>
                <Input
                  id="closing-notes"
                  maxLength={500}
                  placeholder="Explica el descuadre si lo hay"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>

              <Button type="button" className="h-11 w-full" disabled={closing} onClick={handleClose}>
                {closing ? 'Cerrando...' : 'Cerrar caja'}
              </Button>
            </fieldset>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Ventas del turno ({sales.length})</h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-1 font-medium">Folio</th>
                  <th className="pb-1 font-medium">Hora</th>
                  <th className="pb-1 font-medium">Pago</th>
                  <th className="pb-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-muted-foreground" colSpan={4}>
                      Sin ventas todavía
                    </td>
                  </tr>
                )}
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-border">
                    <td className="py-1.5">#{sale.folio}</td>
                    <td className="py-1.5">{new Date(sale.createdAt).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' })}</td>
                    <td className="py-1.5">{POS_PAYMENT_METHOD_LABELS[sale.paymentMethod as PosPaymentMethod] ?? sale.paymentMethod}</td>
                    <td className="py-1.5 text-right">
                      {sale.status === 'CANCELLED' ? (
                        <span className="text-muted-foreground line-through">{formatCurrency(sale.totalAmount)}</span>
                      ) : (
                        formatCurrency(sale.totalAmount)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
