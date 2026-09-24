'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getMappingBoardAction, setAccountMappingAction } from '@/modules/accounting/actions/mappings.actions';
import type { MappingBoard } from '@/modules/accounting/services/mappings.service';
import { MAPPING_DEFINITIONS, MAPPING_GROUP_LABELS, type MappingGroup } from '@/modules/accounting/mapping-definitions';

const GROUP_ORDER: MappingGroup[] = ['money', 'sales', 'purchases', 'taxes', 'people', 'events', 'results'];

export default function MappingsClient({ canEdit }: { canEdit: boolean }) {
  const [board, setBoard] = useState<MappingBoard | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getMappingBoardAction();
    if (result.success) setBoard(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsByKey = useMemo(() => new Map((board?.rows ?? []).map((row) => [row.key, row])), [board]);

  async function change(key: string, accountId: string) {
    if (!accountId) return;
    setSavingKey(key);
    try {
      const result = await setAccountMappingAction({ key, accountId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Actualizado');
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  if (!board) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Cada venta, compra, pago, liquidación de sueldo, boleta de honorarios o rendición genera su asiento solo. Acá decides a qué cuenta de tu plan
        va cada concepto. Un cambio aplica a los asientos que se generen desde ese momento; los ya contabilizados no se tocan.
      </p>
      {GROUP_ORDER.map((group) => {
        const definitions = MAPPING_DEFINITIONS.filter((definition) => definition.group === group);
        return (
          <section key={group} className="rounded-xl border border-border">
            <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{MAPPING_GROUP_LABELS[group]}</h2>
            <ul className="divide-y divide-border">
              {definitions.map((definition) => {
                const row = rowsByKey.get(definition.key);
                const options = board.accounts.filter((account) => definition.allowedTypes.includes(account.type));
                return (
                  <li key={definition.key} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_minmax(260px,340px)] md:items-center">
                    <div>
                      <p className="text-sm font-medium">
                        {definition.label}
                        {!row?.accountId && (
                          <StatusBadge tone="neutral" className="ml-2">
                            Se crea al primer uso
                          </StatusBadge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{definition.description}</p>
                    </div>
                    {canEdit ? (
                      <select
                        aria-label={`Cuenta para ${definition.label}`}
                        className={nativeSelectClass}
                        value={row?.accountId ?? ''}
                        disabled={savingKey === definition.key}
                        onChange={(event) => void change(definition.key, event.target.value)}
                      >
                        {!row?.accountId && <option value="">Cuenta sugerida por el sistema</option>}
                        {options.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm tabular-nums">{row?.accountCode ? `${row.accountCode} — ${row.accountName}` : 'Cuenta sugerida por el sistema'}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
