/**
 * Comparativo de cotizaciones de una solicitud de compra.
 *
 * Por cada ítem pedido se busca el menor precio entre los proveedores que lo
 * cotizaron; el "adjudicado por defecto" es ese mejor precio, con desempate
 * por plazo de entrega y luego por orden de llegada de la cotización (el
 * primero que cotizó no pierde contra un empate posterior). La persona puede
 * cambiar la adjudicación ítem por ítem antes de generar las OC.
 */

export interface ComparisonItem {
  id: string;
  description: string;
  quantity: number;
}

export interface ComparisonQuote {
  id: string;
  contactId: string;
  supplierName: string;
  leadTimeDays: number | null;
  /** Precio unitario por `requestItemId`; ausente = no cotizó ese ítem. */
  prices: Record<string, number>;
}

export interface ComparisonCell {
  quoteId: string;
  unitCost: number;
  lineTotal: number;
  isBest: boolean;
}

export interface ComparisonRow {
  item: ComparisonItem;
  cells: Record<string, ComparisonCell | undefined>;
  bestQuoteId: string | null;
  /** Diferencia entre la peor y la mejor oferta del ítem, en total de línea. */
  spread: number;
}

export interface QuoteTotals {
  quoteId: string;
  /** Total de lo que cotizó (solo ítems con precio). */
  total: number;
  itemsQuoted: number;
  /** Cuántos ítems tiene al mejor precio. */
  bestCount: number;
  covers: boolean;
}

export interface Comparison {
  rows: ComparisonRow[];
  totals: QuoteTotals[];
  /** Costo total adjudicando cada ítem a su mejor precio. */
  bestSplitTotal: number;
  /** Proveedor que cotizó todo al menor total, si alguno cubre todos los ítems. */
  bestSingleQuoteId: string | null;
  /** Ítems que nadie cotizó. */
  uncovered: string[];
}

function lineTotal(quantity: number, unitCost: number): number {
  return Math.round(quantity * unitCost);
}

export function compareQuotes(items: ComparisonItem[], quotes: ComparisonQuote[]): Comparison {
  const order = new Map(quotes.map((quote, index) => [quote.id, index]));
  const rows: ComparisonRow[] = items.map((item) => {
    const offers = quotes
      .filter((quote) => quote.prices[item.id] !== undefined)
      .map((quote) => ({ quote, unitCost: quote.prices[item.id] as number }));
    offers.sort(
      (a, b) =>
        a.unitCost - b.unitCost ||
        (a.quote.leadTimeDays ?? Number.MAX_SAFE_INTEGER) - (b.quote.leadTimeDays ?? Number.MAX_SAFE_INTEGER) ||
        (order.get(a.quote.id) ?? 0) - (order.get(b.quote.id) ?? 0)
    );
    const best = offers[0];
    const cells: Record<string, ComparisonCell | undefined> = {};
    for (const offer of offers) {
      cells[offer.quote.id] = {
        quoteId: offer.quote.id,
        unitCost: offer.unitCost,
        lineTotal: lineTotal(item.quantity, offer.unitCost),
        isBest: offer.quote.id === best?.quote.id,
      };
    }
    const totals = offers.map((offer) => lineTotal(item.quantity, offer.unitCost));
    return {
      item,
      cells,
      bestQuoteId: best?.quote.id ?? null,
      spread: totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : 0,
    };
  });

  const totals: QuoteTotals[] = quotes.map((quote) => {
    let total = 0;
    let itemsQuoted = 0;
    let bestCount = 0;
    for (const row of rows) {
      const cell = row.cells[quote.id];
      if (!cell) continue;
      total += cell.lineTotal;
      itemsQuoted += 1;
      if (cell.isBest) bestCount += 1;
    }
    return { quoteId: quote.id, total, itemsQuoted, bestCount, covers: itemsQuoted === items.length && items.length > 0 };
  });

  const covering = totals.filter((total) => total.covers).sort((a, b) => a.total - b.total || (order.get(a.quoteId) ?? 0) - (order.get(b.quoteId) ?? 0));

  return {
    rows,
    totals,
    bestSplitTotal: rows.reduce((sum, row) => sum + (row.bestQuoteId ? (row.cells[row.bestQuoteId]?.lineTotal ?? 0) : 0), 0),
    bestSingleQuoteId: covering[0]?.quoteId ?? null,
    uncovered: rows.filter((row) => !row.bestQuoteId).map((row) => row.item.id),
  };
}

/**
 * Agrupa la adjudicación (ítem → cotización) en una orden de compra por
 * proveedor. Valida que cada ítem adjudicado tenga precio en la cotización
 * elegida: adjudicar a quien no cotizó el ítem es un error, no un precio 0.
 */
export function groupAward(
  award: Record<string, string>,
  quotes: ComparisonQuote[]
): { quoteId: string; contactId: string; items: { requestItemId: string; unitCost: number }[] }[] {
  const byQuote = new Map<string, { quoteId: string; contactId: string; items: { requestItemId: string; unitCost: number }[] }>();
  const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));
  for (const [requestItemId, quoteId] of Object.entries(award)) {
    const quote = quotesById.get(quoteId);
    if (!quote) throw new Error('Una adjudicación apunta a una cotización que no existe');
    const unitCost = quote.prices[requestItemId];
    if (unitCost === undefined) throw new Error(`${quote.supplierName} no cotizó uno de los ítems adjudicados`);
    const group = byQuote.get(quoteId) ?? { quoteId, contactId: quote.contactId, items: [] };
    group.items.push({ requestItemId, unitCost });
    byQuote.set(quoteId, group);
  }
  return Array.from(byQuote.values());
}
