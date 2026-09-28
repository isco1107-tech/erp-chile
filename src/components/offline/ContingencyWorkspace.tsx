'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contingencySnapshotKey, type ContingencyForm } from '@/lib/offline/contingency';
import {
  getPurchaseContingencyDataAction,
  getReceiptContingencyDataAction,
  getStockContingencyDataAction,
} from '@/modules/offline/actions/contingency.actions';
import { GoodsReceiptOfflineForm, PurchaseOfflineForm, StockMovementOfflineForm } from './ContingencyForms';
import { useEnqueue, useOfflineData, useQueuedOperations, type OfflineData } from './useContingency';

const timeFormat = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

const TAB_LABELS: Record<ContingencyForm, string> = {
  STOCK_MOVEMENT: 'Movimiento de stock',
  PURCHASE: 'Compra',
  GOODS_RECEIPT: 'Recepción de OC',
};

interface Props {
  companyId: string;
  userId: string;
  /** Formularios que la persona puede usar, según sus permisos. */
  forms: ContingencyForm[];
}

function DataNotice<T>({ state }: { state: OfflineData<T> }) {
  if (state.loading) return <p className="text-sm text-muted-foreground">Cargando datos…</p>;
  if (state.error) return <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{state.error}</p>;
  if (state.savedAt) {
    return <p className="text-xs text-muted-foreground">Usando los datos guardados en este equipo el {timeFormat.format(new Date(state.savedAt))}.</p>;
  }
  return null;
}

function StockSection({ companyId, userId }: Omit<Props, 'forms'>) {
  const state = useOfflineData(contingencySnapshotKey('STOCK_MOVEMENT', companyId), getStockContingencyDataAction);
  const enqueue = useEnqueue(companyId, userId);
  return (
    <div className="space-y-3">
      <DataNotice state={state} />
      {state.data && <StockMovementOfflineForm companyId={companyId} userId={userId} enqueue={enqueue} products={state.data.products} warehouses={state.data.warehouses} />}
    </div>
  );
}

function PurchaseSection({ companyId, userId }: Omit<Props, 'forms'>) {
  const state = useOfflineData(contingencySnapshotKey('PURCHASE', companyId), getPurchaseContingencyDataAction);
  const enqueue = useEnqueue(companyId, userId);
  return (
    <div className="space-y-3">
      <DataNotice state={state} />
      {state.data && (
        <PurchaseOfflineForm companyId={companyId} userId={userId} enqueue={enqueue} products={state.data.products} warehouses={state.data.warehouses} suppliers={state.data.suppliers} />
      )}
    </div>
  );
}

function ReceiptSection({ companyId, userId }: Omit<Props, 'forms'>) {
  const state = useOfflineData(contingencySnapshotKey('GOODS_RECEIPT', companyId), getReceiptContingencyDataAction);
  const enqueue = useEnqueue(companyId, userId);
  const queued = useQueuedOperations();
  return (
    <div className="space-y-3">
      <DataNotice state={state} />
      {state.data && (
        <GoodsReceiptOfflineForm companyId={companyId} userId={userId} enqueue={enqueue} orders={state.data.orders} warehouses={state.data.warehouses} queued={queued} />
      )}
    </div>
  );
}

/**
 * Modo sin conexión para bodega y compras (docs/adr/0002). Todo lo que se
 * registra aquí queda en la cola del equipo y se aplica con las mismas reglas
 * que en línea al sincronizar, en el orden en que se hizo.
 */
export default function ContingencyWorkspace({ companyId, userId, forms }: Props) {
  const [tab, setTab] = useState<ContingencyForm>(forms[0] ?? 'STOCK_MOVEMENT');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div
        role="status"
        className={cn(
          'flex items-start gap-3 rounded-2xl border p-4 text-sm',
          online ? 'border-border bg-card text-muted-foreground' : 'border-warning/30 bg-warning-soft text-warning'
        )}
      >
        {online ? <Wifi className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <p>
          {online
            ? 'Con conexión: lo que registres aquí se aplica de inmediato. Deja esta pantalla abierta una vez con conexión para que quede disponible sin red.'
            : 'Sin conexión: lo que registres queda guardado en este equipo (hasta 2 horas) y se aplica solo al volver la conexión, en el mismo orden.'}
        </p>
      </div>

      {forms.length > 1 && (
        <div role="tablist" aria-label="Qué registrar" className="inline-flex flex-wrap rounded-xl border border-border bg-card p-1 shadow-card">
          {forms.map((form) => (
            <button
              key={form}
              type="button"
              role="tab"
              aria-selected={tab === form}
              onClick={() => setTab(form)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                tab === form ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {TAB_LABELS[form]}
            </button>
          ))}
        </div>
      )}

      {/*
        Todas montadas (solo se oculta la inactiva): abrir la pantalla una vez
        con conexión guarda en el equipo los datos de los tres formularios, y
        cambiar de pestaña no pierde lo que se estaba escribiendo.
      */}
      {forms.includes('STOCK_MOVEMENT') && (
        <div className={tab === 'STOCK_MOVEMENT' ? '' : 'hidden'}>
          <StockSection companyId={companyId} userId={userId} />
        </div>
      )}
      {forms.includes('PURCHASE') && (
        <div className={tab === 'PURCHASE' ? '' : 'hidden'}>
          <PurchaseSection companyId={companyId} userId={userId} />
        </div>
      )}
      {forms.includes('GOODS_RECEIPT') && (
        <div className={tab === 'GOODS_RECEIPT' ? '' : 'hidden'}>
          <ReceiptSection companyId={companyId} userId={userId} />
        </div>
      )}
    </div>
  );
}
