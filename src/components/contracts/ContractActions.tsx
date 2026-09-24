'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pause, Pencil, Play, Receipt, Square, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { billContractNowAction, deleteContractAction, setContractStatusAction } from '@/modules/contracts/actions/contracts.actions';

interface Props {
  contractId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  canBill: boolean;
  hasBillings: boolean;
  nextPeriodLabel: string;
}

export default function ContractActions({ contractId, status, canBill, hasBillings, nextPeriodLabel }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ success: boolean; error?: string; message?: string }>, after?: () => void) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo completar');
        return;
      }
      toast.success(result.message ?? 'Listo');
      after?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function billNow() {
    const ok = await confirm({
      title: `¿Facturar ahora el período ${nextPeriodLabel}?`,
      description: 'Se genera el documento de este período sin esperar la fecha programada; el siguiente queda para el período que sigue.',
      confirmLabel: 'Facturar',
    });
    if (ok) await run(() => billContractNowAction(contractId));
  }

  async function end() {
    const ok = await confirm({ title: '¿Terminar este contrato?', description: 'No volverá a facturar. Su historial se conserva.', confirmLabel: 'Terminar contrato' });
    if (ok) await run(() => setContractStatusAction(contractId, { status: 'ENDED' }));
  }

  async function remove() {
    const ok = await confirm({ title: '¿Eliminar este contrato?', description: 'Solo es posible porque nunca facturó.', confirmLabel: 'Eliminar' });
    if (ok) await run(() => deleteContractAction(contractId), () => router.push('/dashboard/contracts'));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'ACTIVE' && canBill && (
        <Button type="button" disabled={busy} onClick={() => void billNow()}>
          <Receipt aria-hidden="true" /> Facturar ahora
        </Button>
      )}
      {status !== 'ENDED' && (
        <Link href={`/dashboard/contracts/${contractId}/edit`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil aria-hidden="true" /> Editar
        </Link>
      )}
      {status === 'ACTIVE' && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => setContractStatusAction(contractId, { status: 'PAUSED' }))}>
          <Pause aria-hidden="true" /> Pausar
        </Button>
      )}
      {status === 'PAUSED' && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => setContractStatusAction(contractId, { status: 'ACTIVE' }))}>
          <Play aria-hidden="true" /> Reanudar
        </Button>
      )}
      {status !== 'ENDED' && (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void end()}>
          <Square aria-hidden="true" /> Terminar
        </Button>
      )}
      {!hasBillings && (
        <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => void remove()}>
          <Trash2 aria-hidden="true" /> Eliminar
        </Button>
      )}
    </div>
  );
}
