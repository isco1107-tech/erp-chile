'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { createProducerAction } from '@/modules/consignment/actions/consignment.actions';
import type { ProducerRow } from '@/modules/consignment/services/consignment.service';
import { COMMISSION_BASE_LABEL, formatBps, formatCurrency, percentToBps } from './format';

interface Props {
  producers: ProducerRow[];
  pendingByProducer: Record<string, number>;
  candidates: { id: string; name: string; rut: string }[];
  canWrite: boolean;
}

export default function ProducersClient({ producers, pendingByProducer, candidates, canWrite }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contactId, setContactId] = useState('');
  const [percent, setPercent] = useState('20');
  const [base, setBase] = useState<'NET' | 'GROSS'>('NET');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const bps = percentToBps(percent);
    if (bps === null) {
      toast.error('Escribe la comisión como un porcentaje, por ejemplo 20 o 12,5');
      return;
    }
    setBusy(true);
    const result = await createProducerAction({ contactId, defaultCommissionBps: bps, commissionBase: base });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Productor creado');
    setCreating(false);
    setContactId('');
    router.push(`/dashboard/consignment/producers/${result.data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating((value) => !value)} variant={creating ? 'outline' : 'default'}>
            <Plus className="size-4" aria-hidden="true" /> {creating ? 'Cancelar' : 'Nuevo productor'}
          </Button>
        </div>
      )}

      {creating && (
        <form onSubmit={submit} className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="producer-contact">Contacto proveedor</Label>
            <select id="producer-contact" className={nativeSelectClass} value={contactId} onChange={(e) => setContactId(e.target.value)} required>
              <option value="">Selecciona un proveedor…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.rut})
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay proveedores disponibles. Crea primero al productor como contacto proveedor en Contactos.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="producer-commission">Comisión por defecto (%)</Label>
            <Input id="producer-commission" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="producer-base">Base de la comisión</Label>
            <select id="producer-base" className={nativeSelectClass} value={base} onChange={(e) => setBase(e.target.value as 'NET' | 'GROSS')}>
              <option value="NET">{COMMISSION_BASE_LABEL.NET}</option>
              <option value="GROSS">{COMMISSION_BASE_LABEL.GROSS}</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <Button type="submit" disabled={busy || !contactId}>
              {busy ? 'Creando…' : 'Crear productor'}
            </Button>
          </div>
        </form>
      )}

      {producers.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden="true" />}
          title="Aún no hay productores"
          description="Registra a quien deja productos en consignación para devengar sus ventas y liquidarle lo que se le debe."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Productor</th>
                <th className="px-4 py-2.5 font-medium">Comisión</th>
                <th className="px-4 py-2.5 text-right font-medium">Productos</th>
                <th className="px-4 py-2.5 text-right font-medium">Pendiente de liquidar</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {producers.map((producer) => (
                <tr key={producer.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/consignment/producers/${producer.id}`} className="font-medium text-foreground hover:underline">
                      {producer.contactName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{producer.contactRut}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatBps(producer.defaultCommissionBps)}
                    <p className="text-xs text-muted-foreground">{COMMISSION_BASE_LABEL[producer.commissionBase]}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{producer.productCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(pendingByProducer[producer.id] ?? 0)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={producer.isActive ? 'success' : 'neutral'}>{producer.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
