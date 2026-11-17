'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertModuleEnabled, authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { parseScaleLabelFormat, scaleLabelFormatSchema, type ScaleLabelFormat } from '@/lib/pos/scale-label';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/** Apagado (`enabled: false`) o encendido con su formato completo. */
const updateScaleLabelSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), format: scaleLabelFormatSchema }).strict(),
]);

/** Formato de las etiquetas de balanza de la empresa (`null` = la caja no las lee). */
export async function getScaleLabelFormatAction(): Promise<ActionResult<ScaleLabelFormat | null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    assertModuleEnabled(session, 'hasPos');
    companyId = session.companyId;
    const settings = await prisma.companySettings.findFirst({
      where: { companyId: session.companyId },
      select: { scaleLabelFormat: true },
    });
    return { success: true, data: parseScaleLabelFormat(settings?.scaleLabelFormat) };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'pos', companyId, extra: { action: 'getScaleLabelFormat' } });
    return { success: false, error: 'No se pudo leer el formato de etiquetas de balanza' };
  }
}

/**
 * Guarda cómo imprime la balanza sus etiquetas. Es configuración de la
 * empresa (`settings:company`): cambia lo que todas las cajas entienden al
 * escanear. No cambia precios ni stock: solo qué producto y cuánta cantidad
 * agrega la caja al leer una etiqueta.
 */
export async function updateScaleLabelFormatAction(input: unknown): Promise<ActionResult<ScaleLabelFormat | null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    assertModuleEnabled(session, 'hasPos');
    companyId = session.companyId;
    const parsed = updateScaleLabelSchema.safeParse(input);
    if (!parsed.success) {
      // Solo los mensajes propios del formato (en español); un cuerpo mal armado recibe uno genérico.
      const issue = parsed.error.issues[0];
      const own = issue && issue.path[0] === 'format' && issue.code !== 'unrecognized_keys' && issue.code !== 'invalid_type';
      return { success: false, error: own ? issue.message : 'Formato de etiqueta inválido' };
    }

    const format = parsed.data.enabled ? parsed.data.format : null;
    const value: Prisma.InputJsonValue | typeof Prisma.DbNull = format ? (format as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    const settings = await prisma.companySettings.upsert({
      where: { companyId: session.companyId },
      update: { scaleLabelFormat: value },
      create: { companyId: session.companyId, scaleLabelFormat: value },
      select: { id: true },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: settings.id,
      metadata: { changes: { scaleLabelFormat: format } },
    });
    revalidatePath('/dashboard/settings/company');
    revalidatePath('/dashboard/pos');
    revalidatePath('/pos');
    return {
      success: true,
      data: format,
      message: format
        ? 'Formato de etiquetas de balanza guardado. Las cajas lo usan al volver a abrir la pantalla de venta.'
        : 'Lectura de etiquetas de balanza desactivada',
    };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'pos', companyId, extra: { action: 'updateScaleLabelFormat' } });
    return { success: false, error: 'No se pudo guardar el formato de etiquetas de balanza' };
  }
}
