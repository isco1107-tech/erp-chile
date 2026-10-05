/**
 * Estado compartido entre el asistente de bienvenida (`OnboardingWizard`) y el
 * recorrido guiado (`ModuleTutorial`): los dos se abrían a la vez en la primera
 * visita y se tapaban entre sí. El recorrido espera a que el asistente se cierre
 * (ver `TourAfterOnboarding`).
 */

export function onboardingStorageKey(companyId: string): string {
  return `onboarding-dismissed:${companyId}`;
}

export function isOnboardingDismissed(companyId: string): boolean {
  try {
    return window.localStorage.getItem(onboardingStorageKey(companyId)) === '1';
  } catch {
    // Storage no disponible (navegación privada estricta, etc): se asume no descartado.
    return false;
  }
}

const CHANGE_EVENT = 'aether:onboarding-state-change';

let wizardOpen = false;
let wizardClosedThisSession = false;

/** Lo llama el asistente al abrirse y al cerrarse. */
export function setOnboardingWizardOpen(open: boolean): void {
  wizardOpen = open;
  if (!open) wizardClosedThisSession = true;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeOnboardingState(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * ¿Hay que esperar al asistente antes de mostrar el recorrido? Sí si está
 * abierto, o si va a abrirse solo (empresa elegible, no descartado antes, y
 * todavía no se cerró en esta sesión).
 */
export function isTourBlockedByOnboarding(companyId: string, wizardMayAutoOpen: boolean): boolean {
  if (wizardOpen) return true;
  return wizardMayAutoOpen && !wizardClosedThisSession && !isOnboardingDismissed(companyId);
}
