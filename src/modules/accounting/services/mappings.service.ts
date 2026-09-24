import 'server-only';

import type { AccountType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mappingDefinition, MAPPING_DEFINITIONS } from '../mapping-definitions';

/**
 * "Cuentas del sistema": a qué cuenta del plan de la empresa va cada clave
 * semántica del motor de asientos. Existía el modelo `AccountMapping` pero no
 * había dónde verlo ni cambiarlo: un contador que adaptara su plan no podía
 * redirigir, por ejemplo, los honorarios a su propia subcuenta.
 */

export interface MappingRow {
  key: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
}

export interface MappingBoard {
  rows: MappingRow[];
  accounts: Array<{ id: string; code: string; name: string; type: AccountType }>;
}

export async function getMappingBoard(companyId: string): Promise<MappingBoard> {
  const [mappings, accounts] = await Promise.all([
    prisma.accountMapping.findMany({ where: { companyId }, include: { account: { select: { code: true, name: true } } } }),
    prisma.account.findMany({
      where: { companyId, isPostable: true, isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    }),
  ]);
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  return {
    rows: MAPPING_DEFINITIONS.map((definition) => {
      const mapping = byKey.get(definition.key);
      return {
        key: definition.key,
        accountId: mapping?.accountId ?? null,
        accountCode: mapping?.account.code ?? null,
        accountName: mapping?.account.name ?? null,
      };
    }),
    accounts,
  };
}

/**
 * Apunta una clave a otra cuenta. Valida que la cuenta sea de la empresa,
 * hoja, activa y de un tipo que tenga sentido para esa clave (no se puede
 * mandar "Caja" a una cuenta de gastos). Devuelve la cuenta anterior para la
 * bitácora.
 */
export async function setAccountMapping(companyId: string, key: string, accountId: string): Promise<{ previousAccountId: string | null }> {
  const definition = mappingDefinition(key);
  if (!definition) throw new Error('Esa cuenta del sistema no existe');

  const account = await prisma.account.findFirst({
    where: { id: accountId, companyId },
    select: { id: true, isPostable: true, isActive: true, type: true, code: true, name: true },
  });
  if (!account) throw new Error('La cuenta elegida no existe en tu plan de cuentas');
  if (!account.isPostable) throw new Error(`${account.code} ${account.name} es una cuenta agrupadora: elige una cuenta de detalle`);
  if (!account.isActive) throw new Error(`${account.code} ${account.name} está inactiva`);
  if (!definition.allowedTypes.includes(account.type)) {
    throw new Error(`"${definition.label}" no puede apuntar a una cuenta de ese tipo`);
  }

  const previous = await prisma.accountMapping.findUnique({ where: { companyId_key: { companyId, key } }, select: { accountId: true } });
  await prisma.accountMapping.upsert({
    where: { companyId_key: { companyId, key } },
    update: { accountId },
    create: { companyId, key, accountId },
  });
  return { previousAccountId: previous?.accountId ?? null };
}
