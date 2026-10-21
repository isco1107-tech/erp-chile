'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Plus } from 'lucide-react';
import type { ConsignmentSettlementStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import type { Tone } from '@/components/ui/tone';
import { buildSettlementAction } from '@/modules/consignment/actions/consignment.actions';
import type { SettlementRow } from '@/modules/consignment/services/settlement.service';
import { formatCurrency, formatDay } from './format';

export const SETTLEMENT_STATUS: Record<ConsignmentSettlementStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmada, por pagar', tone: 'warning' },
  PAID: { label: 'Pagada', tone: 'success' },
};

interface Props {
  settlements: SettlementRow[];
  producers: { id: string; name: string }[];
  canWrite: boolean;
}

export default function SettlementsClient({ settlements, producers, canWrite }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [producerId, setProducerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function build(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await buildSettlementAction({ producerId, from, to });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Liquidación creada');
    router.push(`/dashboard/consignment/settlements/${result.data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen((value) => !value)} variant={open ? 'outline' : 'default'}>
            <Plus className="size-4" aria-hidden="true" /> {open ? 'Cancelar' : 'Armar liquidación'}
          </Button>
        </div>
      )}

      {open && (
        <form onSubmit={build} className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-producer">Productor</Label>
            <select id="st-producer" className={nativeSelectClass} value={producerId} onChange={(e) => setProducerId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-from">Desde</Label>
            <Input id="st-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-to">Hasta (incluido)</Label>
            <Input id="st-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !producerId || !from || !to}>
              {busy ? 'Armando…' : 'Armar borrador'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-4">
            Toma las ventas del productor emitidas en esas fechas (hora de Chile) que aún no están en ninguna liquidación, descontando devoluciones y anulaciones.
          </p>
        </form>
      )}

      {settlements.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" aria-hidden="true" />} title="Aún no hay liquidaciones" description="Arma una liquidación para el período que quieras pagarle al productor." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Productor</th>
                <th className="px-4 py-2.5 font-medium">Período</th>
                <th className="px-4 py-2.5 text-right font-medium">Vendido (neto)</th>
                <th className="px-4 py-2.5 text-right font-medium">Comisión</th>
                <th className="px-4 py-2.5 text-right font-medium">A pagar (con IVA)</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => {
                const badge = SETTLEMENT_STATUS[s.status];
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/consignment/settlements/${s.id}`} className="font-medium hover:underline">
                        {s.producerName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{s.lineCount} líneas</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDay(s.periodStart)} – {formatDay(s.periodEnd)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(s.totalSold)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(s.totalCommission)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(s.totalPayable)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
