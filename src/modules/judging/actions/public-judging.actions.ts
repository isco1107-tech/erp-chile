'use server';

import { headers } from 'next/headers';
import type { ScoreSheet } from '@prisma/client';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { submitScoreSchema } from '../schema';
import * as judgingService from '../services/judging.service';
import type { JudgeContext } from '../services/judging.service';
import { getClientIp } from '@/lib/security/cloudflare';

/**
 * Acciones públicas del jurado: sin `requireAuthWithPermission`, porque el
 * jurado no es un `User` del ERP (ver `JudgeAssignment` en el schema) — el
 * `accessToken` que manda el cliente ES la autenticación completa acá,
 * validado adentro de cada función de `judging.service.ts` contra la fila de
 * `JudgeAssignment`. Nunca aceptan `companyId`/`projectId` del cliente: todo
 * se resuelve desde el token.
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : toFriendlyErrorMessage(error);
}

export async function getJudgeContextAction(accessToken: string): Promise<ActionResult<JudgeContext>> {
  try {
    const context = await judgingService.getJudgeContextByToken(accessToken);
    if (!context) return { success: false, error: 'Link de jurado inválido o expirado' };
    return { success: true, data: context };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveDraftScoreAction(accessToken: string, input: unknown): Promise<ActionResult<ScoreSheet>> {
  try {
    const parsed = submitScoreSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await judgingService.saveDraftScore(accessToken, parsed.data);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function submitScoreAction(accessToken: string, input: unknown): Promise<ActionResult<ScoreSheet>> {
  try {
    const parsed = submitScoreSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const hdrs = await headers();
    const ipAddress = getClientIp(hdrs);
    const userAgent = hdrs.get('user-agent');
    const data = await judgingService.submitScore(accessToken, parsed.data, { ipAddress, userAgent });
    // Sin sesión de usuario ERP: se registra con el nombre del jurado como
    // identificador, no un `userId` (no existe uno). Es la única acción del
    // flujo público que se audita — el borrador se puede reintentar sin
    // límite, pero un envío bloqueado sí debe quedar rastreado.
    const context = await judgingService.getJudgeContextByToken(accessToken);
    if (context) {
      await createAuditLog({
        companyId: context.judgeAssignment.companyId,
        userEmail: context.judgeAssignment.judgeEmail ?? `jurado:${context.judgeAssignment.judgeName}`,
        action: 'UPDATE',
        entity: 'ScoreSheet',
        entityId: data.id,
        metadata: { candidateId: data.candidateId, categoryId: data.categoryId, score: data.score, judgeName: context.judgeAssignment.judgeName },
      });
    }
    return { success: true, data, message: 'Puntaje enviado — ya no se puede editar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
