'use client';

import { useSyncExternalStore } from 'react';
import ModuleTutorial from '@/components/tutorial/ModuleTutorial';
import type { ManualHint } from '@/modules/manual/hints';
import { isTourBlockedByOnboarding, subscribeOnboardingState } from './onboarding-state';

interface TourAfterOnboardingProps {
  userId: string;
  manualHints: ManualHint[];
  companyId: string;
  /** El asistente de bienvenida se abrirá solo en esta carga (Dueño + empresa recién creada). */
  wizardMayAutoOpen: boolean;
}

/**
 * Monta el recorrido guiado solo cuando el asistente de bienvenida no está (ni
 * va a estar) abierto. Sin esto, en la primera visita se abrían los dos juntos:
 * el recorrido oscurece la pantalla y tapa el asistente.
 *
 * Mientras espera no monta `ModuleTutorial`, así que su "visto" tampoco se
 * marca: el recorrido aparece recién cuando el asistente se cierra.
 */
export default function TourAfterOnboarding({ userId, manualHints, companyId, wizardMayAutoOpen }: TourAfterOnboardingProps) {
  const blocked = useSyncExternalStore(
    subscribeOnboardingState,
    () => isTourBlockedByOnboarding(companyId, wizardMayAutoOpen),
    () => true
  );
  if (blocked) return null;
  return <ModuleTutorial userId={userId} manualHints={manualHints} />;
}
