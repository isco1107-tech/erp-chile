'use server';

import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { calculateAndStoreF29, type F29Result } from '@/lib/chile/f29';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

const f29RequestSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

/**
 * El motor de cálculo (`calculateAndStoreF29`) ya existía en
 * `src/lib/chile/f29.ts` y se usaba solo desde el exportador de Excel — sin
 * ninguna pantalla propia, un usuario que buscara "Formulario 29" en el
 * panel no lo encontraba. Esta action lo expone para una pantalla dedicada
 * en `/dashboard/reports/f29`.
 */
export async function getF29Action(year: number, month: number): Promise<ActionResult<F29Result>> {
  try {
    const session = await requireAuthWithPermission('reports:read');
    const parsed = f29RequestSchema.safeParse({ year, month });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Período inválido' };
    const data = await calculateAndStoreF29(session.companyId, parsed.data.year, parsed.data.month);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
