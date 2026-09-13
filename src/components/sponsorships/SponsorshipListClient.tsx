'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Banknote, Repeat } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  listSponsorshipContractsAction,
  updateSponsorshipContractAction,
} from '@/modules/sponsorships/actions/sponsorships.actions';
import {
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TIER_LABELS,
} from '@/modules/sponsorships/schema';
import type { SponsorshipContractWithRelations } from '@/modules/sponsorships/services/sponsorships.service';
import { formatCurrency } from '@/lib/chile/tax';
import DeleteSponsorshipContractButton from './DeleteSponsorshipContractButton';

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
};

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  UNPAID: 'bg-destructive/10 text-destructive',
  PARTIAL: 'bg-amber-500/10 text-amber-600',
  PAID: 'bg-green-600/10 text-green-600',
};

const COLUMN_ACCENT: Record<string, string> = {
  PROPOSAL: 'border-t-muted-foreground/40',
  CONFIRMED: 'border-t-blue-500',
  COMPLETED: 'border-t-green-500',
  CANCELLED: 'border-t-destructive',
};

const selectClass =
  'h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-0.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/**
 * Tablero Kanban simple: una columna por `SponsorshipStatus`. La tarjeta
 * separa visualmente el aporte en efectivo (ícono verde) del canje/barter
 * (ícono azul) — un contrato mixto muestra ambos.
 */
export default function SponsorshipListClient({ canWrite }: { canWrite: boolean }) {
  const [contracts, setContracts] = useState<SponsorshipContractWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await listSponsorshipContractsAction();
    if (result.success) setContracts(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStatusChange(id: string, status: (typeof SPONSORSHIP_STATUSES)[number]) {
    setBusyId(id);
    try {
      const result = await updateSponsorshipContractAction(id, { status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Estado actualizado');
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Link href="/dashboard/sponsorships/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
            Nuevo Contrato de Auspicio
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && contracts.length === 0 && (
        <EmptyState
          title="Todavía no hay contratos de auspicio"
          description="Registra el primer contrato con una marca para verlo aquí."
          action={
            canWrite ? (
              <Link href="/dashboard/sponsorships/new" className={buttonVariants({ size: 'sm' })}>
                Nuevo Contrato de Auspicio
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SPONSORSHIP_STATUSES.map((status) => {
            const columnContracts = contracts.filter((c) => c.status === status);
            return (
              <div
                key={status}
                className={`space-y-2 rounded-xl border border-t-4 border-border bg-muted/20 p-3 ${COLUMN_ACCENT[status]}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{SPONSORSHIP_STATUS_LABELS[status]}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {columnContracts.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {columnContracts.map((contract) => (
                    <div
                      key={contract.id}
                      className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm transition-colors hover:border-primary/40"
                    >
                      <Link href={`/dashboard/sponsorships/${contract.id}`} className="block">
                        <p className="font-medium">{contract.contact.razonSocial}</p>
                        <p className="text-xs text-muted-foreground">{SPONSORSHIP_TIER_LABELS[contract.tier]}</p>

                        <div className="mt-2 space-y-1 text-xs">
                          {contract.cashAmount > 0 && (
                            <p className="inline-flex items-center gap-1 text-foreground">
                              <Banknote className="size-3.5 text-green-600" /> {formatCurrency(contract.cashAmount)}
                            </p>
                          )}
                          {contract.isBarter && (
                            <p className="inline-flex items-center gap-1 text-foreground">
                              <Repeat className="size-3.5 text-blue-600" /> Canje: {formatCurrency(contract.barterValuation)}
                            </p>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          {contract.cashAmount > 0 ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PAYMENT_STATUS_BADGE[contract.paymentStatus]}`}
                            >
                              {PAYMENT_STATUS_LABEL[contract.paymentStatus]}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Sin componente en efectivo</span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {contract.deliverables.filter((d) => d.isCompleted).length}/{contract.deliverables.length} entregables
                          </span>
                        </div>
                      </Link>

                      {canWrite && (
                        <div className="mt-2 flex items-center gap-1">
                          <select
                            value={contract.status}
                            disabled={busyId === contract.id}
                            onChange={(e) => handleStatusChange(contract.id, e.target.value as (typeof SPONSORSHIP_STATUSES)[number])}
                            className={selectClass}
                          >
                            {SPONSORSHIP_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {SPONSORSHIP_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <DeleteSponsorshipContractButton
                            contractId={contract.id}
                            contactName={contract.contact.razonSocial}
                            variant="icon"
                            onDeleted={load}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {columnContracts.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Sin contratos
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
