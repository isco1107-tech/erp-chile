import 'server-only';

import { prisma } from '@/lib/prisma';
import { BATCH_TX_OPTIONS } from '@/lib/prisma-tx';
import { seedChartOfAccounts } from '../chart-of-accounts';

/**
 * Puesta en marcha del plan de cuentas de una empresa.
 *
 * Contabilidad es un módulo activable: al encenderlo (superadmin, o el botón
 * de la pantalla contable) se siembra el plan de cuentas base con sus mapeos,
 * y desde ese momento el motor de asientos (`posting-rules/`) empieza a
 * contabilizar ventas, compras, pagos y ajustes. Sin plan de cuentas, el motor
 * no postea (ver `isLedgerActive`), así que sembrar es lo que "prende" la
 * contabilidad automática.
 *
 * Idempotente: `seedChartOfAccounts` hace upsert por código, y si la empresa
 * ya tiene mapeos no se toca nada — nunca pisa un plan que el contador ya
 * adaptó.
 */

export async function hasChartOfAccounts(companyId: string): Promise<boolean> {
  const mapping = await prisma.accountMapping.findFirst({ where: { companyId }, select: { id: true } });
  return mapping !== null;
}

export async function ensureChartOfAccounts(companyId: string): Promise<{ created: boolean }> {
  if (await hasChartOfAccounts(companyId)) return { created: false };
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { industryType: true } });
  // ~50 escrituras secuenciales contra Neon: exige el timeout extendido.
  await prisma.$transaction((tx) => seedChartOfAccounts(tx, companyId, settings?.industryType ?? 'COMMERCE'), BATCH_TX_OPTIONS);
  return { created: true };
}
