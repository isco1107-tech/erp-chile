import 'server-only';
import type { OfflineOperationKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';

/**
 * Registro que garantiza que una operación hecha sin conexión se aplique UNA
 * sola vez, aunque el equipo la reenvíe (se cortó la red a mitad, dos
 * pestañas, un reintento).
 *
 * Flujo: `claim` → la Server Action de siempre → `complete` o `fail`.
 * Una operación que queda en PROCESSING (el servidor se cayó justo entre la
 * acción y el registro) no se vuelve a ejecutar sola: podría haberse
 * aplicado, y duplicar una compra o un movimiento es peor que revisarla.
 */

export type ClaimResult =
  | { state: 'claimed'; operationId: string }
  | { state: 'done'; resultRef: string | null }
  | { state: 'failed'; error: string }
  | { state: 'processing' };

export async function claimOfflineOperation(
  companyId: string,
  userId: string,
  input: { idempotencyKey: string; kind: OfflineOperationKind; capturedAt: Date; retry?: boolean }
): Promise<ClaimResult> {
  try {
    const created = await prisma.offlineOperation.create({
      data: { companyId, userId, idempotencyKey: input.idempotencyKey, kind: input.kind, status: 'PROCESSING', capturedAt: input.capturedAt },
      select: { id: true },
    });
    return { state: 'claimed', operationId: created.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.offlineOperation.findFirst({
    where: { companyId, idempotencyKey: input.idempotencyKey },
    select: { id: true, kind: true, status: true, resultRef: true, error: true },
  });
  if (!existing) return { state: 'processing' };
  if (existing.kind !== input.kind) return { state: 'failed', error: 'Clave de operación repetida para otra operación' };
  if (existing.status === 'DONE') return { state: 'done', resultRef: existing.resultRef };
  if (existing.status === 'FAILED') {
    if (!input.retry) return { state: 'failed', error: existing.error ?? 'La operación fue rechazada' };
    // Reintento explícito: FAILED garantiza que no quedó aplicada. El paso a
    // PROCESSING es atómico: dos reintentos simultáneos no la ejecutan dos veces.
    const moved = await prisma.offlineOperation.updateMany({
      where: { id: existing.id, companyId, status: 'FAILED' },
      data: { status: 'PROCESSING', error: null, attempts: { increment: 1 } },
    });
    return moved.count === 1 ? { state: 'claimed', operationId: existing.id } : { state: 'processing' };
  }
  return { state: 'processing' };
}

export async function completeOfflineOperation(companyId: string, operationId: string, resultRef: string | null): Promise<void> {
  await prisma.offlineOperation.updateMany({
    where: { id: operationId, companyId, status: 'PROCESSING' },
    data: { status: 'DONE', resultRef, syncedAt: new Date(), error: null },
  });
}

export async function failOfflineOperation(companyId: string, operationId: string, error: string): Promise<void> {
  await prisma.offlineOperation.updateMany({
    where: { id: operationId, companyId, status: 'PROCESSING' },
    data: { status: 'FAILED', error: error.slice(0, 500), syncedAt: new Date() },
  });
}
