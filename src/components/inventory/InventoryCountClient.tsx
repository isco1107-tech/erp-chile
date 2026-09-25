'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, Printer, ScanLine, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { lineDifference, summarizeCount } from '@/lib/inventory/count';
import { cn } from '@/lib/utils';
import {
  cancelInventoryCountAction,
  postInventoryCountAction,
  saveInventoryCountEntriesAction,
} from '@/modules/inventory/actions/inventory-count.actions';
import type { InventoryCountDetail, InventoryCountLineView } from '@/modules/inventory/services/inventory-count.service';
import { COUNT_STATUS_LABELS, COUNT_STATUS_TONE } from './InventoryCountsClient';

type Filter = 'all' | 'pending' | 'diff';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Sin contar' },
  { value: 'diff', label: 'Con diferencia' },
];

/** Filas que se pintan a la vez: el resto se alcanza con el buscador. */
const MAX_VISIBLE_ROWS = 300;

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

interface Props {
  count: InventoryCountDetail;
  canWrite: boolean;
  canSeeCosts: boolean;
}

export default function InventoryCountClient({ count, canWrite, canSeeCosts }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [lines, setLines] = useState<InventoryCountLineView[]>(count.lines);
  // Cambios sin guardar, por línea (`null` = volver a "sin contar").
  const [edits, setEdits] = useState<Map<string, number | null>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [scan, setScan] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const editable = canWrite && count.status === 'OPEN';
  const posted = count.status === 'POSTED';
  const dirty = edits.size > 0;

  // Los datos del servidor mandan tras un refresh (guardar/contabilizar).
  useEffect(() => {
    setLines(count.lines);
    setEdits(new Map());
  }, [count.lines]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const current = useMemo(
    () => lines.map((line) => (edits.has(line.id) ? { ...line, countedQuantity: edits.get(line.id) ?? null } : line)),
    [lines, edits]
  );
  const summary = useMemo(() => summarizeCount(current), [current]);

  /** Código → línea y unidades (producto, empaque o SKU). */
  const codeIndex = useMemo(() => {
    const index = new Map<string, { lineId: string; factor: number; label: string }>();
    for (const line of lines) {
      index.set(line.sku.toUpperCase(), { lineId: line.id, factor: 1, label: line.name });
      for (const packaging of line.packagings) index.set(packaging.barcode.toUpperCase(), { lineId: line.id, factor: packaging.factor, label: `${line.name} (${packaging.name})` });
      if (line.barcode) index.set(line.barcode.toUpperCase(), { lineId: line.id, factor: 1, label: line.name });
    }
    return index;
  }, [lines]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return current.filter((line) => {
      if (filter === 'pending' && line.countedQuantity !== null) return false;
      if (filter === 'diff' && !lineDifference(line)) return false;
      if (!needle) return true;
      return line.name.toLowerCase().includes(needle) || line.sku.toLowerCase().includes(needle) || (line.barcode ?? '').toLowerCase().includes(needle);
    });
  }, [current, filter, query]);

  function setCounted(lineId: string, value: number | null) {
    setEdits((prev) => {
      const next = new Map(prev);
      const original = lines.find((line) => line.id === lineId)?.countedQuantity ?? null;
      if (value === original) next.delete(lineId);
      else next.set(lineId, value);
      return next;
    });
  }

  function handleScan(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const match = codeIndex.get(code);
    setScan('');
    if (!match) {
      toast.error(`El código ${code} no está en este conteo`);
      return;
    }
    const line = current.find((candidate) => candidate.id === match.lineId);
    const next = (line?.countedQuantity ?? 0) + match.factor;
    setCounted(match.lineId, next);
    setLastScanned(match.lineId);
    toast.success(`${match.label}: ${qty(next)}`, { duration: 1500 });
  }

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const entries = [...edits.entries()].map(([lineId, countedQuantity]) => ({ lineId, countedQuantity }));
    const result = await saveInventoryCountEntriesAction(count.id, entries);
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    setLines((prev) => prev.map((line) => (edits.has(line.id) ? { ...line, countedQuantity: edits.get(line.id) ?? null } : line)));
    setEdits(new Map());
    return true;
  }

  async function handleSave() {
    setBusy(true);
    try {
      if (await save()) toast.success('Conteo guardado');
    } finally {
      setBusy(false);
    }
  }

  async function handleFillZero() {
    const pending = current.filter((line) => line.countedQuantity === null);
    if (pending.length === 0) return;
    const ok = await confirm({
      title: `¿Marcar ${pending.length} productos sin contar como 0?`,
      description: 'Úsalo solo si recorriste toda la bodega: lo que no encontraste queda en cero y, al contabilizar, se rebaja del stock.',
      confirmLabel: 'Marcar en cero',
    });
    if (!ok) return;
    setEdits((prev) => {
      const next = new Map(prev);
      for (const line of pending) next.set(line.id, 0);
      return next;
    });
  }

  async function handlePost() {
    const ok = await confirm({
      title: `¿Contabilizar la toma #${count.folio}?`,
      description: `Se ajustará el stock de ${count.warehouseName} a lo contado en ${summary.counted} productos (los no contados no se tocan). El ajuste se calcula contra el stock de este momento y genera su asiento. No se puede deshacer.`,
      confirmLabel: 'Contabilizar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (!(await save())) return;
      const result = await postInventoryCountAction(count.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Conteo contabilizado');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: `¿Anular la toma #${count.folio}?`,
      description: 'Lo contado se descarta y el stock no cambia.',
      confirmLabel: 'Anular',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await cancelInventoryCountAction(count.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Conteo anulado');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const rows = visible.slice(0, MAX_VISIBLE_ROWS);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Toma de inventario #${count.folio}`}
        title={count.warehouseName}
        description={
          <>
            {count.categoryName ? `Categoría ${count.categoryName}` : 'Todos los productos con stock'} · abierta el {formatDate(count.createdAt)}
            {count.postedAt && <> · contabilizada el {formatDate(count.postedAt)}</>}
            {count.notes && <> · {count.notes}</>}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <StatusBadge tone={COUNT_STATUS_TONE[count.status]}>{COUNT_STATUS_LABELS[count.status]}</StatusBadge>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden="true" /> Hoja de conteo
            </Button>
            {editable && (
              <>
                <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>Anular</Button>
                <Button type="button" onClick={handlePost} disabled={busy || summary.counted === 0}>
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Contabilizar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <KpiCard label="Contados" value={`${summary.counted} de ${summary.lines}`} icon={ClipboardList} tone="info" hint={`${summary.progress}% del conteo`} />
        <KpiCard label="Con diferencia" value={String(summary.withDifference)} icon={AlertTriangle} tone={summary.withDifference > 0 ? 'warning' : 'neutral'} hint="Contado distinto al sistema" />
        {canSeeCosts && (
          <>
            <KpiCard label="Sobrante" value={formatCurrency(summary.surplusValue)} icon={TrendingUp} tone="success" hint="Valorizado al PMP" />
            <KpiCard label="Faltante" value={formatCurrency(summary.shortageValue)} icon={TrendingDown} tone={summary.shortageValue > 0 ? 'danger' : 'neutral'} hint="Valorizado al PMP" />
          </>
        )}
      </div>

      {editable && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-card print:hidden" aria-label="Contar con lector">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Escanea un código (o escribe el SKU y Enter): suma 1 unidad, o las del empaque"
                aria-label="Código escaneado"
                className="h-10 pl-8"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleFillZero} disabled={busy || summary.counted === summary.lines}>
                No contados en cero
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy || !dirty}>
                {dirty ? `Guardar (${edits.size})` : 'Guardado'}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Productos del conteo">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div role="tablist" aria-label="Filtrar" className="inline-flex rounded-md bg-muted p-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filter === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Producto, SKU o código" aria-label="Buscar producto" className="h-9 pl-8 sm:w-64" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 text-right font-medium">{posted ? 'Stock al cierre' : 'Sistema'}</th>
                <th className="px-4 py-2.5 text-right font-medium">Contado</th>
                <th className="px-4 py-2.5 text-right font-medium">{posted ? 'Ajuste' : 'Diferencia'}</th>
                {canSeeCosts && <th className="px-4 py-2.5 text-right font-medium print:hidden">Valor</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canSeeCosts ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                    {query ? 'Ningún producto coincide con la búsqueda.' : filter === 'pending' ? 'Todo está contado.' : filter === 'diff' ? 'Sin diferencias: lo contado cuadra con el sistema.' : 'Sin productos.'}
                  </td>
                </tr>
              )}
              {rows.map((line) => {
                const reference = posted && line.stockAtPosting !== null ? line.stockAtPosting : line.systemQuantity;
                const diff = posted ? line.adjustment : lineDifference(line);
                const value = diff ? Math.round(Math.abs(diff) * line.unitCost) : 0;
                return (
                  <tr key={line.id} className={cn('hover:bg-muted/40', lastScanned === line.id && 'bg-accent/60', edits.has(line.id) && 'bg-warning-soft/40')}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{line.name}</span>
                      {line.barcode && <span className="ml-2 font-mono text-xs text-muted-foreground">{line.barcode}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {qty(reference)} <span className="text-xs">{line.unit}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={line.countedQuantity ?? ''}
                          onChange={(e) => setCounted(line.id, e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
                          aria-label={`Cantidad contada de ${line.name}`}
                          className="ml-auto h-8 w-28 text-right tabular-nums print:border-0"
                        />
                      ) : (
                        <span className="tabular-nums">{line.countedQuantity === null ? '—' : qty(line.countedQuantity)}</span>
                      )}
                    </td>
                    <td className={cn('px-4 py-2 text-right font-medium tabular-nums', diff && diff > 0 && 'text-success', diff && diff < 0 && 'text-danger')}>
                      {diff === null ? '—' : diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${qty(diff)}`}
                    </td>
                    {canSeeCosts && (
                      <td className={cn('px-4 py-2 text-right tabular-nums print:hidden', diff && diff < 0 ? 'text-danger' : 'text-muted-foreground')}>
                        {diff ? `${diff < 0 ? '−' : ''}${formatCurrency(value)}` : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length > MAX_VISIBLE_ROWS && (
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground print:hidden">
            Mostrando {MAX_VISIBLE_ROWS} de {visible.length} productos. Usa el buscador o el lector para llegar al resto.
          </p>
        )}
      </section>
    </div>
  );
}
