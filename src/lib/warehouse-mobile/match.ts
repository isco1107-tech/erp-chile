/**
 * Cruce entre lo que la IA leyó de una foto y el catálogo de la empresa.
 *
 * Es una heurística explicable (palabras en común, marca y contenido neto), no
 * un modelo: cada punto del puntaje tiene una razón que se puede leer y probar.
 * Lo más importante que hace es NO confundir variantes de un mismo producto: el
 * aceite de 900 ml y el de 1 litro tienen casi el mismo nombre y son SKUs
 * distintos, así que el contenido neto pesa más que cualquier palabra.
 *
 * El resultado nunca mueve stock por sí solo: la app siempre le muestra el
 * producto al bodeguero para que lo confirme.
 */

export interface MatchSubject {
  name: string | null;
  brand: string | null;
  variant: string | null;
  netContent: string | null;
}

export interface MatchProduct {
  name: string;
  brand: string | null;
}

/** Contenido neto en unidad base: gramos, mililitros o unidades. */
export interface NetContent {
  amount: number;
  kind: 'mass' | 'volume' | 'count';
}

const DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'sin', 'en', 'para', 'al', 'por', 'a', 'o', 'un', 'una', 'x']);

/** Minúsculas, sin tildes y solo letras/números separados por un espacio. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Fideos"/"fideo" y "galletas"/"galleta" cuentan como la misma palabra. */
function stem(token: string): string {
  return token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Palabras que distinguen un producto: sin artículos ni conectores. */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .map(stem);
}

const UNIT_FACTORS: Array<{ pattern: string; kind: NetContent['kind']; factor: number }> = [
  { pattern: 'kg|kgs|kilo|kilos|kilogramo|kilogramos', kind: 'mass', factor: 1000 },
  { pattern: 'g|gr|grs|gramo|gramos', kind: 'mass', factor: 1 },
  { pattern: 'l|lt|lts|litro|litros', kind: 'volume', factor: 1000 },
  { pattern: 'ml|cc', kind: 'volume', factor: 1 },
  { pattern: 'cl', kind: 'volume', factor: 10 },
  { pattern: 'un|und|unid|unids|unidad|unidades|u', kind: 'count', factor: 1 },
];

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/**
 * Contenido neto escrito en un texto: "900 ml", "0,9 L", "500g", "6 x 330 ml",
 * "pack 12 un". Devuelve el primero que reconoce, en unidad base; `null` si no
 * hay ninguno claro. Se usa tanto con lo que leyó la IA como con el nombre del
 * producto del catálogo (donde Chile suele escribir el tamaño: "Arroz 1 kg").
 */
export function parseNetContent(text: string | null | undefined): NetContent | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const unitAlternation = UNIT_FACTORS.map((unit) => unit.pattern).join('|');
  // "6 x 330 ml": multiplicador opcional antes de la cantidad.
  const pattern = new RegExp(`(?:(\\d+)\\s*[x×]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${unitAlternation})(?![a-zñ])`);
  const found = pattern.exec(lower);
  if (!found) return null;
  const multiplier = found[1] ? Number(found[1]) : 1;
  const amount = toNumber(found[2]!);
  const unitText = found[3]!;
  const unit = UNIT_FACTORS.find((candidate) => new RegExp(`^(?:${candidate.pattern})$`).test(unitText));
  if (!unit || !Number.isFinite(amount) || amount <= 0 || multiplier <= 0) return null;
  return { amount: multiplier * amount * unit.factor, kind: unit.kind };
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(a, b) * 0.01;
}

/** Palabras del texto que describen un tamaño ("900", "ml", "1", "kg"): no distinguen el producto. */
function isSizeToken(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+(ml|l|lt|g|gr|kg|cc|cl|un|u)$/.test(token) || UNIT_FACTORS.some((unit) => new RegExp(`^(?:${unit.pattern})$`).test(token));
}

function count<T>(items: Iterable<T>, predicate: (item: T) => boolean): number {
  let total = 0;
  for (const item of items) if (predicate(item)) total++;
  return total;
}

/**
 * Qué tan probable es que `product` sea lo que muestra la foto (0 a 1).
 *
 * - Cobertura: de las palabras que identifican lo leído, cuántas están en el producto.
 * - Precisión: de las palabras del producto, cuántas explica lo leído (un
 *   "Aceite de oliva extra virgen" no es el "Aceite" a secas).
 * - Marca: coincidir suma; ser distinta resta.
 * - Contenido: coincidir suma; ser distinto resta fuerte (otro SKU).
 */
export function scoreTextMatch(subject: MatchSubject, product: MatchProduct): number {
  const subjectTokens = new Set(tokenize([subject.name, subject.variant].filter(Boolean).join(' ')).filter((token) => !isSizeToken(token)));
  const brandTokens = new Set(tokenize(subject.brand ?? ''));
  if (subjectTokens.size === 0 && brandTokens.size === 0) return 0;

  const productNameTokens = tokenize(product.name).filter((token) => !isSizeToken(token));
  const productBrandTokens = new Set(tokenize(product.brand ?? ''));
  const productAllTokens = new Set([...productNameTokens, ...productBrandTokens]);

  // La marca puede venir en el nombre del producto ("Aceite Chef 900 ml") y no en su campo.
  const brandHits = count(brandTokens, (token) => productAllTokens.has(token));
  const brandMatches = brandTokens.size > 0 && brandHits === brandTokens.size;
  const brandKnownBothSides = brandTokens.size > 0 && productBrandTokens.size > 0;

  // Las palabras de la marca no cuentan como "nombre" en ningún lado.
  const subjectNameTokens = [...subjectTokens].filter((token) => !brandTokens.has(token));
  const productNameOnly = productNameTokens.filter((token) => !productBrandTokens.has(token) && !brandTokens.has(token));
  if (subjectNameTokens.length === 0) {
    // Solo se leyó la marca: es una pista débil, nunca un acierto.
    return brandMatches ? 0.3 : 0;
  }

  const productNameSet = new Set(productNameOnly);
  const coverage = count(subjectNameTokens, (token) => productNameSet.has(token)) / subjectNameTokens.length;
  const explained = new Set([...subjectNameTokens, ...brandTokens]);
  const precision = productNameOnly.length === 0 ? 0 : count(productNameOnly, (token) => explained.has(token)) / productNameOnly.length;

  let score = 0.6 * coverage + 0.25 * precision;

  // Coincidir en marca o en tamaño vale menos si el producto en sí es otro
  // (mismo "Chef 900 ml", pero oliva en vez de maravilla).
  if (brandMatches) score += 0.15 * coverage;
  else if (brandKnownBothSides) score -= 0.4;

  const subjectSize = parseNetContent(subject.netContent);
  const productSize = parseNetContent(product.name);
  if (subjectSize && productSize) {
    if (subjectSize.kind !== productSize.kind) score -= 0.2;
    else if (sameAmount(subjectSize.amount, productSize.amount)) score += 0.15 * coverage;
    else score -= 0.35;
  }

  return Math.min(1, Math.max(0, score));
}

export interface RankedMatch<T> {
  item: T;
  score: number;
}

/** Los mejores `limit` productos, de mayor a menor puntaje (los de puntaje 0 se descartan). */
export function rankCandidates<T extends MatchProduct>(subject: MatchSubject, products: readonly T[], limit = 3): Array<RankedMatch<T>> {
  return products
    .map((item) => ({ item, score: scoreTextMatch(subject, item) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Desde este puntaje (y con ventaja sobre el segundo) se propone UN producto. */
export const MATCH_CONFIDENT = 0.82;
/** Ventaja mínima del primero sobre el segundo para proponerlo solo. */
export const MATCH_MARGIN = 0.15;
/** Bajo este puntaje, el producto no es un candidato razonable. */
export const MATCH_POSSIBLE = 0.45;

export type MatchDecision = 'matched' | 'candidates' | 'new';

/**
 * - `matched`: uno solo, claramente mejor que el resto.
 * - `candidates`: hay posibles, pero que decida la persona.
 * - `new`: nada se le parece lo bastante; probablemente no está en el catálogo.
 */
export function decideMatch<T>(ranked: ReadonlyArray<RankedMatch<T>>): { decision: MatchDecision; picks: Array<RankedMatch<T>> } {
  const possible = ranked.filter((match) => match.score >= MATCH_POSSIBLE);
  const first = possible[0];
  if (!first) return { decision: 'new', picks: [] };
  const second = possible[1];
  if (first.score >= MATCH_CONFIDENT && (!second || first.score - second.score >= MATCH_MARGIN)) {
    return { decision: 'matched', picks: [first] };
  }
  return { decision: 'candidates', picks: possible.slice(0, 3) };
}

/** Tramo más largo de letras sin tilde ni ñ: "azúcar" -> "car". */
function longestPlainRun(word: string): string {
  let best = '';
  for (const run of word.split(/[^a-z0-9]+/)) if (run.length > best.length) best = run;
  return best;
}

/**
 * Trozos de palabra para pedirle a la base de datos los productos que valga la
 * pena puntuar (la consulta trae unos cientos, no el catálogo entero).
 *
 * Postgres no ignora tildes en `ILIKE`, y los nombres chilenos las llevan
 * ("Azúcar", "Té", "Limón"): buscar "azucar" no encontraría "Azúcar". Por eso
 * cada palabra se reduce a su tramo más largo SIN tilde ("azúcar" → "car"), que
 * sí aparece igual en cualquier escritura. Es una preselección amplia: el
 * puntaje de `scoreTextMatch` es el que decide.
 */
export function searchTermsFor(subject: MatchSubject, max = 4): string[] {
  const terms = new Set<string>();
  for (const text of [subject.name, subject.variant, subject.brand]) {
    if (!text) continue;
    for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (!word || STOPWORDS.has(normalizeText(word)) || isSizeToken(normalizeText(word))) continue;
      const plain = longestPlainRun(word);
      if (plain.length >= 3) terms.add(plain.length > 4 && plain.endsWith('s') ? plain.slice(0, -1) : plain);
    }
  }
  return [...terms].sort((a, b) => b.length - a.length).slice(0, max);
}
