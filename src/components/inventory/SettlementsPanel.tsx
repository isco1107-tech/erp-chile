'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { formatCommission } from '@/lib/consignment/commission';
import { listSettlementsAction } from '@/modules/inventory/actions/consignment.actions';
import type { SettlementListItem, SettlementOverviewRow } from '@/modules/inventory/services/consignment-settlement.service';
import GenerateSettlementDialog from './GenerateSettlementDialog';
import SettlementDetailDialog from './SettlementDetailDialog';
import { PaySettlementDialog, VoidSettlementDialog, type SettlementRef } from './SettlementActionDialogs';
import { SETTLEMENT_STATUS_BADGE, formatShortDate } from './consignment-format';

interface Props {
  overview: SettlementOverviewRow[] | null;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'CONFIRMED', label: 'Por pagar' },
  { value: 'PAID', label: 'Pagadas' },
  { value: 'VOIDED', label: 'Anuladas' },
];

export default function SettlementsPanel({ overview, canManage, onChanged }: Props) {
  const [history, setHistory] = useState<SettlementListItem[] | null>(null);
  const [consignorFilter, setConsignorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [generateFor, setGenerateFor] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<SettlementRef | null>(null);
  const [voidFor, setVoidFor] = useState<SettlementRef | null>(null);

  const loadHistory = useCallback(async () => {
    const result = await listSettlementsAction(consignorFilter || undefined, statusFilter || undefined);
    if (result.success) setHistory(result.data);
    else toast.error(result.error);
  }, [consignorFilter, statusFilter]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function refreshAll() {
    await Promise.all([onChanged(), loadHistory()]);
  }

  const asRef = (row: SettlementListItem): SettlementRef => ({ id: row.id, number: row.number, consignorName: row.consignorName, payoutAmount: row.payoutAmount });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border">
        <header className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">Lo que hay por liquidar</h2>
          <p className="text-xs text-muted-foreground">Ventas emitidas de la mercadería de cada seller, netas de tu comisión, que todavía no entran a una liquidación.</p>
        </header>
        {overview === null ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : overview.length === 0 ? (
          <EmptyState title="Todavía no tienes sellers" description="Marca un contacto como «Seller (consignación)» para empezar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-auto text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2 font-medium">Seller</th>
                  <th className="p-2 font-medium">Comisión</th>
                  <th className="p-2 text-right font-medium">Unidades</th>
                  <th className="p-2 text-right font-medium">Neto vendido</th>
                  <th className="p-2 text-right font-medium">A pagar al seller</th>
                  <th className="p-2 text-right font-medium">Liquidado sin pagar</th>
                  {canManage && <th className="p-2 font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {overview.map((row) => {
                  const hasPending = row.pendingUnits !== 0 || row.pendingNet !== 0;
                  return (
                    <tr key={row.consignorId} className="border-t border-border">
                      <td className="p-2">
                        {row.name}
                        <span className="block text-xs text-muted-foreground">{row.rut}</span>
                      </td>
                      <td className="p-2">{row.commissionBps === null ? '—' : formatCommission(row.commissionBps)}</td>
                      <td className="p-2 text-right">{row.pendingUnits.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-right">{formatCurrency(row.pendingNet)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(row.pendingPayout)}</td>
                      <td className="p-2 text-right">
                        {row.unpaidCount > 0 ? (
                          <>
                            {formatCurrency(row.unpaidPayout)}
                            <span className="block text-xs text-muted-foreground">{row.unpaidCount} {row.unpaidCount === 1 ? 'liquidación' : 'liquidaciones'}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      {canManage && (
                        <td className="p-2">
                          <Button type="button" size="sm" variant={hasPending ? 'default' : 'outline'} onClick={() => setGenerateFor(row.consignorId)}>
                            Liquidar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">Liquidaciones generadas</h2>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filtrar por seller" className={`${nativeSelectClass} w-48`} value={consignorFilter} onChange={(e) => setConsignorFilter(e.target.value)}>
              <option value="">Todos los sellers</option>
              {(overview ?? []).map((row) => (
                <option key={row.consignorId} value={row.consignorId}>
                  {row.name}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por estado" className={`${nativeSelectClass} w-36`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
        </header>
        {history === null ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : history.length === 0 ? (
          <EmptyState title="Sin liquidaciones" description="Cuando liquides a un seller, su estado de cuenta queda guardado aquí." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-auto text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2 font-medium">N°</th>
                  <th className="p-2 font-medium">Seller</th>
                  <th className="p-2 font-medium">Fecha</th>
                  <th className="p-2 text-right font-medium">Neto vendido</th>
                  <th className="p-2 text-right font-medium">Comisión</th>
                  <th className="p-2 text-right font-medium">A pagar</th>
                  <th className="p-2 font-medium">Estado</th>
                  <th className="p-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const badge = SETTLEMENT_STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-2 font-mono text-xs">{row.number}</td>
                      <td className="p-2">{row.consignorName}</td>
                      <td className="p-2 whitespace-nowrap">{formatShortDate(row.createdAt)}</td>
                      <td className="p-2 text-right">{formatCurrency(row.netSales)}</td>
                      <td className="p-2 text-right">{formatCurrency(row.commissionAmount)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(row.payoutAmount)}</td>
                      <td className="p-2">
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                        {row.paidAt && <span className="block text-xs text-muted-foreground">{formatShortDate(row.paidAt)}</span>}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                            Ver detalle
                          </Button>
                          {canManage && row.status === 'CONFIRMED' && (
                            <>
                              <Button type="button" size="sm" onClick={() => setPayFor(asRef(row))}>
                                Marcar pagada
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setVoidFor(asRef(row))}>
                                Anular
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
        )}
      </section>

      {generateFor && (
        <GenerateSettlementDialog
          consignorId={generateFor}
          onClose={() => setGenerateFor(null)}
          onDone={async () => {
            setGenerateFor(null);
            await refreshAll();
          }}
        />
      )}
      {detailId && <SettlementDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
      {payFor && (
        <PaySettlementDialog
          settlement={payFor}
          onClose={() => setPayFor(null)}
          onDone={async () => {
            setPayFor(null);
            await refreshAll();
          }}
        />
      )}
      {voidFor && (
        <VoidSettlementDialog
          settlement={voidFor}
          onClose={() => setVoidFor(null)}
          onDone={async () => {
            setVoidFor(null);
            await refreshAll();
          }}
        />
      )}
    </div>
  );
}
