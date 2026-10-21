'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { confirmSettlementAction, discardSettlementAction, markSettlementPaidAction } from '@/modules/consignment/actions/consignment.actions';
import type { SettlementDetail } from '@/modules/consignment/services/settlement.service';
import { SETTLEMENT_STATUS } from './SettlementsClient';
import { formatBps, formatCurrency, formatDay } from './format';

export default function SettlementDetailClient({ settlement, canWrite }: { settlement: SettlementDetail; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const badge = SETTLEMENT_STATUS[settlement.status];
  const payablePaid = settlement.payable?.paymentStatus === 'PAID';

  async function run(
    action: (id: string) => Promise<{ success: true; message?: string } | { success: false; error: string }>,
    options?: { title: string; description: string; redirect?: boolean }
  ) {
    if (options && !(await confirm({ title: options.title, description: options.description }))) return;
    setBusy(true);
    const result = await action(settlement.id);
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    if (options?.redirect) router.push('/dashboard/consignment/settlements');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        <span className="text-sm text-muted-foreground">
          {formatDay(settlement.periodStart)} – {formatDay(settlement.periodEnd)}
        </span>
        {settlement.paidAt && <span className="text-sm text-muted-foreground">Pagada el {formatDay(settlement.paidAt)}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {canWrite && settlement.status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(discardSettlementAction, {
                    title: '¿Descartar el borrador?',
                    description: 'Sus ventas volverán a quedar pendientes de liquidar.',
                    redirect: true,
                  })
                }
              >
                Descartar borrador
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  run(confirmSettlementAction, {
                    title: '¿Confirmar la liquidación?',
                    description: `Se creará la cuenta por pagar al productor por ${formatCurrency(settlement.totalPayable)}. Ya no podrás modificar sus líneas.`,
                  })
                }
              >
                Confirmar liquidación
              </Button>
            </>
          )}
          {canWrite && settlement.status === 'CONFIRMED' && (
            <Button
              disabled={busy || !payablePaid}
              onClick={() =>
                run(markSettlementPaidAction, {
                  title: '¿Marcar como pagada?',
                  description: 'La cuenta por pagar de Tesorería ya figura saldada.',
                })
              }
            >
              Marcar pagada
            </Button>
          )}
        </div>
      </div>

      {settlement.status === 'CONFIRMED' && !payablePaid && (
        <p className="rounded-lg border border-border bg-warning-soft px-3 py-2 text-sm text-warning">
          Para marcarla como pagada, registra primero el pago al productor en Tesorería (Cuentas por pagar, documento {settlement.payable?.folio}).
        </p>
      )}
      {settlement.payable && (
        <p className="text-sm text-muted-foreground">
          Cuenta por pagar {settlement.payable.folio}: pagado {formatCurrency(settlement.payable.paidAmount)} de {formatCurrency(settlement.payable.totalAmount)}.{' '}
          <Link href="/dashboard/treasury/cxp" className="text-primary hover:underline">
            Ir a Tesorería
          </Link>
        </p>
      )}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Total label="Vendido (neto)" value={settlement.totalSold} />
        <Total label="Comisión retenida" value={settlement.totalCommission} />
        <Total label="Parte del productor (neto)" value={settlement.totalDue} />
        <Total label="Total a pagar (con IVA)" value={settlement.totalPayable} strong />
        <Total label="Neto afecto" value={settlement.producerNetAffected} />
        <Total label="Exento" value={settlement.producerExempt} />
        <Total label="IVA de su factura" value={settlement.producerIva} />
      </div>
      <p className="text-xs text-muted-foreground">
        Modelo: la venta es de tu empresa (boleta o factura por el total) y el productor te factura su parte. El IVA se calcula una vez sobre el neto afecto
        agregado. Criterio a validar con tu contador.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Producto</th>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 text-right font-medium">Neto</th>
              <th className="px-4 py-2.5 text-right font-medium">Comisión</th>
              <th className="px-4 py-2.5 text-right font-medium">Comisión %</th>
              <th className="px-4 py-2.5 text-right font-medium">Productor</th>
            </tr>
          </thead>
          <tbody>
            {settlement.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{line.productName}</span>
                  <p className="text-xs text-muted-foreground">{line.productSku}</p>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {line.documentLabel ?? 'Anulación'}
                  {line.isReversal && <StatusBadge tone="danger" className="ml-2">Reversa</StatusBadge>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(line.soldNet)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(line.commissionAmount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBps(line.commissionBps)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(line.producerAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? 'text-lg font-semibold tabular-nums' : 'text-base tabular-nums'}>{formatCurrency(value)}</p>
    </div>
  );
}
