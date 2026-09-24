'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import type { Permission } from '@/lib/auth/permissions';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { treasuryAccountSchema } from '../schema';
import * as accountsService from '../services/accounts.service';
import type { TreasuryAccountWithBalance } from '../services/accounts.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

export interface TreasuryAccountsBoard {
  accounts: TreasuryAccountWithBalance[];
  /** Cuentas contables de activo para asociar (vacío si la Contabilidad no está activa). */
  ledgerAccounts: Array<{ id: string; code: string; name: string }>;
}

export async function getTreasuryAccountsBoardAction(): Promise<ActionResult<TreasuryAccountsBoard>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const [accounts, ledgerAccounts] = await Promise.all([
      accountsService.listTreasuryAccounts(session.companyId),
      session.features.hasAccounting ? accountsService.listAssetLedgerAccounts(session.companyId) : Promise.resolve([]),
    ]);
    return { success: true, data: { accounts, ledgerAccounts } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Quién puede ver la lista de cajas/bancos para elegir dónde entró o salió
 * un pago: el mismo permiso con el que registra ese pago en su módulo (quien
 * confirma entradas no necesariamente tiene permisos de Tesorería).
 */
const ACCOUNT_CHOICE_PERMISSION = {
  treasury: 'treasury:write',
  ticketing: 'ticketing:write',
  voting: 'publicvoting:write',
  promissory: 'promissorynotes:write',
  sponsorship: 'sponsorships:write',
} as const satisfies Record<string, Permission>;

export type AccountChoiceContext = keyof typeof ACCOUNT_CHOICE_PERMISSION;

/** Cajas y bancos activos para los selectores de "¿dónde entró/salió el dinero?". */
export async function listTreasuryAccountOptionsAction(
  context: AccountChoiceContext = 'treasury'
): Promise<ActionResult<Array<{ id: string; name: string; type: 'CASH' | 'BANK'; isDefault: boolean }>>> {
  try {
    const permission = ACCOUNT_CHOICE_PERMISSION[context];
    if (!permission) return { success: false, error: 'Contexto inválido' };
    const session = await requireAuthWithPermission(permission);
    return { success: true, data: await accountsService.listTreasuryAccountOptions(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveTreasuryAccountAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');
    const parsed = treasuryAccountSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const account = id
      ? await accountsService.updateTreasuryAccount(session.companyId, id, parsed.data)
      : await accountsService.createTreasuryAccount(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'TreasuryAccount',
      entityId: account.id,
      metadata: { name: account.name, type: account.type, isDefault: account.isDefault },
    });
    revalidatePath('/dashboard/treasury/accounts');
    return { success: true, data: { id: account.id }, message: id ? 'Cuenta actualizada' : 'Cuenta creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function setTreasuryAccountActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');
    await accountsService.setTreasuryAccountActive(session.companyId, id, isActive === true);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'TreasuryAccount',
      entityId: id,
      metadata: { isActive: isActive === true },
    });
    revalidatePath('/dashboard/treasury/accounts');
    return { success: true, data: null, message: isActive ? 'Cuenta reactivada' : 'Cuenta desactivada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
