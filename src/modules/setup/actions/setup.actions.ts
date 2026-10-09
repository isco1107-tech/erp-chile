'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import type { SetupReadinessReport } from '@/lib/setup/readiness';
import { getCompanySetupReadiness } from '../services/setup.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

/**
 * Checklist "Primeros pasos" para el asistente de bienvenida. Lo abre el
 * Dueño (quien puede editar la empresa); el resultado igual se filtra por los
 * permisos reales de quien llama, así que nunca devuelve pasos que no pueda abrir.
 */
export async function getSetupReadinessAction(): Promise<ActionResult<SetupReadinessReport>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true, data: await getCompanySetupReadiness(session) };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'setup', companyId });
    return { success: false, error: 'No se pudo revisar el avance de la configuración. Inténtalo de nuevo en unos segundos.' };
  }
}
