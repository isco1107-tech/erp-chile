import 'server-only';

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { PRIVATE_REF_PREFIX } from '@/lib/security/blob-url';
import { getPrivate, privateStorageConfigured, putPrivate } from '@/lib/storage/blob';
import { empresaEliminadaSupersuite } from '@/lib/supersuite';
import {
  buildResetPlan,
  collectRealDataSignals,
  confirmationMatches,
  countRows,
  loadSchemaFacts,
  runReset,
  type ErasureMode,
  type RealDataSignal,
} from '@/lib/company-erasure/core';
import { deleteStoredFiles, scanStoredFileRefs, type FileDeletion, type FileScan } from '@/lib/company-erasure/files';
import {
  MAX_CODE_ATTEMPTS,
  checkConfirmation,
  erasureWindow,
  hashErasureCode,
  newErasureCode,
  whenLabel,
  type ErasureKind,
  type ErasureStatus,
} from '@/lib/company-erasure/policy';
import { backupFileName, streamCompanyBackup } from '@/modules/backup/services/company-backup.service';
import { reprovisionCompany } from '../company-reprovision';

/**
 * Reiniciar o eliminar una empresa por orden de la Supersuite (`empresa.reiniciar.*` y
 * `empresa.eliminar.*`). Es irreversible, así que:
 *
 *  1. DOS pasos. `requestErasure` cuenta lo que se borraría y entrega un código de un solo uso (en la base solo
 *     queda su SHA-256); `confirmErasure` lo trae junto con la razón social escrita. Un código equivocado o una razón
 *     social que no calza cuentan como intento y a los 5 la solicitud se cancela.
 *  2. ELIMINAR exige la empresa suspendida y una espera de 7 días entre pedirlo y confirmarlo (la ventana para
 *     confirmar dura otros 7); reactivar la empresa cancela la solicitud. Reiniciar vale 30 minutos.
 *  3. RESPALDO antes de borrar, en ambas: el JSON de `backup/` va al almacenamiento PRIVADO y se lee de vuelta para
 *     comprobar que quedó entero. Sin almacenamiento privado, o con el respaldo roto, no se borra nada.
 *  4. Solo ELIMINAR borra también los archivos subidos (fotos, adjuntos…), y solo los que llevan el id de la empresa.
 *  5. Una sola transacción: el borrado, la huella en `PlatformAuditLog` y la marca `DONE` de la solicitud confirman
 *     juntos o no confirma ninguno. Una orden reentregada después de `DONE` responde que ya estaba aplicada.
 *
 * Los datos del que borra son los de siempre: el plan sale de las llaves foráneas de la base (`core.ts`).
 */

const TX_OPTIONS = { maxWait: 30_000, timeout: 5 * 60_000 };
/** El respaldo se arma en memoria; una empresa más grande que esto se respalda a mano antes. */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
/** Estados en los que la empresa no opera: la única en la que se puede pedir eliminarla. */
const NOT_OPERATING = ['SUSPENDED', 'CANCELLED'];

const modeOf = (kind: ErasureKind): ErasureMode => (kind === 'DELETE' ? 'delete' : 'reset');
const actionLabel = (kind: ErasureKind): string => (kind === 'DELETE' ? 'eliminar' : 'reiniciar');

export interface ErasurePreview {
  /** Filas que se borrarían en total y por tabla (solo las que tienen algo). */
  rows: number;
  tables: Record<string, number>;
  /** Cosas que no parecen de prueba: exigen confirmar con `aceptoDatosReales`. */
  signals: RealDataSignal[];
}

export interface ErasureRequested {
  requestId: string;
  code: string;
  notBefore: Date;
  expiresAt: Date;
  preview: ErasurePreview;
}

/** Personas de la empresa que también administran OTRAS empresas: borrarlas les quitaría ese acceso. */
async function deleteBlockers(companyId: string): Promise<string[]> {
  const memberships = await prisma.companyMembership.findMany({
    where: { companyId: { not: companyId }, user: { companyId } },
    select: { user: { select: { email: true } } },
  });
  return [...new Set(memberships.map((membership) => membership.user.email))].sort();
}

function blockersError(emails: string[]): Error {
  return new Error(
    `No se puede eliminar: ${emails.join(', ')} ${emails.length === 1 ? 'tiene' : 'tienen'} su cuenta en esta empresa y además administra${emails.length === 1 ? '' : 'n'} otras. Revoca esos accesos (orden acceso.revocar) o cambia la empresa de la cuenta antes de eliminarla.`
  );
}

async function previewOf(companyId: string, mode: ErasureMode): Promise<{ preview: ErasurePreview; tables: string[] }> {
  const facts = await loadSchemaFacts(prisma);
  const plan = buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys, mode });
  const counts = await countRows(prisma, plan.deleteOrder, companyId);
  const signals = await collectRealDataSignals(prisma, companyId);
  return { preview: { rows: Object.values(counts).reduce((sum, n) => sum + n, 0), tables: counts, signals }, tables: Object.keys(counts) };
}

/** Paso 1: cuenta lo que se borraría y entrega el código. No borra nada. */
export async function requestErasure(input: { companyId: string; kind: ErasureKind; orderId?: number }, now: Date = new Date()): Promise<ErasureRequested> {
  const { companyId, kind } = input;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, rut: true, businessName: true, status: true } });
  if (!company) throw new Error('La empresa no existe en Aether');

  if (kind === 'DELETE') {
    if (!NOT_OPERATING.includes(company.status)) {
      throw new Error('Para eliminar una empresa primero hay que suspenderla (orden cuenta.suspender): mientras opera no se puede borrar.');
    }
    const blockers = await deleteBlockers(company.id);
    if (blockers.length > 0) throw blockersError(blockers);
  }

  const { preview } = await previewOf(company.id, modeOf(kind));
  const code = newErasureCode();
  const { notBefore, expiresAt } = erasureWindow(kind, now);
  const created = await prisma.$transaction(async (tx) => {
    // Una solicitud nueva reemplaza a la anterior: nunca hay dos códigos vivos para lo mismo.
    await tx.companyErasureRequest.updateMany({
      where: { companyId, kind, status: 'PENDING' },
      data: { status: 'CANCELLED', finishedAt: now, result: { motivo: 'reemplazada por una solicitud nueva' } },
    });
    return tx.companyErasureRequest.create({
      data: {
        companyId,
        kind,
        companyRut: company.rut,
        companyName: company.businessName,
        codeHash: hashErasureCode(code),
        requestedOrder: input.orderId ?? null,
        requestedAt: now,
        notBefore,
        expiresAt,
        preview: { rows: preview.rows, tables: preview.tables, signals: preview.signals.map((s) => `${s.count} ${s.label}`) },
      },
      select: { id: true },
    });
  });
  return { requestId: created.id, code, notBefore, expiresAt, preview };
}

export interface BackupInfo {
  /** Referencia privada (`r2private:///…`): solo el servidor la puede leer. */
  ref: string;
  bytes: number;
  sha256: string;
}

async function readBack(ref: string): Promise<{ bytes: number; sha256: string }> {
  const stored = await getPrivate(ref);
  if (!stored) throw new Error('el respaldo no se pudo leer de vuelta');
  const hash = createHash('sha256');
  let bytes = 0;
  const reader = stored.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    hash.update(value);
  }
  return { bytes, sha256: hash.digest('hex') };
}

/** Respaldo completo de la empresa al almacenamiento privado, comprobado leyéndolo de vuelta. Lanza si algo no cuadra. */
async function takeBackup(company: { id: string; rut: string; businessName: string }, now: Date): Promise<BackupInfo> {
  if (!privateStorageConfigured()) {
    throw new Error('No hay almacenamiento privado configurado (R2_PRIVATE_BUCKET_NAME y las R2_*): sin un respaldo guardado no se borra nada.');
  }
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const piece of streamCompanyBackup(company.id)) {
    const chunk = Buffer.from(piece, 'utf8');
    bytes += chunk.length;
    if (bytes > MAX_BACKUP_BYTES) {
      throw new Error('Los datos de la empresa pesan más de 200 MB y no se pueden respaldar automáticamente: descarga el respaldo a mano (Configuración → Respaldo) y usa el script reset-company-data.');
    }
    hash.update(chunk);
    chunks.push(chunk);
  }
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const stored = await putPrivate(`platform-backups/${company.id}/${stamp}-${backupFileName(company, now)}`, Buffer.concat(chunks), { contentType: 'application/json' });
  if (!stored.url.startsWith(PRIVATE_REF_PREFIX)) throw new Error('El respaldo no quedó en el almacenamiento privado: no se borra nada.');
  const sha256 = hash.digest('hex');
  const back = await readBack(stored.url);
  if (back.bytes !== bytes || back.sha256 !== sha256) throw new Error('El respaldo guardado no coincide con el original: no se borra nada.');
  return { ref: stored.url, bytes, sha256 };
}

export interface ErasureResult {
  kind: ErasureKind;
  /** `true` cuando es una orden reentregada: ya se había hecho. */
  alreadyDone: boolean;
  rows: number;
  tables: number;
  backup?: { ref: string; bytes: number; sha256: string };
  files?: { found: number; deleted: number; failed: number; notAttributed: number };
  /** Reiniciar: si se volvió a sembrar el plan de cuentas. */
  chartOfAccounts?: boolean;
}

const asResult = (request: { kind: string; result: unknown }, alreadyDone: boolean): ErasureResult => {
  const stored = (request.result ?? {}) as Partial<ErasureResult>;
  return { kind: request.kind as ErasureKind, alreadyDone, rows: stored.rows ?? 0, tables: stored.tables ?? 0, backup: stored.backup, files: stored.files, chartOfAccounts: stored.chartOfAccounts };
};

/** Un intento fallido (código o razón social): a los 5, la solicitud se cancela. */
async function registerFailedAttempt(companyId: string, kind: ErasureKind): Promise<void> {
  await prisma.companyErasureRequest.updateMany({ where: { companyId, kind, status: 'PENDING' }, data: { attempts: { increment: 1 } } });
  await prisma.companyErasureRequest.updateMany({
    where: { companyId, kind, status: 'PENDING', attempts: { gte: MAX_CODE_ATTEMPTS } },
    data: { status: 'CANCELLED', finishedAt: new Date(), result: { motivo: `${MAX_CODE_ATTEMPTS} intentos fallidos` } },
  });
}

/** Paso 2: ejecuta la solicitud. Lanza con un mensaje claro si algo no se cumple; en ese caso no se borró nada. */
export async function confirmErasure(
  input: { companyId: string; kind: ErasureKind; code: string; businessName: string; acceptRealData?: boolean },
  now: Date = new Date()
): Promise<ErasureResult> {
  const { companyId, kind } = input;
  if (!input.code.trim()) throw new Error('La orden no trae el código de la solicitud');
  if (!input.businessName.trim()) throw new Error('La orden no trae la razón social escrita');

  const request = await prisma.companyErasureRequest.findFirst({ where: { companyId, kind, codeHash: hashErasureCode(input.code) }, orderBy: { requestedAt: 'desc' } });
  if (!request) {
    await registerFailedAttempt(companyId, kind);
    throw new Error(`El código no corresponde a ninguna solicitud vigente de ${actionLabel(kind)} esta empresa. Pide la solicitud de nuevo.`);
  }

  const verdict = checkConfirmation({ ...request, status: request.status as ErasureStatus }, now);
  if (!verdict.ok) {
    switch (verdict.reason) {
      case 'DONE':
        return asResult(request, true);
      case 'CANCELLED':
        throw new Error('Esa solicitud fue cancelada o reemplazada. Pídela de nuevo.');
      case 'RUNNING':
        throw new Error('Esa solicitud ya se está ejecutando. Espera a que termine; si no responde en unos minutos, vuelve a enviarla.');
      case 'NOT_YET':
        throw new Error(`Todavía no se puede confirmar: la espera termina el ${whenLabel(request.notBefore)}.`);
      case 'EXPIRED':
        throw new Error(`La solicitud venció el ${whenLabel(request.expiresAt)}. Pídela de nuevo.`);
    }
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, rut: true, businessName: true, status: true } });
  if (!company) throw new Error('La empresa ya no existe en Aether');
  if (!confirmationMatches(company.businessName, input.businessName)) {
    await registerFailedAttempt(companyId, kind);
    throw new Error(`La razón social escrita no coincide con la de la empresa («${company.businessName}»).`);
  }
  if (kind === 'DELETE') {
    if (!NOT_OPERATING.includes(company.status)) throw new Error('La empresa volvió a operar: para eliminarla hay que suspenderla de nuevo y pedir la solicitud otra vez.');
    const blockers = await deleteBlockers(company.id);
    if (blockers.length > 0) throw blockersError(blockers);
  }

  const mode = modeOf(kind);
  const signals = await collectRealDataSignals(prisma, company.id);
  if (signals.length > 0 && !input.acceptRealData) {
    throw new Error(`Hay datos que no parecen de prueba: ${signals.map((s) => `${s.count} ${s.label}`).join('; ')}. Si de verdad quieres perderlos, vuelve a enviar la confirmación con aceptoDatosReales.`);
  }

  // Una sola ejecución a la vez: lo único que gana la carrera es quien cambia PENDING (o un RUNNING muerto) a RUNNING.
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const claimed = await prisma.companyErasureRequest.updateMany({
    where: { id: request.id, OR: [{ status: 'PENDING' }, { status: 'RUNNING', startedAt: { lt: staleBefore } }] },
    data: { status: 'RUNNING', startedAt: now },
  });
  if (claimed.count === 0) throw new Error('Esa solicitud ya se está ejecutando. Espera a que termine.');

  let files: FileScan | null = null;
  let result: ErasureResult;
  try {
    const backup = await takeBackup(company, now);

    const facts = await loadSchemaFacts(prisma);
    const plan = buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys, mode });
    // Las direcciones de los archivos se leen ANTES de borrar las filas que las guardan.
    if (kind === 'DELETE') {
      const before = await countRows(prisma, plan.deleteOrder, company.id);
      files = await scanStoredFileRefs(prisma, Object.keys(before), company.id);
    }

    // El borrado, la huella en la bitácora de la plataforma y la marca DONE confirman juntos o no confirma ninguno.
    let committed: ErasureResult | null = null;
    await prisma.$transaction(
      (tx) =>
        runReset(tx, {
          companyId: company.id,
          plan,
          facts,
          mode,
          afterDelete: async (inner, summary) => {
            const reprovisioned = kind === 'RESET' ? await reprovisionCompany(inner, company.id) : null;
            const done: ErasureResult = {
              kind,
              alreadyDone: false,
              rows: summary.totalRows,
              tables: Object.keys(summary.deleted).length,
              backup: { ref: backup.ref, bytes: backup.bytes, sha256: backup.sha256 },
              ...(reprovisioned ? { chartOfAccounts: reprovisioned.chartOfAccounts } : {}),
            };
            await inner.platformAuditLog.create({
              data: {
                action: kind === 'DELETE' ? 'COMPANY_DELETED' : 'company.data_reset',
                companyId: company.id,
                companyRut: company.rut,
                companyBusinessName: company.businessName,
                performedByUserId: 'supersuite',
                performedByEmail: 'supersuite',
                metadata: {
                  solicitud: request.id,
                  orden: request.requestedOrder,
                  filas: summary.totalRows,
                  tablas: summary.deleted,
                  respaldo: done.backup,
                  datosReales: signals.map((s) => `${s.count} ${s.label}`),
                },
              },
            });
            await inner.companyErasureRequest.update({ where: { id: request.id }, data: { status: 'DONE', finishedAt: new Date(), result: { ...done } } });
            committed = done;
          },
        }),
      TX_OPTIONS
    );
    if (!committed) throw new Error('el borrado terminó sin resultado');
    result = committed;
  } catch (error) {
    // Nada se borró (el borrado es una transacción): se libera la solicitud para poder reintentarla.
    await prisma.companyErasureRequest.updateMany({ where: { id: request.id, status: 'RUNNING' }, data: { status: 'PENDING', startedAt: null } }).catch(() => undefined);
    captureException(error, { module: 'platform', companyId, extra: { step: 'confirmErasure', kind, request: request.id } });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo ${actionLabel(kind)} la empresa y no se borró nada. ${detail}`.slice(0, 480));
  }

  // Desde acá el borrado ya confirmó: nada de lo que sigue puede hacerlo fallar ni deshacerlo.
  try {
    if (kind === 'DELETE') {
      empresaEliminadaSupersuite(company.id, company.businessName);
      const removed: FileDeletion = await deleteStoredFiles(files?.own ?? []);
      result = { ...result, files: { found: files?.own.length ?? 0, deleted: removed.deleted, failed: removed.failed.length, notAttributed: files?.foreign.length ?? 0 } };
      await prisma.companyErasureRequest.update({ where: { id: request.id }, data: { result: { ...result, archivosNoBorrados: removed.failed.slice(0, 200) } } });
      if (removed.failed.length > 0) {
        captureException(new Error('No se pudieron borrar algunos archivos de una empresa eliminada'), {
          module: 'platform',
          companyId: company.id,
          extra: { failed: removed.failed.length, first: removed.failed.slice(0, 5) },
        });
      }
    } else {
      // El historial de la empresa se borró: queda una primera línea que dice por qué está vacío.
      await createAuditLog({
        companyId: company.id,
        userEmail: 'supersuite',
        action: 'DELETE',
        entity: 'Company',
        entityId: company.id,
        metadata: { origen: 'supersuite', reason: 'company_data_reset', solicitud: request.id, filas: result.rows, tablas: result.tables, respaldo: result.backup?.ref },
      });
    }
  } catch (error) {
    captureException(error, { module: 'platform', companyId, extra: { step: 'confirmErasure.afterCommit', kind, request: request.id } });
  }
  return result;
}

/** Cancela las solicitudes pendientes de una empresa (de un tipo o de ambos). Devuelve cuántas. */
export async function cancelErasure(input: { companyId: string; kind?: ErasureKind; reason?: string }): Promise<number> {
  const cancelled = await prisma.companyErasureRequest.updateMany({
    where: { companyId: input.companyId, status: 'PENDING', ...(input.kind ? { kind: input.kind } : {}) },
    data: { status: 'CANCELLED', finishedAt: new Date(), result: { motivo: input.reason ?? 'cancelada por la Supersuite' } },
  });
  return cancelled.count;
}
