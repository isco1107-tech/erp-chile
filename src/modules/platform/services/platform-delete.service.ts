import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyTotpCode } from '@/lib/auth/totp';
import { decryptTotpSecret } from '@/lib/auth/totp-crypto';
import { BATCH_TX_OPTIONS } from '@/lib/prisma-tx';

/**
 * Borrado PERMANENTE (hard delete, sin papelera) de un tenant completo:
 * usuarios, ventas, compras, inventario, contabilidad — todo.
 *
 * `Company` tiene ~70 relaciones; solo una parte cascadea automáticamente
 * (ver comentarios en schema.prisma — `onDelete: Cascade` explícito modelo
 * por modelo). El resto usan el default de Prisma/Postgres, que es RESTRICT
 * — a propósito, se mantiene así en el schema como protección general del
 * sistema. Por eso este service borra explícitamente cada tabla hija en el
 * orden topológico correcto dentro de una única transacción, en vez de
 * depender de un `Cascade` general que debilitaría esa protección para el
 * resto de la aplicación.
 *
 * Un modelo nuevo con `companyId` NO entra acá solo — a diferencia del
 * respaldo (`src/modules/backup/`), que sí se deriva del DMMF, esta función
 * es una lista escrita a mano. Ya pasó una vez: ~15 tablas de los módulos de
 * eventos/producción/agentes de IA se agregaron al schema en sesiones
 * posteriores sin que nadie las sumara acá, y borrar cualquier empresa que
 * las usara hacía rollback completo contra la primera FK RESTRICT que
 * encontrara. Al agregar un modelo con `companyId` que no cascadea desde
 * `Company` u otro padre ya cubierto, agregar su `deleteMany` acá también.
 *
 * El orden de los `deleteMany` de abajo fue derivado y verificado a mano
 * contra cada FK de schema.prisma. NO reordenar ni agrupar en Promise.all sin
 * releer cuidadosamente el schema completo: varios pasos dependen
 * estrictamente de que el paso anterior haya terminado (relaciones RESTRICT).
 * Un orden incorrecto simplemente hace fallar la transacción completa con
 * rollback — no hay riesgo de corrupción de datos, solo de que la función
 * falle en producción para empresas con datos reales.
 */
async function hardDeleteTenant(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  // Paso 0: los triggers de inmutabilidad contable (definidos en
  // prisma/migrations/20260819051703_add_accounting_core/migration.sql) no
  // son FKs, son triggers de aplicación que bloquean con RAISE EXCEPTION
  // cualquier UPDATE/DELETE sobre JournalEntry/JournalLine en estado
  // POSTED/REVERSED. Sin desactivarlos, borrar una empresa con asientos
  // contabilizados fallaría siempre. Se desactivan y reactivan dentro de la
  // misma transacción (DDL transaccional en Postgres): si algo falla
  // después, el rollback los deja como estaban.
  await tx.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER "trg_journal_entry_immutable"`);
  await tx.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER "trg_journal_line_immutable"`);

  // Paso 1: romper auto-referencias circulares (RESTRICT) antes de borrar esas filas.
  await tx.account.updateMany({ where: { companyId }, data: { parentId: null } });
  await tx.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });

  // Paso 2: deleteMany en orden topológico exacto (cada uno where: { companyId }).
  await tx.auditLog.deleteMany({ where: { companyId } });
  await tx.invitation.deleteMany({ where: { companyId } });
  await tx.cashMovement.deleteMany({ where: { companyId } });
  await tx.accountMapping.deleteMany({ where: { companyId } });
  await tx.salesDocumentItem.deleteMany({ where: { companyId } });
  await tx.purchaseDocumentItem.deleteMany({ where: { companyId } });
  await tx.goodsReceiptItem.deleteMany({ where: { companyId } });
  await tx.journalLine.deleteMany({ where: { companyId } });
  await tx.payment.deleteMany({ where: { companyId } });
  // Tesorería · Ola 3: nóminas (sus líneas apuntan a PurchaseDocument y
  // Contact con RESTRICT), cheques, cobranza y bancos con sus cartolas.
  await tx.paymentBatchItem.deleteMany({ where: { companyId } });
  await tx.paymentBatch.deleteMany({ where: { companyId } });
  await tx.cheque.deleteMany({ where: { companyId } });
  await tx.collectionReminderLog.deleteMany({ where: { companyId } });
  await tx.collectionNote.deleteMany({ where: { companyId } });
  await tx.bankStatementLine.deleteMany({ where: { companyId } });
  await tx.bankStatement.deleteMany({ where: { companyId } });
  await tx.bankAccount.deleteMany({ where: { companyId } });
  await tx.stock.deleteMany({ where: { companyId } });
  await tx.inventoryMovement.deleteMany({ where: { companyId } });
  await tx.folioSequence.deleteMany({ where: { companyId } });
  await tx.internalDocumentSequence.deleteMany({ where: { companyId } });
  await tx.journalEntrySequence.deleteMany({ where: { companyId } });
  await tx.taxPeriod.deleteMany({ where: { companyId } });
  await tx.companyFeatures.deleteMany({ where: { companyId } });
  await tx.companySettings.deleteMany({ where: { companyId } });
  await tx.goodsReceipt.deleteMany({ where: { companyId } });
  await tx.purchaseOrderItem.deleteMany({ where: { companyId } });
  await tx.salesDocument.deleteMany({ where: { companyId } });
  // Ventas · Ola 1: notas de venta (sus documentos ya se borraron arriba; las
  // FKs desde SalesDocument son SetNull), listas de precios (Contact y
  // SalesOrder apuntan con SetNull) y comisiones.
  await tx.salesOrderItem.deleteMany({ where: { companyId } });
  await tx.salesOrder.deleteMany({ where: { companyId } });
  await tx.priceListItem.deleteMany({ where: { companyId } });
  await tx.priceList.deleteMany({ where: { companyId } });
  await tx.salesCommissionRate.deleteMany({ where: { companyId } });
  // Inventario · Ola 2: conteos (sus líneas apuntan a Product con RESTRICT, así
  // que van antes que los productos), lotes y empaques.
  await tx.inventoryCountLine.deleteMany({ where: { companyId } });
  await tx.inventoryCount.deleteMany({ where: { companyId } });
  await tx.inventoryLot.deleteMany({ where: { companyId } });
  await tx.productPackaging.deleteMany({ where: { companyId } });
  await tx.purchaseDocument.deleteMany({ where: { companyId } });
  await tx.journalEntry.deleteMany({ where: { companyId } });
  await tx.account.deleteMany({ where: { companyId } });
  await tx.cashShift.deleteMany({ where: { companyId } });
  await tx.accountingPeriod.deleteMany({ where: { companyId } });
  await tx.purchaseOrder.deleteMany({ where: { companyId } });

  // Paso 2b: módulos de producción de eventos/certámenes y agentes de IA.
  // Los hijos que SÍ cascadean en schema.prisma (`onDelete: Cascade` hacia
  // `Project`/`Candidate`/`SponsorshipContract`/`Budget`/`JudgeAssignment`)
  // no necesitan `deleteMany` acá — se van solos al borrar su padre:
  // `ScoreSheet`, `RoundContestant`, `JudgingCategory`, `CompetitionRound`,
  // `JudgeAssignment`, `StaffAccreditation`, `StageTimelineItem`,
  // `WardrobeItem`, `BadgeTemplate`, `CandidateAttendance`,
  // `CandidateDocument`, `SponsorshipDeliverable` y `BudgetLine`. El orden
  // de abajo respeta cada FK RESTRICT real: `VoteOrder` antes de
  // `Candidate` y `Project`, `TicketSale` antes de `TicketType`,
  // `PaymentPlanInstallment` antes de `PaymentPlan`, y todo lo que
  // referencia `Contact` (`PaymentPlan`, `PromissoryNote`, `FeeDocument`,
  // `SponsorshipContract`) antes del `contact.deleteMany` de abajo.
  await tx.agentTask.deleteMany({ where: { companyId } });
  await tx.agentRun.deleteMany({ where: { companyId } });
  await tx.voteOrder.deleteMany({ where: { companyId } });
  await tx.ticketSale.deleteMany({ where: { companyId } });
  await tx.ticketType.deleteMany({ where: { companyId } });
  await tx.installmentPaymentOrderItem.deleteMany({ where: { companyId } });
  await tx.installmentPaymentOrder.deleteMany({ where: { companyId } });
  await tx.paymentPlanInstallment.deleteMany({ where: { companyId } });
  await tx.paymentPlan.deleteMany({ where: { companyId } });
  await tx.promissoryNote.deleteMany({ where: { companyId } });
  await tx.feeDocument.deleteMany({ where: { companyId } });
  await tx.sponsorshipContract.deleteMany({ where: { companyId } });
  await tx.candidateSession.deleteMany({ where: { companyId } });
  await tx.candidate.deleteMany({ where: { companyId } });
  await tx.documentTemplate.deleteMany({ where: { companyId } });
  await tx.budget.deleteMany({ where: { companyId } });
  await tx.project.deleteMany({ where: { companyId } });

  await tx.contact.deleteMany({ where: { companyId } });
  await tx.cashRegister.deleteMany({ where: { companyId } });
  await tx.product.deleteMany({ where: { companyId } });
  await tx.category.deleteMany({ where: { companyId } });
  await tx.warehouse.deleteMany({ where: { companyId } });
  await tx.customRole.deleteMany({ where: { companyId } });
  await tx.costCenter.deleteMany({ where: { companyId } });
  // User.companyId es RESTRICT; UserSession/PasswordResetToken/TotpBackupCode
  // cascadean automáticamente al borrar User (onDelete: Cascade en su userId).
  await tx.user.deleteMany({ where: { companyId } });

  // Paso 3: reactivar los triggers.
  await tx.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER "trg_journal_entry_immutable"`);
  await tx.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER "trg_journal_line_immutable"`);

  // Paso 4: borrar la empresa (ya no debería tener ninguna fila hija bloqueante).
  await tx.company.delete({ where: { id: companyId } });
}

export interface TenantSnapshot {
  id: string;
  rut: string;
  businessName: string;
}

/** Lee lo mínimo de la empresa para poder loguearla después de que ya no exista. */
export async function getTenantSnapshot(companyId: string): Promise<TenantSnapshot | null> {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, rut: true, businessName: true },
  });
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export type DeleteTenantResult =
  | { kind: 'totp_not_configured' }
  | { kind: 'locked'; minutesLeft: number }
  | { kind: 'invalid_code' }
  | { kind: 'deleted' };

/**
 * Verifica el código TOTP del superadmin y, si es válido, ejecuta el borrado
 * duro completo del tenant dentro de la misma transacción.
 *
 * Replica el mismo patrón de lock/contador anti fuerza-bruta que el segundo
 * paso del login (ver src/app/api/auth/verify-totp/route.ts, líneas 79-126):
 * dentro de `prisma.$transaction`, toma `SELECT ... FOR UPDATE` sobre la fila
 * del propio superadmin, revisa `totpLockedUntil`, verifica el código y, si
 * falla, incrementa `totpFailedAttempts` (bloqueando 15 min tras 5 intentos
 * fallidos). Si el código es inválido o el superadmin está bloqueado, la
 * transacción COMMITEA solo el contador — nunca se ejecuta ningún delete de
 * la empresa. Solo si el código es válido continúa con `hardDeleteTenant`
 * dentro de esa misma transacción.
 */
export async function verifyTotpAndDeleteTenant(params: {
  superAdminId: string;
  companyId: string;
  code: string;
}): Promise<DeleteTenantResult> {
  const { superAdminId, companyId, code } = params;

  return prisma.$transaction<DeleteTenantResult>(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${superAdminId} FOR UPDATE`;

    const user = await tx.user.findUnique({
      where: { id: superAdminId },
      select: { totpEnabled: true, totpSecret: true, totpFailedAttempts: true, totpLockedUntil: true },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return { kind: 'totp_not_configured' as const };
    }

    if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000);
      return { kind: 'locked' as const, minutesLeft };
    }

    const valid = await verifyTotpCode(decryptTotpSecret(user.totpSecret), code);

    if (!valid) {
      const attempts = user.totpFailedAttempts + 1;
      await tx.user.update({
        where: { id: superAdminId },
        data:
          attempts >= MAX_ATTEMPTS
            ? { totpFailedAttempts: 0, totpLockedUntil: new Date(Date.now() + LOCKOUT_MS) }
            : { totpFailedAttempts: attempts },
      });
      return { kind: 'invalid_code' as const };
    }

    if (user.totpFailedAttempts > 0 || user.totpLockedUntil) {
      await tx.user.update({ where: { id: superAdminId }, data: { totpFailedAttempts: 0, totpLockedUntil: null } });
    }

    await hardDeleteTenant(tx, companyId);

    return { kind: 'deleted' as const };
  }, BATCH_TX_OPTIONS);
}
