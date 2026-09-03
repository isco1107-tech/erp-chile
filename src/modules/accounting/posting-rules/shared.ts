import type { JournalSourceType } from '@prisma/client';
import { reverseEntry, type JournalLineInput, type TxClient } from '../services/journal.service';

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
