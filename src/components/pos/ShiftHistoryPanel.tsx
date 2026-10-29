'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { listShiftsAction } from '@/modules/pos/actions/pos.actions';
import type { ShiftHistoryItem } from '@/modules/pos/services/cash.service';
import { formatCurrency } from '@/lib/chile/tax';
import CashPanel from './CashPanel';
import { santiagoDateTimeLabel } from '@/lib/chile/timezone';

interface Props {
  currentUserId: string;
  canSupervise: boolean;
}

/** El servidor limita la lista al propio cajero, salvo el permiso de supervisión. */
export default function ShiftHistoryPanel({ currentUserId, canSupervise }: Props) {
  const [shifts, setShifts] = useState<ShiftHistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await listShiftsAction();
      if (!result.success) { setFailed(true); toast.error(result.error); return; }
      setShifts(result.data);
      setHasMore(result.data.length === 30);
    } catch {
      setFailed(true);
      toast.error('No se pudieron consultar los turnos. Revisa la conexión y vuelve a actualizar.');
    } finally { setLoading(false); }
  }, []);
  async function loadMore() {
    const last = shifts.at(-1);
    if (!last || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const result = await listShiftsAction(last.id);
      if (!result.success) { toast.error(result.error); return; }
      setShifts((previous) => [...previous, ...result.data.filter((item) => !previous.some((old) => old.id === item.id))]);
      setHasMore(result.data.length === 30);
    } catch { toast.error('No se pudieron cargar los turnos anteriores. Intenta nuevamente.'); }
    finally { setLoadingMore(false); }
  }
  useEffect(() => { void load(); }, [load]);
  const selected = shifts.find((shift) => shift.id === selectedId);
  const filtered = shifts.filter((shift) => status === 'ALL' || shift.status === status);

  return <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-labelledby="shift-history-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="shift-history-title" className="font-semibold">{canSupervise ? 'Turnos y multicaja' : 'Mis turnos de caja'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{canSupervise ? 'Supervisa las cajas del local, consulta arqueos y cierra turnos de otros cajeros.' : 'Consulta tus aperturas, movimientos y comprobantes de cierre.'}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
        <RefreshCw className={`mr-1 size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar turnos
      </Button>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar turnos">
      {([['ALL', 'Todos'], ['OPEN', 'Abiertos'], ['CLOSED', 'Cerrados']] as const).map(([key, label]) => <Button key={key} type="button" size="sm" variant={status === key ? 'default' : 'outline'} aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</Button>)}
    </div>
    {failed && <p className="text-sm text-destructive" role="alert">No se pudo actualizar el historial. Intenta nuevamente.</p>}
    <div className="max-h-80 overflow-auto">
      <table className="w-full min-w-[650px] text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr>
          <th className="p-2 font-medium">Caja / cajero</th><th className="p-2 font-medium">Apertura</th><th className="p-2 font-medium">Estado</th><th className="p-2 text-right font-medium">Inicial</th><th className="p-2 text-right font-medium">Diferencia</th><th className="p-2"><span className="sr-only">Detalle</span></th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={6} className="p-5 text-center text-muted-foreground">{loading ? 'Consultando turnos…' : 'No hay turnos para este filtro.'}</td></tr>}
          {filtered.map((shift) => <tr key={shift.id} className={`border-t border-border ${selectedId === shift.id ? 'bg-muted' : ''}`}>
            <td className="p-2"><p className="font-medium">{shift.cashRegister.name}</p><p className="text-xs text-muted-foreground">{shift.user?.name || shift.user?.email || 'Usuario eliminado'}</p></td>
            <td className="p-2 tabular-nums">{santiagoDateTimeLabel(new Date(shift.openedAt))}</td>
            <td className="p-2"><span className={`rounded-full px-2 py-1 text-xs ${shift.status === 'OPEN' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{shift.status === 'OPEN' ? 'Abierto' : 'Cerrado'}</span></td>
            <td className="p-2 text-right tabular-nums">{formatCurrency(shift.initialAmount)}</td>
            <td className={`p-2 text-right tabular-nums ${shift.difference ? 'text-warning' : 'text-muted-foreground'}`}>{shift.status === 'CLOSED' ? formatCurrency(shift.difference ?? 0) : 'Pendiente'}</td>
            <td className="p-2 text-right"><Button type="button" size="sm" variant="outline" aria-label={`Ver turno ${shift.cashRegister.name} de ${shift.user?.name || shift.user?.email || 'usuario eliminado'}`} onClick={() => setSelectedId(selectedId === shift.id ? null : shift.id)}>{selectedId === shift.id ? 'Ocultar' : 'Ver turno'}</Button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{shifts.length} turnos cargados. Los montos se expresan en pesos chilenos.</p>
      {hasMore && <Button type="button" variant="outline" size="sm" disabled={loadingMore || loading} onClick={() => void loadMore()}>{loadingMore ? 'Cargando…' : 'Cargar turnos anteriores'}</Button>}
    </div>
    {selected && <div className="border-t border-border pt-4">
      <CashPanel
        key={selected.id}
        shiftId={selected.id}
        cashierName={selected.user?.name || selected.user?.email || 'Usuario eliminado'}
        cashRegisterName={selected.cashRegister.name}
        openedAt={new Date(selected.openedAt).toISOString()}
        canOperate={false}
        canClose={selected.userId === currentUserId || canSupervise}
        onClosed={() => void load()}
        closedShift={selected.status === 'CLOSED' ? {
          actualAmount: selected.actualAmount, expectedAmount: selected.expectedAmount,
          difference: selected.difference, closedAt: selected.closedAt ? new Date(selected.closedAt).toISOString() : null,
          closingNotes: selected.closingNotes,
        } : undefined}
      />
    </div>}
  </section>;
}
