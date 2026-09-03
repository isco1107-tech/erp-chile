import type { InventoryMovement } from '@prisma/client';
import { createAndPostEntry, resolveMappedAccountId, type JournalLineInput, type TxClient } from '../services/journal.service';

/**
 * Ajustes de inventario que NO nacen de una venta o una compra —
 * `registerStockIn`/`registerStockOut` en `stock.service.ts` son, por
 * construcción, el único camino "manual" al kardex: una entrada/salida real
 * ligada a un documento siempre mueve stock invocando `applyStockIn`/
 * `applyStockOut` directamente desde `sales.service.ts`/`purchases.service.ts`,
 * nunca a través de estos wrappers. Por eso esta regla se engancha ahí, sin
 * mirar `movement.type`: aunque el operador etiquete la entrada manual como
 * "PURCHASE_IN" en el formulario de Inventario, no existe una Factura de
 * proveedor detrás que abonar — el contrapeso correcto es
 * `DIFERENCIA_INVENTARIO`, no `PROVEEDORES`.
 *
 * `registerTransfer` queda deliberadamente fuera: mueve el mismo valor entre
 * bodegas sin cambiar el total de existencias de la empresa, así que no
 * tiene efecto contable — y de hecho llama a `applyStockIn`/`applyStockOut`
 * directamente, nunca a estos wrappers, así que ni siquiera necesita un
 * chequeo explícito para excluirlo.
 */

export function buildInventoryAdjustmentLines(input: {
  totalCost: number;
  isIncrease: boolean;
  existenciasAccountId: string;
  diferenciaInventarioAccountId: string;
}): JournalLineInput[] {
  if (input.totalCost <= 0) return [];
  return input.isIncrease
    ? [
        { accountId: input.existenciasAccountId, debit: input.totalCost, credit: 0 },
        { accountId: input.diferenciaInventarioAccountId, debit: 0, credit: input.totalCost },
      ]
    : [
        { accountId: input.diferenciaInventarioAccountId, debit: input.totalCost, credit: 0 },
        { accountId: input.existenciasAccountId, debit: 0, credit: input.totalCost },
      ];
}

export async function postInventoryAdjustmentEntry(
  tx: TxClient,
  companyId: string,
  movement: InventoryMovement,
  isIncrease: boolean,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (movement.totalCost <= 0) return;

  const [existenciasAccountId, diferenciaInventarioAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'EXISTENCIAS'),
    resolveMappedAccountId(tx, companyId, 'DIFERENCIA_INVENTARIO'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: movement.createdAt,
    description: `Ajuste de inventario${movement.reference ? ` — ${movement.reference}` : ''}`,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: movement.id,
    createdByUserId: opts.createdByUserId,
    lines: buildInventoryAdjustmentLines({
      totalCost: movement.totalCost,
      isIncrease,
      existenciasAccountId,
      diferenciaInventarioAccountId,
    }),
  });
}

/**
 * Descuadre de caja al cierre de turno (`PROMPT_ERP_V2.md` G.3/C.1): cada
 * boleta ya postea su propio asiento vía `postSalesDocumentIssued`, así que el
 * cierre de turno SOLO contabiliza la diferencia entre lo esperado y lo
 * contado — nunca el total vendido, eso ya está registrado documento por
 * documento.
 */
export function buildCashShiftDifferenceLines(input: {
  difference: number;
  cajaAccountId: string;
  diferenciaCajaAccountId: string;
}): JournalLineInput[] {
  if (input.difference === 0) return [];
  const amount = Math.abs(input.difference);
  // Sobrante (difference > 0): hay más efectivo del esperado, entra a Caja.
  // Faltante (difference < 0): falta efectivo, sale de Caja.
  return input.difference > 0
    ? [
        { accountId: input.cajaAccountId, debit: amount, credit: 0 },
        { accountId: input.diferenciaCajaAccountId, debit: 0, credit: amount },
      ]
    : [
        { accountId: input.diferenciaCajaAccountId, debit: amount, credit: 0 },
        { accountId: input.cajaAccountId, debit: 0, credit: amount },
      ];
}

export async function postCashShiftDifference(
  tx: TxClient,
  companyId: string,
  shift: { id: string; difference: number },
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (shift.difference === 0) return;

  const [cajaAccountId, diferenciaCajaAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'CAJA'),
    resolveMappedAccountId(tx, companyId, 'DIFERENCIA_CAJA'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: new Date(),
    description: `Descuadre de caja — cierre de turno`,
    sourceType: 'CASH_SHIFT',
    sourceId: shift.id,
    createdByUserId: opts.createdByUserId,
    lines: buildCashShiftDifferenceLines({ difference: shift.difference, cajaAccountId, diferenciaCajaAccountId }),
  });
}
