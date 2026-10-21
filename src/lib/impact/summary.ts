/**
 * Resumen de impacto de una venta ("Hoy compraste a N productores"). Función
 * pura: no lee base de datos ni el entorno, solo agrupa las líneas que recibe.
 *
 * Regla del producto: una métrica sin datos se omite. Si la venta no incluye
 * productos de ningún productor, `summarizeImpact` devuelve `null` y no se
 * imprime nada en la boleta. No hay otras métricas (huella de carbono quedó
 * descartada): solo conteos reales de la venta.
 */

export interface ImpactLine {
  productId: string | null;
  /** Productor del producto en consignación; `null` si es producto propio. */
  producerId: string | null;
  /** Nombre comercial del productor (nombre de fantasía, o razón social). */
  producerName: string | null;
  quantity: number;
  /** Total de la línea en CLP entero. */
  lineTotal: number;
}

export interface ImpactProducer {
  name: string;
  /** Productos distintos de este productor en la venta. */
  itemCount: number;
  /** CLP vendido de este productor (solo para uso interno; no se publica). */
  amount: number;
}

export interface ImpactSummary {
  producerCount: number;
  producers: ImpactProducer[];
  /** Productos distintos de la venta que no vienen de un productor. */
  ownItemsCount: number;
  /** "Hoy compraste a 1 productor" / "Hoy compraste a 3 productores". */
  text: string;
}

/** "1 productor" / "3 productores". */
export function producerCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'productor' : 'productores'}`;
}

export function impactText(producerCount: number): string {
  return `Hoy compraste a ${producerCountLabel(producerCount)}`;
}

/** Clave de producto: líneas sin producto (ítems libres) cuentan cada una por separado. */
function itemKey(line: ImpactLine, index: number): string {
  return line.productId ?? `__line_${index}`;
}

export function summarizeImpact(lines: readonly ImpactLine[]): ImpactSummary | null {
  const byProducer = new Map<string, { name: string; items: Set<string>; amount: number }>();
  const ownItems = new Set<string>();

  lines.forEach((line, index) => {
    // Líneas sin cantidad (anuladas o en cero) no son una compra.
    if (!(line.quantity > 0)) return;
    const key = itemKey(line, index);
    const name = line.producerName?.trim();
    if (line.producerId && name) {
      const entry = byProducer.get(line.producerId) ?? { name, items: new Set<string>(), amount: 0 };
      entry.items.add(key);
      entry.amount += Math.round(line.lineTotal);
      byProducer.set(line.producerId, entry);
    } else {
      ownItems.add(key);
    }
  });

  if (byProducer.size === 0) return null;

  const producers = [...byProducer.values()]
    .map((entry) => ({ name: entry.name, itemCount: entry.items.size, amount: entry.amount }))
    .sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name, 'es-CL'));

  return {
    producerCount: producers.length,
    producers,
    ownItemsCount: ownItems.size,
    text: impactText(producers.length),
  };
}
