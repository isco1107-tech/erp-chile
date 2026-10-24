'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LIABLE_PARTY_LABELS, type LiableParty } from '@/lib/inventory/shrinkage';
import { assignLiabilityAction } from '@/modules/inventory/actions/shrinkage.actions';
import type { ShrinkageRow } from '@/modules/inventory/services/shrinkage.service';

type Choice = { party: LiableParty | null; supplierId: string | null };

const encode = (choice: Choice) => (choice.party === null ? '' : choice.party === 'STORE' ? 'STORE' : `SUPPLIER:${choice.supplierId}`);
function decode(value: string): Choice {
  if (value === 'STORE') return { party: 'STORE', supplierId: null };
  if (value.startsWith('SUPPLIER:')) return { party: 'SUPPLIER', supplierId: value.slice('SUPPLIER:'.length) };
  return { party: null, supplierId: null };
}

const partyText = (party: LiableParty, supplier: { name: string } | null) => (party === 'SUPPLIER' && supplier ? supplier.name : LIABLE_PARTY_LABELS[party]);

/**
 * Quién responde por una pérdida: el estado, la sugerencia según los acuerdos
 * de la empresa y (con `inventory:write`) el selector para asignarlo. La
 * acción valida en el servidor que la pérdida y el proveedor sean de la empresa.
 */
export function LiabilityCell({ row, canEdit }: { row: Pick<ShrinkageRow, 'id' | 'productName' | 'state' | 'liability' | 'suggestion' | 'productSuppliers'>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Los proveedores del producto, más el sugerido o el asignado si no está entre ellos.
  const suppliers = [...row.productSuppliers];
  for (const extra of [row.suggestion?.supplier, row.liability?.supplier]) if (extra && !suppliers.some((entry) => entry.id === extra.id)) suppliers.push(extra);

  const save = (choice: Choice) =>
    startTransition(async () => {
      const result = await assignLiabilityAction({ movementId: row.id, party: choice.party, supplierId: choice.supplierId });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Guardado');
      router.refresh();
    });

  const current: Choice = row.liability ? { party: row.liability.party, supplierId: row.liability.supplier?.id ?? null } : { party: null, supplierId: null };
  const suggestion = row.suggestion;

  return (
    <div className="space-y-1.5">
      {row.liability ? (
        <StatusBadge tone={row.liability.party === 'STORE' ? 'neutral' : 'info'} className="max-w-full whitespace-normal break-words">
          {partyText(row.liability.party, row.liability.supplier)}
        </StatusBadge>
      ) : (
        <StatusBadge tone="warning" className="whitespace-nowrap">
          Sin asignar
        </StatusBadge>
      )}
      {row.liability?.assignedByName && <p className="text-xs break-words text-muted-foreground">Asignó {row.liability.assignedByName}</p>}
      {!row.liability && suggestion && (
        <p className="text-xs break-words text-muted-foreground">
          Sugerido: <span className="font-medium text-foreground">{partyText(suggestion.party, suggestion.supplier)}</span>
          {canEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save({ party: suggestion.party, supplierId: suggestion.supplier?.id ?? null })}
              className="ml-2 inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Confirmar
            </button>
          )}
        </p>
      )}
      {canEdit && (
        <select
          aria-label={`Quién responde por la pérdida de ${row.productName}`}
          value={encode(current)}
          disabled={pending}
          onChange={(event) => save(decode(event.target.value))}
          className="block h-8 w-full max-w-56 rounded-lg border border-border bg-card px-2 text-xs disabled:opacity-50"
        >
          <option value="">Sin asignar</option>
          <option value="STORE">{LIABLE_PARTY_LABELS.STORE}</option>
          {suppliers.length > 0 ? (
            <optgroup label="El proveedor">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={`SUPPLIER:${supplier.id}`}>
                  {supplier.name}
                </option>
              ))}
            </optgroup>
          ) : (
            <option value="SUPPLIER:" disabled>
              El proveedor (el producto no tiene proveedor asociado)
            </option>
          )}
        </select>
      )}
    </div>
  );
}
