/** Clave por empresa: quien administra dos empresas decide por separado en cada una. */
export function setupChecklistStorageKey(companyId: string): string {
  return `aether:setup-checklist:${companyId}`;
}

/** Aviso interno para que la tarjeta se actualice al ocultarla o volver a mostrarla en la misma pestaña. */
export const SETUP_CHECKLIST_CHANGE_EVENT = 'aether:setup-checklist-change';
