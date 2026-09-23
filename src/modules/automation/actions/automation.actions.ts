'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import * as automationHealthService from '../services/automation-health.service';
import type { ScheduledAutomationRow } from '../services/automation-health.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function getScheduledAutomationsHealthAction(): Promise<ActionResult<ScheduledAutomationRow[]>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const data = await automationHealthService.getScheduledAutomationsHealth(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? 'No se pudo cargar el estado de las automatizaciones' };
  }
}
