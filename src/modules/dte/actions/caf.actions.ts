'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import * as cafService from '../services/caf.service';
import type { FolioAvailability, UploadCafResult } from '../services/caf.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/**
 * Los errores de CAF llevan mensajes escritos para el usuario final ("este CAF
 * es de otro RUT"), así que se propagan tal cual. Cualquier otro error se
 * reporta a observabilidad y se reemplaza por un texto genérico: un stack de
 * Prisma en pantalla no ayuda a nadie y filtra estructura interna.
 */
function toErrorMessage(error: unknown, context: Record<string, unknown>): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof cafService.CafError) return error.message;

  captureException(error, { module: 'dte', ...context });
  return 'No se pudo completar la operación con los folios';
}

/**
 * Tamaño máximo de un CAF. Los archivos reales del SII rondan los 2-4 KB; el
 * tope es holgado y solo existe para que no se pueda mandar un archivo enorme
 * a parsear.
 */
const MAX_CAF_BYTES = 64 * 1024;

const uploadCafSchema = z.object({
  xml: z
    .string()
    .min(1, 'Adjunta el archivo XML del CAF')
    .max(MAX_CAF_BYTES, 'El archivo es demasiado grande para ser un CAF del SII'),
});

/** Carga un CAF descargado del portal del SII. */
export async function uploadCafAction(input: { xml: string }): Promise<ActionResult<UploadCafResult>> {
  try {
    const session = await requireAuthWithPermission('dte:manage_caf');
    const parsed = uploadCafSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Archivo inválido' };
    }

    const result = await cafService.uploadCaf(session.companyId, session.id, parsed.data.xml);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'DteCaf',
      entityId: result.id,
      metadata: {
        dteType: result.dteType,
        rangeFrom: result.rangeFrom,
        rangeTo: result.rangeTo,
        folios: result.folios,
      },
    });

    revalidatePath('/dashboard/settings/folios');
    return {
      success: true,
      data: result,
      message: `CAF cargado: ${result.folios} folios disponibles (${result.rangeFrom}–${result.rangeTo})`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'uploadCaf' }) };
  }
}

/** Disponibilidad de folios por tipo de documento. */
export async function getFolioAvailabilityAction(): Promise<ActionResult<FolioAvailability[]>> {
  try {
    const session = await requireAuthWithPermission('dte:manage_caf');
    const availability = await cafService.getFolioAvailability(session.companyId);
    return { success: true, data: availability };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'getFolioAvailability' }) };
  }
}

/**
 * Marca un rango como revocado.
 *
 * No borra la fila a propósito: los documentos ya emitidos con ese CAF
 * conservan `cafId` y necesitan el bloque para poder revalidar su timbre años
 * después. Revocar solo impide que se sigan asignando folios de ese rango.
 */
export async function revokeCafAction(cafId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('dte:manage_caf');

    const updated = await prisma.dteCaf.updateMany({
      where: { id: cafId, companyId: session.companyId },
      data: { status: 'REVOKED' },
    });
    if (updated.count === 0) {
      return { success: false, error: 'El rango de folios no existe o no pertenece a tu empresa' };
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'DteCaf',
      entityId: cafId,
      metadata: { status: 'REVOKED' },
    });

    revalidatePath('/dashboard/settings/folios');
    return { success: true, data: null, message: 'Rango revocado: no se asignarán más folios de este CAF' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'revokeCaf' }) };
  }
}
