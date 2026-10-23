'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Boxes, HandCoins, Hourglass, Users } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { listConsignedStockAction, listSettlementOverviewAction } from '@/modules/inventory/actions/consignment.actions';
import type { ConsignedStockGroup } from '@/modules/inventory/services/consignment.service';
import type { SettlementOverviewRow } from '@/modules/inventory/services/consignment-settlement.service';
import ConsignedStockPanel from './ConsignedStockPanel';
import SettlementsPanel from './SettlementsPanel';

type Tab = 'EXISTENCIAS' | 'LIQUIDACIONES';

interface Props {
  canMoveStock: boolean;
  canSeeSettlements: boolean;
  canManageSettlements: boolean;
}

export default function ConsignmentClient({ canMoveStock, canSeeSettlements, canManageSettlements }: Props) {
  const [tab, setTab] = useState<Tab>('EXISTENCIAS');
  const [stock, setStock] = useState<ConsignedStockGroup[] | null>(null);
  const [overview, setOverview] = useState<SettlementOverviewRow[] | null>(null);

  const load = useCallback(async () => {
    const [stockResult, overviewResult] = await Promise.all([listConsignedStockAction(), canSeeSettlements ? listSettlementOverviewAction() : Promise.resolve(null)]);
    if (stockResult.success) setStock(stockResult.data);
    else toast.error(stockResult.error);
    if (overviewResult) {
      if (overviewResult.success) setOverview(overviewResult.data);
      else toast.error(overviewResult.error);
    }
  }, [canSeeSettlements]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'EXISTENCIAS', label: 'Existencias por seller' },
    ...(canSeeSettlements ? [{ value: 'LIQUIDACIONES' as const, label: 'Liquidaciones' }] : []),
  ];

  const units = stock?.reduce((sum, group) => sum + group.totalUnits, 0);
  const toSettle = overview?.reduce((sum, row) => sum + row.pendingPayout, 0);
  const unpaid = overview?.reduce((sum, row) => sum + row.unpaidPayout, 0);

  return (
    <div className="space-y-6">
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', canSeeSettlements ? 'lg:grid-cols-4' : 'lg:grid-cols-2')}>
        <KpiCard label="Sellers" value={stock ? String(stock.length) : '—'} icon={Users} tone="info" hint="Contactos marcados como seller" />
        <KpiCard label="Unidades en bodega" value={units === undefined ? '—' : units.toLocaleString('es-CL')} icon={Boxes} tone="accent" hint="Mercadería que sigue siendo de los sellers" />
        {canSeeSettlements && (
          <>
            <KpiCard label="Por liquidar" value={toSettle === undefined ? '—' : formatCurrency(toSettle)} icon={Hourglass} tone={toSettle ? 'warning' : 'neutral'} hint="Ventas emitidas sin liquidar, netas de tu comisión" />
            <KpiCard label="Liquidado sin pagar" value={unpaid === undefined ? '—' : formatCurrency(unpaid)} icon={HandCoins} tone={unpaid ? 'warning' : 'neutral'} hint="Liquidaciones generadas que aún no pagas" />
          </>
        )}
      </div>

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Secciones de consignación" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'EXISTENCIAS' && <ConsignedStockPanel groups={stock} canMoveStock={canMoveStock} onChanged={load} />}
      {tab === 'LIQUIDACIONES' && canSeeSettlements && <SettlementsPanel overview={overview} canManage={canManageSettlements} onChanged={load} />}
    </div>
  );
}
