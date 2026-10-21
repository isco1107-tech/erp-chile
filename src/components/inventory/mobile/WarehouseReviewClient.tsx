'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { CheckCheck, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { warehouseOperationSchema } from '@/lib/warehouse/contracts';
import { warehouseFetch } from '@/lib/warehouse/web-client';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';

const responseSchema = z.object({
  operations: z.array(z.object({ id: z.string(), payload: warehouseOperationSchema, status: z.string(), message: z.string(), createdById: z.string(), createdAt: z.string() })),
  products: z.array(z.object({ id: z.string(), name: z.string(), sku: z.string(), unit: z.string() })),
  warehouses: z.array(z.object({ id: z.string(), name: z.string() })), users: z.array(z.object({ id: z.string(), name: z.string() })), nextCursor: z.string().nullable(),
});
type ReviewData = z.infer<typeof responseSchema>;
const field = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';

export default function WarehouseReviewClient({ canSeeCosts }: { canSeeCosts: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (history) query.set('history', '1');
      const next = responseSchema.parse(await warehouseFetch(`/api/warehouse/review?${query}`));
      setData((previous) => cursor && previous ? { ...next, operations: [...previous.operations, ...next.operations], products: [...previous.products, ...next.products], users: [...previous.users, ...next.users] } : next);
      setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudieron cargar los registros'); }
    finally { setLoading(false); }
  }, [history]);
  useEffect(() => { void load(); }, [load]);
  const review = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    const reason = reasons[id]?.trim();
    if (!reason || reason.length < 3) { setError('Escribe el motivo de la revisión, con al menos tres caracteres'); return; }
    if (!(await confirm({ title: decision === 'APPROVE' ? '¿Confirmar este ajuste de inventario?' : '¿Rechazar este registro?', description: decision === 'APPROVE' ? 'Se comprobarán nuevamente las existencias y se registrará el ajuste con su asiento contable.' : 'El inventario no cambiará y el operario verá el motivo.', confirmLabel: decision === 'APPROVE' ? 'Confirmar ajuste' : 'Rechazar', destructive: decision === 'REJECT' }))) return;
    setBusy(id);
    try {
      await warehouseFetch(`/api/warehouse/review/${id}`, { decision, reason, ...(costs[id]?.trim() ? { unitCost: Number(costs[id].replace(',', '.')) } : {}) });
      setData((previous) => previous ? { ...previous, operations: previous.operations.filter((row) => row.id !== id) } : null);
      setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo revisar el registro'); }
    finally { setBusy(''); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="max-w-2xl text-sm text-muted-foreground">Revisa ingresos sin orden, conteos y conflictos del equipo. Una aprobación vuelve a comprobar el saldo; un conteo desactualizado requiere una nueva captura.</p><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</Button><Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" href="/bodega"><ExternalLink size={16} /> Abrir bodega</Link></div></div>
    <div className="flex gap-2"><Button variant={history ? 'outline' : 'default'} aria-pressed={!history} onClick={() => setHistory(false)}>Pendientes</Button><Button variant={history ? 'default' : 'outline'} aria-pressed={history} onClick={() => setHistory(true)}>Historial completo</Button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>}
    {loading && !data ? <p className="flex items-center gap-2 p-8" role="status"><Loader2 className="animate-spin" size={18} /> Cargando registros…</p> : data?.operations.length === 0 ? <EmptyState title="Bodega al día" description="No hay ajustes ni conflictos pendientes de revisión." icon={<CheckCheck className="size-12 text-success" />} /> : <div className="grid gap-4 xl:grid-cols-2">{data?.operations.map((entry) => {
      const product = data.products.find((row) => row.id === entry.payload.productId);
      return <article className="space-y-4 rounded-xl border border-border bg-card p-5" key={entry.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">{data.users.find((row) => row.id === entry.createdById)?.name ?? 'Operario'} · {data.warehouses.find((row) => row.id === entry.payload.warehouseId)?.name ?? 'Bodega'}</p><h2 className="mt-1 text-lg font-semibold">{product?.name ?? entry.payload.productId}</h2><p className="mt-1 text-sm text-muted-foreground">{entry.payload.kind === 'COUNT' ? 'Cantidad contada' : entry.payload.kind === 'IN' ? 'Ingreso sin orden' : 'Movimiento'}: <strong className="text-foreground">{entry.payload.quantity.toLocaleString('es-CL')} {product?.unit}</strong>{entry.payload.lotNumber && ` · Lote ${entry.payload.lotNumber}`}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${entry.status === 'CONFLICT' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{entry.status === 'CONFLICT' ? 'En conflicto' : entry.status === 'APPLIED' ? 'Confirmado' : entry.status === 'REJECTED' ? 'Rechazado' : 'Por aprobar'}</span></div>
      <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground"><p>{entry.message}</p><p className="mt-1">{entry.payload.note}</p>{entry.payload.expiryDate && <p>Vencimiento: {entry.payload.expiryDate}</p>}<p className="mt-1">Capturado: {new Date(entry.payload.capturedAt).toLocaleString('es-CL')}</p></div>
      {['REVIEW', 'CONFLICT'].includes(entry.status) && <><label className="block text-sm font-medium">Motivo de la revisión<textarea className={`${field} mt-2 min-h-20`} maxLength={500} value={reasons[entry.id] ?? ''} onChange={(event) => setReasons((previous) => ({ ...previous, [entry.id]: event.target.value }))} placeholder="Explica la validación o el motivo del rechazo" /></label>
      {entry.payload.kind === 'IN' && canSeeCosts && entry.status === 'REVIEW' && <label className="block text-sm font-medium">Costo unitario confirmado <span className="font-normal text-muted-foreground">(opcional si ya tiene PMP)</span><input className={`${field} mt-2`} inputMode="decimal" value={costs[entry.id] ?? ''} onChange={(event) => setCosts((previous) => ({ ...previous, [entry.id]: event.target.value }))} placeholder="Costo por unidad base en CLP" /></label>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={Boolean(busy)} onClick={() => void review(entry.id, 'REJECT')}>Rechazar</Button>{entry.status === 'REVIEW' && <Button disabled={Boolean(busy)} onClick={() => void review(entry.id, 'APPROVE')}>{busy === entry.id && <Loader2 size={16} className="animate-spin" />} Aprobar ajuste</Button>}</div></>}</article>;
    })}</div>}
    {data?.nextCursor && <Button variant="outline" disabled={loading} onClick={() => void load(data.nextCursor ?? undefined)}>Cargar más registros</Button>}
  </div>;
}
