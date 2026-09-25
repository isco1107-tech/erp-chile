'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import {
  ignoreBankLineAction,
  listOpenDocumentsForLineAction,
  listPaymentCandidatesForLineAction,
  matchBankLineAction,
  registerFromBankLineAction,
} from '@/modules/treasury/actions/banks.actions';
import { BANK_LINE_IGNORE_REASONS } from '@/modules/treasury/schema';
import type { OpenDocumentOption, OpenPaymentView, ReconLineView } from '@/modules/treasury/services/banks.service';

interface DialogProps {
  line: ReconLineView;
  onClose: () => void;
  onDone: () => void;
}

function formatDate(value: Date | string | null): string {
  if (!value) return 'sin vencimiento';
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value;
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function LineSummary({ line }: { line: ReconLineView }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
      <p className="truncate font-medium">{line.description}</p>
      <p className="text-xs text-muted-foreground">
        {formatDate(line.date)} · <span className="font-semibold text-foreground tabular-nums">{formatCurrency(Math.abs(line.amount))}</span> {line.amount > 0 ? 'abono' : 'cargo'}
      </p>
    </div>
  );
}

/** Registra el cobro/pago que falta desde el movimiento, repartido en uno o varios documentos. */
export function RegisterFromLineDialog({ line, onClose, onDone }: DialogProps) {
  const target = Math.abs(line.amount);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<OpenDocumentOption[]>([]);
  const [allocations, setAllocations] = useState<Map<string, { option: OpenDocumentOption; amount: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listOpenDocumentsForLineAction(line.id, query.trim() || undefined);
      if (cancelled) return;
      if (result.success) setOptions(result.data);
      else toast.error(result.error);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [line.id, query]);

  const assigned = useMemo(() => [...allocations.values()].reduce((sum, row) => sum + row.amount, 0), [allocations]);
  const remaining = target - assigned;

  function toggle(option: OpenDocumentOption) {
    setAllocations((prev) => {
      const next = new Map(prev);
      if (next.has(option.id)) next.delete(option.id);
      else {
        const current = [...next.values()].reduce((sum, row) => sum + row.amount, 0);
        next.set(option.id, { option, amount: Math.max(0, Math.min(option.pending, target - current)) });
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await registerFromBankLineAction(line.id, {
        allocations: [...allocations.values()].filter((row) => row.amount > 0).map((row) => ({ documentId: row.option.id, amount: row.amount })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Registrado');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line.amount > 0 ? 'Registrar cobro desde el banco' : 'Registrar pago desde el banco'}</DialogTitle>
          <DialogDescription>
            Elige {line.amount > 0 ? 'la factura o boleta que el cliente pagó' : 'la factura del proveedor que pagaste'}. Si el movimiento cubre varias, márcalas todas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LineSummary line={line} />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, RUT o N° de documento" aria-label="Buscar documento" className="h-9 pl-8" />
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {loading && options.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Buscando…</li>}
            {!loading && options.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No hay documentos con saldo que coincidan.</li>}
            {options.map((option) => {
              const selected = allocations.get(option.id);
              return (
                <li key={option.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', selected && 'bg-accent/40')}>
                  <input type="checkbox" className="size-4 accent-primary" checked={!!selected} onChange={() => toggle(option)} aria-label={`Seleccionar ${option.label}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{option.contactName}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.label} · vence {formatDate(option.dueDate)} · saldo {formatCurrency(option.pending)}
                      {option.pending === target && <span className="ml-1 font-semibold text-success">· mismo monto</span>}
                    </p>
                  </div>
                  {selected && (
                    <CurrencyInput
                      className="h-8 w-32"
                      value={selected.amount}
                      aria-label={`Monto para ${option.label}`}
                      onChange={(value) =>
                        setAllocations((prev) => {
                          const next = new Map(prev);
                          next.set(option.id, { option, amount: Math.min(value, option.pending) });
                          return next;
                        })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className={cn('text-sm', remaining === 0 ? 'text-success' : 'text-muted-foreground')}>
            Asignado {formatCurrency(assigned)} de {formatCurrency(target)}
            {remaining !== 0 && ` · ${remaining > 0 ? 'faltan' : 'sobran'} ${formatCurrency(Math.abs(remaining))}`}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || remaining !== 0 || allocations.size === 0} onClick={handleSave}>
            {saving ? 'Registrando…' : 'Registrar y conciliar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Concilia el movimiento contra uno o varios cobros/pagos ya registrados. */
export function MatchManyDialog({ line, onClose, onDone }: DialogProps) {
  const [candidates, setCandidates] = useState<OpenPaymentView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listPaymentCandidatesForLineAction(line.id).then((result) => {
      if (cancelled) return;
      if (result.success) setCandidates(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [line.id]);

  const total = candidates.filter((payment) => selected.has(payment.id)).reduce((sum, payment) => sum + payment.amount, 0);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await matchBankLineAction(line.id, { paymentIds: [...selected] });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Conciliado');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar con registros existentes</DialogTitle>
          <DialogDescription>Marca los cobros o pagos que forman este movimiento. La suma debe calzar exacto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LineSummary line={line} />
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {loading && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Buscando…</li>}
            {!loading && candidates.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No hay {line.amount > 0 ? 'cobros' : 'pagos'} sin conciliar cerca de esa fecha. Usa “Registrar {line.amount > 0 ? 'cobro' : 'pago'}”.</li>
            )}
            {candidates.map((payment) => (
              <li key={payment.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', selected.has(payment.id) && 'bg-accent/40')}>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(payment.id)}
                  aria-label={`Seleccionar ${payment.label}`}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(payment.id)) next.delete(payment.id);
                      else next.add(payment.id);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{payment.contactName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.date)} · {payment.label}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{formatCurrency(Math.abs(payment.amount))}</span>
              </li>
            ))}
          </ul>
          <p className={cn('text-sm', total === line.amount ? 'text-success' : 'text-muted-foreground')}>
            Seleccionado {formatCurrency(Math.abs(total))} de {formatCurrency(Math.abs(line.amount))}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || total !== line.amount} onClick={handleSave}>
            {saving ? 'Conciliando…' : 'Conciliar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Marca un movimiento que no lleva registro en tesorería (comisión, intereses, traspaso). */
export function IgnoreLineDialog({ line, onClose, onDone }: DialogProps) {
  const [reason, setReason] = useState<string>(BANK_LINE_IGNORE_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await ignoreBankLineAction(line.id, { reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Listo');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento sin registro en libros</DialogTitle>
          <DialogDescription>Queda explicado en la cuadratura. Si corresponde, regístralo también en Contabilidad (por ejemplo, una comisión como gasto bancario).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LineSummary line={line} />
          <div>
            <Label htmlFor="ignore-reason">Motivo</Label>
            <select id="ignore-reason" className={nativeSelectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {BANK_LINE_IGNORE_REASONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ignore-detail">Detalle (opcional)</Label>
            <Input id="ignore-detail" value={detail} maxLength={150} onChange={(e) => setDetail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Confirmar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
