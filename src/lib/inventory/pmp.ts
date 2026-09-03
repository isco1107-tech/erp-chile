function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface PmpCalculationInput {
  previousStock: number;
  previousPmp: number;
  incomingQuantity: number;
  incomingUnitCost: number;
}

export interface PmpCalculationResult {
  newStock: number;
  newPmp: number;
}

/**
 * Nuevo PMP = ((Stock_Actual * PMP_Actual) + (Cantidad_Entrante * Costo_Unitario_Entrada))
 *             / (Stock_Actual + Cantidad_Entrante)
 *
 * Caso borde: con `CompanySettings.allowNegativeStock` activo, una compra
 * puede llegar con `previousStock` todavía negativo (backorder) y no
 * alcanzar a cubrirlo. Ahí la fórmula de promedio ponderado no tiene un
 * resultado bien definido — puede incluso dar negativo, según cuánto pese
 * el arrastre negativo frente a la compra entrante — así que NO se aplica a
 * ciegas. En vez de eso, y en vez de silenciar el costo a $0 (que corrompía
 * el costeo de toda venta hasta que el stock volviera a ser positivo), se usa
 * el costo de la compra entrante: es un dato real y reciente, nunca inventado
 * ni negativo. Es una simplificación deliberada de un caso sin solución
 * contable exacta, no un promedio verdadero.
 */
export function calculateNewPmp(input: PmpCalculationInput): PmpCalculationResult {
  const { previousStock, previousPmp, incomingQuantity, incomingUnitCost } = input;
  if (previousPmp < 0 || incomingUnitCost < 0) {
    throw new Error('El costo PMP no puede ser negativo');
  }
  const newStock = previousStock + incomingQuantity;
  if (newStock <= 0) return { newStock, newPmp: incomingUnitCost };

  const totalValue = previousStock * previousPmp + incomingQuantity * incomingUnitCost;
  return { newStock, newPmp: roundTo(totalValue / newStock, 2) };
}

export default { calculateNewPmp };
