'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { parseSerialList, SERIAL_STATUSES, SERIAL_STATUS_LABELS, WARRANTY_LABELS, warrantyStatus, type SerialStatus } from '@/lib/inventory/traceability';
import { changeSerialStatusAction, listSalesForProductAction, registerSerialsAction, transferSerialsAction } from '@/modules/inventory/actions/traceability.actions';
import type { SaleOption, SerialRow } from '@/modules/inventory/services/traceability.service';
import type { Tone } from '@/components/ui/tone';

interface Option {
  id: string;
  name: string;
}

interface Props {
  productId: string;
  productName: string;
  serials: SerialRow[];
  warehouses: Option[];
  suppliers: Option[];
  canWrite: boolean;
}

const COLUMN_TONE: Record<SerialStatus, Tone> = { IN_STOCK: 'success', SOLD: 'info', LOST: 'danger', RETURNED: 'warning' };
const ACTION_LABEL: Record<SerialStatus, string> = {
  IN_STOCK: 'Volver a bodega',
  SOLD: 'Marcar vendida',
  LOST: 'Dar de baja (pérdida)',
  RETURNED: 'Devolver al proveedor',
};

/** Tablero por estado de las series de un producto, con alta, cambio de estado y traslado. */
export default function SerialsPanel({ productId, productName, serials, warehouses, suppliers, canWrite }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [registerOpen, setRegisterOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [change, setChange] = useState<{ row: SerialRow; to: SerialStatus } | null>(null);

  const text = query.trim().toUpperCase();
  const visible = useMemo(() => (text ? serials.filter((row) => row.serial.includes(text)) : serials), [serials, text]);
  const selectedRows = serials.filter((row) => selected.has(row.id));
  const selectedWarehouses = new Set(selectedRows.map((row) => row.warehouseId));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function done() {
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una serie" className="pl-8" aria-label="Buscar una serie" />
        </div>
        {canWrite && (
          <>
            <Button type="button" variant="outline" disabled={selectedRows.length === 0} onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="size-4" aria-hidden="true" /> Trasladar seleccionadas{selectedRows.length ? ` (${selectedRows.length})` : ''}
            </Button>
            <Button type="button" onClick={() => setRegisterOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Registrar series
            </Button>
          </>
        )}
      </div>

      {serials.length === 0 ? (
        <EmptyState
          title="Este producto aún no tiene series"
          description="Registra los números de serie de lo que hay en bodega para seguir cada unidad: dónde está, cuándo se vendió o qué le pasó."
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0">
          <div className="flex snap-x gap-3 lg:grid lg:grid-cols-4">
            {SERIAL_STATUSES.map((status) => {
              const rows = visible.filter((row) => row.status === status);
              return (
                <section key={status} className="flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/40 lg:w-auto lg:shrink" aria-label={SERIAL_STATUS_LABELS[status]}>
                  <header className="flex items-center justify-between gap-2 border-b border-border/70 p-3">
                    <h3 className="text-sm font-semibold">{SERIAL_STATUS_LABELS[status]}</h3>
                    <StatusBadge tone={COLUMN_TONE[status]}>{rows.length}</StatusBadge>
                  </header>
                  <div className="flex max-h-[32rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {rows.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Ninguna</p>}
                    {rows.map((row) => (
                      <article key={row.id} className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm">
                        <div className="flex items-start gap-2">
                          {canWrite && status === 'IN_STOCK' && (
                            <input type="checkbox" className="mt-1 size-4" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Elegir la serie ${row.serial}`} />
                          )}
                          <p className="min-w-0 break-all font-mono text-sm font-semibold">{row.serial}</p>
                        </div>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {[row.warehouseName, row.lotNumber ? `Lote ${row.lotNumber}` : null, row.supplier, row.saleLabel, row.soldAt ? `vendida ${dayTimeLabel(row.soldAt)}` : `ingresó ${dayTimeLabel(row.receivedAt)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {row.warrantyUntil && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {WARRANTY_LABELS[warrantyStatus(row.warrantyUntil, new Date()).state]} · hasta {row.warrantyUntil.toISOString().slice(0, 10)}
                          </p>
                        )}
                        {row.notes && <p className="mt-1 break-words text-xs text-muted-foreground">{row.notes}</p>}
                        {canWrite && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {row.allowedNext.map((to) => (
                              <Button key={to} type="button" size="sm" variant="outline" onClick={() => setChange({ row, to })}>
                                {ACTION_LABEL[to]}
                              </Button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {serials.length >= 1000 && <p className="text-xs text-muted-foreground">Se muestran las 1.000 series más recientes. Usa el buscador para encontrar una puntual.</p>}

      {registerOpen && <RegisterDialog productId={productId} productName={productName} warehouses={warehouses} suppliers={suppliers} onClose={() => setRegisterOpen(false)} onDone={done} />}
      {transferOpen && (
        <TransferDialog
          productId={productId}
          rows={selectedRows}
          mixedOrigins={selectedWarehouses.size > 1}
          warehouses={warehouses.filter((w) => !selectedWarehouses.has(w.id))}
          onClose={() => setTransferOpen(false)}
          onDone={done}
        />
      )}
      {change && <StatusDialog productId={productId} row={change.row} to={change.to} warehouses={warehouses} onClose={() => setChange(null)} onDone={done} />}
    </div>
  );
}

function RegisterDialog({ productId, productName, warehouses, suppliers, onClose, onDone }: { productId: string; productName: string; warehouses: Option[]; suppliers: Option[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [serialsText, setSerialsText] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseSerialList(serialsText), [serialsText]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    const result = await registerSerialsAction({ productId, warehouseId, serialsText, lotNumber, supplierId, notes });
    setSaving(false);
    if (!result.success) return setError(result.error);
    toast.success(result.message ?? 'Series registradas');
    await onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Registrar series</DialogTitle>
            <DialogDescription>
              {productName}. Registrar series no cambia el stock: la entrada de mercadería se hace aparte (compra, recepción o ajuste).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="serial-warehouse">Bodega donde están</Label>
            <select id="serial-warehouse" className={nativeSelectClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serial-list">Series (una por línea)</Label>
            <textarea id="serial-list" className={textareaClass} rows={6} value={serialsText} onChange={(event) => setSerialsText(event.target.value)} placeholder={'SN-0001\nSN-0002'} />
            <p className="text-xs text-muted-foreground">
              {parsed.serials.length} serie(s) válidas
              {parsed.duplicates.length ? ` · ${parsed.duplicates.length} repetida(s) en el texto` : ''}
              {parsed.invalid.length ? ` · ${parsed.invalid.length} inválida(s)` : ''}. Hasta 500 por vez; se guardan en mayúsculas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="serial-lot">Lote (opcional)</Label>
              <Input id="serial-lot" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} maxLength={60} />
            </div>
            {suppliers.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="serial-supplier">Proveedor (opcional)</Label>
                <select id="serial-supplier" className={nativeSelectClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serial-notes">Nota (opcional)</Label>
            <Input id="serial-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || parsed.serials.length === 0 || !warehouseId}>{saving ? 'Guardando…' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ productId, row, to, warehouses, onClose, onDone }: { productId: string; row: SerialRow; to: SerialStatus; warehouses: Option[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [note, setNote] = useState('');
  const [salesDocumentId, setSalesDocumentId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (to !== 'SOLD') return;
    let active = true;
    listSalesForProductAction(productId).then((result) => {
      if (active && result.success) setSales(result.data);
    });
    return () => {
      active = false;
    };
  }, [to, productId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (to === 'LOST' && !note.trim()) return setError('Explica qué pasó con la serie');
    setSaving(true);
    const result = await changeSerialStatusAction({ serialId: row.id, to, note, salesDocumentId, warehouseId: to === 'IN_STOCK' ? warehouseId : undefined });
    setSaving(false);
    if (!result.success) return setError(result.error);
    toast.success(result.message ?? 'Serie actualizada');
    await onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{ACTION_LABEL[to]}</DialogTitle>
            <DialogDescription>
              Serie <span className="font-mono">{row.serial}</span>. Esto deja constancia en su historia; no mueve el stock (las ventas y las mermas lo mueven por su propio camino).
            </DialogDescription>
          </DialogHeader>
          {to === 'SOLD' && (
            <div className="space-y-1.5">
              <Label htmlFor="serial-sale">Venta (opcional)</Label>
              <select id="serial-sale" className={nativeSelectClass} value={salesDocumentId} onChange={(event) => setSalesDocumentId(event.target.value)}>
                <option value="">Sin asociar a una venta</option>
                {sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.label} · {dayTimeLabel(sale.issueDate)} · {sale.customer}
                  </option>
                ))}
              </select>
            </div>
          )}
          {to === 'IN_STOCK' && (
            <div className="space-y-1.5">
              <Label htmlFor="serial-back">Bodega a la que vuelve</Label>
              <select id="serial-back" className={nativeSelectClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="serial-note">{to === 'LOST' ? 'Qué pasó' : 'Nota (opcional)'}</Label>
            <Input id="serial-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ productId, rows, mixedOrigins, warehouses, onClose, onDone }: { productId: string; rows: SerialRow[]; mixedOrigins: boolean; warehouses: Option[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mixedOrigins) return setError('Las series elegidas están en bodegas distintas: traslada de una bodega a la vez');
    setSaving(true);
    const result = await transferSerialsAction({ productId, serialIds: rows.map((row) => row.id), toWarehouseId, note });
    setSaving(false);
    if (!result.success) return setError(result.error);
    toast.success(result.message ?? 'Series trasladadas');
    await onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Trasladar {rows.length} serie(s)</DialogTitle>
            <DialogDescription>Mueve también el stock entre bodegas, igual que un traslado normal (queda en el kardex de ambas).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="serial-dest">Bodega de destino</Label>
            <select id="serial-dest" className={nativeSelectClass} value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serial-tnote">Nota (opcional)</Label>
            <Input id="serial-tnote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !toWarehouseId}>{saving ? 'Trasladando…' : 'Trasladar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
