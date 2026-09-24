import 'server-only';

import type { Prisma, TreasuryAccount, TreasuryAccountType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import type { TreasuryAccountInput } from '../schema';

/**
 * Cajas y cuentas bancarias de la empresa. Son el "dónde" de cada movimiento
 * de Tesorería: con ellas el flujo de caja muestra saldo por cuenta y la
 * cartola del banco se concilia contra la cuenta correcta.
 */

export interface TreasuryAccountOption {
  id: string;
  name: string;
  type: TreasuryAccountType;
  isDefault: boolean;
}

export interface TreasuryAccountWithBalance extends TreasuryAccount {
  balance: number;
  movementCount: number;
  ledgerAccount: { code: string; name: string } | null;
}

/** Opciones livianas para los selectores de "¿desde qué cuenta pagaste?". */
export async function listTreasuryAccountOptions(companyId: string): Promise<TreasuryAccountOption[]> {
  return prisma.treasuryAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { type: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Saldo de cada cuenta = saldo inicial + ingresos − egresos registrados en
 * ella desde su fecha de apertura. Dos agregaciones por dirección y cuenta,
 * no una consulta por cuenta.
 */
export async function listTreasuryAccounts(companyId: string): Promise<TreasuryAccountWithBalance[]> {
  const accounts = await prisma.treasuryAccount.findMany({
    where: { companyId },
    include: { ledgerAccount: { select: { code: true, name: true } } },
    orderBy: [{ isActive: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
  });
  if (accounts.length === 0) return [];

  const sums = await prisma.payment.groupBy({
    by: ['treasuryAccountId', 'type'],
    // Cada cuenta cuenta solo lo movido desde su fecha de apertura: lo
    // anterior ya está dentro del saldo inicial.
    where: {
      companyId,
      OR: accounts.map((account) => ({
        treasuryAccountId: account.id,
        ...(account.openingDate ? { paymentDate: { gte: account.openingDate } } : {}),
      })),
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  return accounts.map((account) => {
    let balance = account.openingBalance;
    let movementCount = 0;
    for (const row of sums) {
      if (row.treasuryAccountId !== account.id) continue;
      const amount = row._sum.amount ?? 0;
      balance += row.type === 'INCOME' ? amount : -amount;
      movementCount += row._count._all;
    }
    return { ...account, balance, movementCount };
  });
}

async function assertLedgerAccount(companyId: string, ledgerAccountId: string | undefined): Promise<void> {
  if (!ledgerAccountId) return;
  const account = await prisma.account.findFirst({
    where: { id: ledgerAccountId, companyId, isPostable: true, isActive: true, type: 'ASSET' },
    select: { id: true },
  });
  if (!account) throw new Error('La cuenta contable elegida no existe, no es de activo o no admite movimientos');
}

/** Solo una cuenta por defecto por tipo: marcar una desmarca las demás del mismo tipo. */
async function saveWithDefault(
  companyId: string,
  type: TreasuryAccountType,
  isDefault: boolean,
  write: (tx: Prisma.TransactionClient) => Promise<TreasuryAccount>
): Promise<TreasuryAccount> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.treasuryAccount.updateMany({ where: { companyId, type, isDefault: true }, data: { isDefault: false } });
      }
      return write(tx);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error('Ya existe una cuenta con ese nombre');
    throw error;
  }
}

export async function createTreasuryAccount(companyId: string, input: TreasuryAccountInput): Promise<TreasuryAccount> {
  await assertLedgerAccount(companyId, input.ledgerAccountId);
  // La primera cuenta de cada tipo queda por defecto aunque no se marque: si
  // no, los pagos desde otros módulos quedarían sin cuenta asignada.
  const existingOfType = await prisma.treasuryAccount.count({ where: { companyId, type: input.type, isActive: true } });
  const isDefault = input.isDefault || existingOfType === 0;
  return saveWithDefault(companyId, input.type, isDefault, (tx) =>
    tx.treasuryAccount.create({
      data: {
        companyId,
        name: input.name,
        type: input.type,
        bankName: input.type === 'BANK' ? (input.bankName ?? null) : null,
        accountNumber: input.type === 'BANK' ? (input.accountNumber ?? null) : null,
        ledgerAccountId: input.ledgerAccountId ?? null,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate ?? null,
        isDefault,
      },
    })
  );
}

export async function updateTreasuryAccount(companyId: string, id: string, input: TreasuryAccountInput): Promise<TreasuryAccount> {
  const current = await prisma.treasuryAccount.findFirst({ where: { id, companyId } });
  if (!current) throw new Error('La cuenta no existe');
  await assertLedgerAccount(companyId, input.ledgerAccountId);
  if (current.type !== input.type) {
    const used = await prisma.payment.count({ where: { companyId, treasuryAccountId: id } });
    if (used > 0) throw new Error('No se puede cambiar de caja a banco (o al revés) una cuenta con movimientos');
  }
  return saveWithDefault(companyId, input.type, input.isDefault, async (tx) => {
    await tx.treasuryAccount.updateMany({
      where: { id, companyId },
      data: {
        name: input.name,
        type: input.type,
        bankName: input.type === 'BANK' ? (input.bankName ?? null) : null,
        accountNumber: input.type === 'BANK' ? (input.accountNumber ?? null) : null,
        ledgerAccountId: input.ledgerAccountId ?? null,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate ?? null,
        isDefault: input.isDefault,
      },
    });
    return tx.treasuryAccount.findFirstOrThrow({ where: { id, companyId } });
  });
}

/** Desactivar, no borrar: los movimientos históricos siguen apuntando a la cuenta. */
export async function setTreasuryAccountActive(companyId: string, id: string, isActive: boolean): Promise<void> {
  const result = await prisma.treasuryAccount.updateMany({
    where: { id, companyId },
    data: isActive ? { isActive: true } : { isActive: false, isDefault: false },
  });
  if (result.count === 0) throw new Error('La cuenta no existe');
}

/** Cuentas contables hoja de activo, para elegir cuál representa la caja/banco en el libro mayor. */
export async function listAssetLedgerAccounts(companyId: string): Promise<Array<{ id: string; code: string; name: string }>> {
  return prisma.account.findMany({
    where: { companyId, type: 'ASSET', isPostable: true, isActive: true, isCurrent: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
}
