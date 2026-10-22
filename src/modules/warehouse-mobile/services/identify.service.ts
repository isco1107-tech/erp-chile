import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException, captureMessage } from '@/lib/observability';
import {
  BUDGET_WINDOW_MS,
  evaluateVisionBudget,
  visionBudgetFromEnv,
  visionEnabledFromEnv,
  type BudgetScope,
  type VisionRunRow,
  type VisionRunStatus,
} from '@/lib/warehouse-mobile/budget';
import { normalizeVisionRead } from '@/lib/warehouse-mobile/vision';
import type { IdentifyResponse, VisionRead } from '../types';
import { findByCode, matchByText } from './catalog.service';
import { prepareJpeg } from './image.service';
import { readProductPhoto, visionConfigured, VisionRateLimitedError, VisionUnavailableError } from './vision.service';

/**
 * Identificar un producto por foto, gastando la menor cantidad posible de IA.
 *
 * Orden, de más barato a más caro (el celular ya probó antes con el código de
 * barras de la cámara, que no cuesta nada):
 *   1. La misma foto ya leída antes (reintento, cola sin señal) → se responde de caché.
 *   2. ¿Hay cupo? Se reserva una lectura en la base de datos bajo un candado, así
 *      que el tope vale aunque haya muchas instancias del servidor a la vez.
 *   3. Una sola llamada a la IA.
 *   4. El cruce con el catálogo no usa IA: es texto contra texto.
 *
 * Si no hay cupo, NO se espera dentro de la solicitud (una función serverless
 * dormida cuesta y se corta): se responde `busy` con cuándo volver, y la app
 * guarda la foto y reintenta sola mientras el bodeguero sigue trabajando.
 */

/** Número fijo del candado que serializa las decisiones de cupo (cualquier entero estable). */
const BUDGET_LOCK_KEY = 7_302_026;

/** Cuánto se conservan las lecturas (caché y libro de uso). */
const RETENTION_DAYS = 30;

interface Actor {
  companyId: string;
  userId: string;
}

function unavailable(message: string): IdentifyResponse {
  return { status: 'unavailable', candidates: [], read: null, cached: false, message };
}

function busyMessage(scope: BudgetScope): string {
  switch (scope) {
    case 'user':
    case 'company':
      return 'Estás mandando fotos muy seguido. La foto quedó en espera y se identificará sola en un momento.';
    case 'cooldown':
    case 'platform':
      return 'La identificación por foto tiene mucha demanda ahora. La foto quedó en espera y se identificará sola en un momento.';
    case 'daily':
      return 'Tu empresa llegó al límite diario de fotos identificadas. Busca el producto por código o por nombre.';
  }
}

/** Cruza lo que se leyó con el catálogo: primero por código (exacto), luego por texto. */
async function resolveRead(companyId: string, read: VisionRead | null, warehouseId: string | undefined, cached: boolean): Promise<IdentifyResponse> {
  if (!read) {
    return { status: 'unreadable', candidates: [], read: null, cached, message: 'No se alcanzó a leer el producto. Acércate, mejora la luz y vuelve a sacar la foto.' };
  }

  if (read.barcode) {
    const byCode = await findByCode(companyId, read.barcode, warehouseId);
    if (byCode) return { status: 'matched', candidates: [byCode], read, cached };
  }

  if (!read.name && !read.brand) return { status: 'new', candidates: [], read, cached };

  const { decision, candidates } = await matchByText(companyId, { name: read.name, brand: read.brand, variant: read.variant, netContent: read.netContent }, warehouseId);
  return { status: decision, candidates, read, cached };
}

async function recordFinished(id: string, companyId: string, status: VisionRunStatus, data: { model?: string; raw?: unknown }): Promise<void> {
  try {
    await prisma.productPhotoScan.updateMany({
      where: { id, companyId },
      data: {
        status,
        model: data.model,
        result: data.raw === undefined ? undefined : (JSON.parse(JSON.stringify(data.raw)) as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    captureException(error, { module: 'bodega-movil', companyId, extra: { reason: 'vision-record' } });
  }
}

/** Borra lecturas viejas de vez en cuando (sin cron propio): no importa cuál request lo haga. */
function maybePurge(): void {
  if (Math.random() > 0.02) return;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
  void prisma.productPhotoScan.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch((error: unknown) => {
    captureException(error, { module: 'bodega-movil', extra: { reason: 'vision-purge' } });
  });
}

export function imageDigest(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** ¿Está disponible la lectura por foto en este servidor? (Para la pantalla de inicio de la app.) */
export function visionAvailable(): boolean {
  return visionEnabledFromEnv() && visionConfigured();
}

export async function identifyPhoto(actor: Actor, bytes: Uint8Array, warehouseId?: string): Promise<IdentifyResponse> {
  if (!visionEnabledFromEnv()) return unavailable('La identificación por foto está desactivada. Busca el producto por código o por nombre.');
  if (!visionConfigured()) return unavailable('La identificación por foto no está configurada en este servidor. Busca el producto por código o por nombre.');

  const { companyId, userId } = actor;
  const sha = imageDigest(bytes);

  // 1. Misma foto ya leída: no gasta IA.
  const previous = await prisma.productPhotoScan.findFirst({
    where: { companyId, imageSha256: sha, status: 'DONE' },
    orderBy: { createdAt: 'desc' },
    select: { result: true },
  });
  if (previous) return resolveRead(companyId, normalizeVisionRead(previous.result), warehouseId, true);

  // Se prepara la foto ANTES de reservar cupo: una imagen ilegible no debe gastar una lectura.
  const jpeg = await prepareJpeg(bytes);

  // 2. Cupo: la decisión y la reserva ocurren juntas, bajo un candado, para que
  //    dos solicitudes simultáneas no vean el mismo cupo libre.
  const config = visionBudgetFromEnv();
  const now = Date.now();
  const reservation = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${BUDGET_LOCK_KEY})::text AS locked`;
    const since = new Date(now - Math.max(BUDGET_WINDOW_MS, config.cooldownAfterLimitMs));
    const [rows, companyDailyCount] = await Promise.all([
      tx.productPhotoScan.findMany({ where: { createdAt: { gt: since } }, select: { createdAt: true, status: true, companyId: true, userId: true }, take: 1000 }),
      tx.productPhotoScan.count({ where: { companyId, createdAt: { gt: new Date(now - 24 * 60 * 60_000) } } }),
    ]);
    const recent: VisionRunRow[] = rows.map((row) => ({
      createdAt: row.createdAt.getTime(),
      status: row.status as VisionRunStatus,
      companyId: row.companyId,
      userId: row.userId,
    }));
    const decision = evaluateVisionBudget({ now, recent, companyId, userId, companyDailyCount, config });
    if (!decision.allowed) return { reserved: false, decision } as const;
    const created = await tx.productPhotoScan.create({ data: { companyId, userId, imageSha256: sha, status: 'RUNNING' }, select: { id: true } });
    return { reserved: true, id: created.id } as const;
  });

  if (!reservation.reserved) {
    if (reservation.decision.allowed) throw new Error('Decisión de cupo inconsistente');
    const { scope, retryAfterMs } = reservation.decision;
    if (scope === 'daily') return unavailable(busyMessage(scope));
    return { status: 'busy', candidates: [], read: null, cached: false, retryAfterMs, message: busyMessage(scope) };
  }

  maybePurge();

  // 3. Una llamada a la IA.
  try {
    const { raw, model } = await readProductPhoto(jpeg);
    await recordFinished(reservation.id, companyId, 'DONE', { model, raw });
    return resolveRead(companyId, normalizeVisionRead(raw), warehouseId, false);
  } catch (error) {
    if (error instanceof VisionRateLimitedError) {
      await recordFinished(reservation.id, companyId, 'LIMITED', {});
      captureMessage('Gemini respondió 429 a la lectura de fotos de bodega: se frena la lectura por el período de enfriamiento', 'warn', { module: 'bodega-movil', companyId });
      return {
        status: 'busy',
        candidates: [],
        read: null,
        cached: false,
        retryAfterMs: visionBudgetFromEnv().cooldownAfterLimitMs,
        message: busyMessage('cooldown'),
      };
    }
    await recordFinished(reservation.id, companyId, 'FAILED', {});
    if (error instanceof VisionUnavailableError) {
      return { status: 'busy', candidates: [], read: null, cached: false, retryAfterMs: 15_000, message: 'La IA no respondió. Se reintentará sola; mientras, puedes buscar el producto a mano.' };
    }
    captureException(error, { module: 'bodega-movil', companyId, extra: { reason: 'vision-call' } });
    return { status: 'busy', candidates: [], read: null, cached: false, retryAfterMs: 20_000, message: 'No se pudo identificar la foto por ahora. Se reintentará sola; mientras, puedes buscar el producto a mano.' };
  }
}
