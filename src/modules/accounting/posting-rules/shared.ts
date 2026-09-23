import type { JournalSourceType } from '@prisma/client';
import { reverseEntry, type JournalLineInput, type TxClient } from '../services/journal.service';

/**
 * El motor de asientos automáticos corre solo si la empresa tiene
 * Contabilidad activa (`CompanyFeatures.hasAccounting`) Y su plan de cuentas
 * ya sembrado. Antes esto no se miraba: toda venta, compra, pago y ajuste de
 * stock posteaba siempre dentro de su propia transacción, así que una empresa
 * sin plan de cuentas no podía emitir NADA ("No hay una cuenta mapeada a
 * CAJA…"). Ahora la Contabilidad es un módulo activable de verdad: apagada,
 * la operación sigue normal y simplemente no se generan asientos.
 *
 * Deliberado: se consulta dentro del mismo `tx` (dos lecturas indexadas por
 * `companyId`), no se confía en el contexto de sesión, porque los crons y los
 * webhooks también emiten documentos sin sesión de usuario.
 */
export async function isLedgerActive(tx: TxClient, companyId: string): Promise<boolean> {
  const features = await tx.companyFeatures.findUnique({ where: { companyId }, select: { hasAccounting: true } });
  if (!features?.hasAccounting) return false;
  const mapping = await tx.accountMapping.findFirst({ where: { companyId }, select: { id: true } });
  return mapping !== null;
}

/**
 * Invierte debe/haber de un set de líneas ya armado — usado para modelar una
 * Nota de Crédito (u otro reverso económico) como el espejo exacto del
 * asiento de venta/compra correspondiente, sin repetir la lógica de qué
 * cuenta va en cada lado.
 */
export function invertLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}

/**
 * Reversa todos los asientos POSTED que un documento haya generado (puede ser
 * más de uno: venta + costo de venta, por ejemplo). Es lo que llama la
 * anulación de un documento — nunca edita ni borra el asiento original, solo
 * lo reversa, igual que el resto del sistema (kardex, notas de crédito).
 */
export async function reverseDocumentEntries(
  tx: TxClient,
  companyId: string,
  sourceType: JournalSourceType,
  sourceId: string,
  reason: string,
  createdByUserId?: string
): Promise<void> {
  const entries = await tx.journalEntry.findMany({
    where: { companyId, sourceType, sourceId, status: 'POSTED' },
  });
  for (const entry of entries) {
    await reverseEntry(tx, entry.id, reason, createdByUserId);
  }
}
