'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
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

interface Props {
  shiftId: string;
  cashierName: string;
  cashRegisterName: string;
  openedAt: string;
  canClose: boolean;
}

/**
 * Arqueo del turno: resumen por medio de pago, movimientos de efectivo y cierre.
 *
 * El monto esperado se muestra pero no se puede editar, y el cierre lo recalcula
 * en el servidor: si el cajero pudiera declararlo, un descuadre siempre daría
 * cero y el arqueo no controlaría nada.
 */
export default function CashPanel(props: Props) {
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
        : `El arqueo tiene un descuadre de ${formatCurrency(Math.abs(difference))} (${difference > 0 ? 'sobrante' : 'faltante'}). Quedará registrado en la bitácora. ¿Cerrar de todos modos?`;
    if (!confirm(confirmMessage)) return;

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

  const counted = Number(actualAmount);
  const liveDifference = summary && actualAmount.trim() !== '' ? counted - summary.expectedAmount : null;

  if (loading || !summary) {
    return <p className="text-sm text-muted-foreground">Cargando arqueo...</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Resumen del turno</h2>
          <p className="text-xs text-muted-foreground">
            {props.cashRegisterName} · {props.cashierName} · abierto {new Date(props.openedAt).toLocaleString('es-CL')}
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
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700">
              {summary.cancelledCount} boleta(s) anulada(s) por {formatCurrency(summary.cancelledTotal)}, de las
              cuales {formatCurrency(summary.cancelledCashTotal)} eran en efectivo.{' '}
              <strong>Ya están descontadas del esperado</strong>: no registres además un retiro por ese monto o la
              caja quedará con un sobrante falso.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Movimiento de efectivo</h2>
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
                placeholder="Ej: retiro a bóveda, compra de insumos"
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
                    <span className={movement.type === 'INFLOW' ? 'text-green-600' : 'text-destructive'}>
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
        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Cerrar caja</h2>
          {!props.canClose ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
              Tu rol no puede cerrar la caja. Avisa a un Administrador para que haga el arqueo.
            </p>
          ) : (
            <div className="space-y-3">
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
                      ? 'bg-green-600/10 text-green-700'
                      : liveDifference > 0
                        ? 'bg-blue-600/10 text-blue-700'
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
                  placeholder="Explica el descuadre si lo hay"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>

              <Button type="button" className="h-11 w-full" disabled={closing} onClick={handleClose}>
                {closing ? 'Cerrando...' : 'Cerrar caja'}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Ventas del turno ({sales.length})</h2>
          <div className="max-h-80 overflow-y-auto">
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
                    <td className="py-1.5">{new Date(sale.createdAt).toLocaleTimeString('es-CL')}</td>
                    <td className="py-1.5">{sale.paymentMethod}</td>
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
  );
}
