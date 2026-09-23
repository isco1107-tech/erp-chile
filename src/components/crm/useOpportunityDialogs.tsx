'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { CrmLookups } from '@/modules/crm/actions/crm.actions';
import { EMPTY_OPPORTUNITY, OpportunityFormDialog, detailToForm, type OpportunityFormValues } from './OpportunityFormDialog';
import { OpportunityDetailDialog } from './OpportunityDetailDialog';

/**
 * Formulario y detalle de oportunidad, compartidos por el tablero, la lista
 * y la agenda: las tres vistas abren el mismo negocio de la misma forma.
 */
export function useOpportunityDialogs({ lookups, canWrite, onChanged }: { lookups: CrmLookups | null; canWrite: boolean; onChanged: () => void }): {
  openNew: (preset?: Partial<OpportunityFormValues>) => void;
  openDetail: (id: string) => void;
  dialogs: ReactNode;
} {
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [formInitial, setFormInitial] = useState<OpportunityFormValues>(EMPTY_OPPORTUNITY);
  const [detailId, setDetailId] = useState<string | null>(null);

  const openForm = useCallback((initial: OpportunityFormValues) => {
    setFormInitial(initial);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }, []);

  const openNew = useCallback((preset?: Partial<OpportunityFormValues>) => openForm({ ...EMPTY_OPPORTUNITY, ...preset }), [openForm]);

  const dialogs = (
    <>
      {lookups && <OpportunityFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={formInitial} lookups={lookups} onSaved={onChanged} />}
      <OpportunityDetailDialog
        opportunityId={detailId}
        canWrite={canWrite}
        canConvert={lookups?.canConvert ?? false}
        onClose={() => setDetailId(null)}
        onChanged={onChanged}
        onEdit={(detail) => {
          setDetailId(null);
          openForm(detailToForm(detail));
        }}
      />
    </>
  );

  return { openNew, openDetail: setDetailId, dialogs };
}
