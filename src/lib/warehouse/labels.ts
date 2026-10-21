import { daySchema, type WarehouseProduct } from './contracts';

export interface LabelReading { barcode?: string; lotNumber?: string; expiryDate?: string; weightKg?: number; warnings: string[] }
function gs1Day(value: string): string | undefined {
  if (!/^\d{6}$/.test(value)) return undefined;
  const year = 2000 + Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  const actualDay = day || new Date(Date.UTC(year, month, 0)).getUTCDate();
  const result = `${year}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
  return daySchema.safeParse(result).success ? result : undefined;
}

/** GS1 con FNC1 (ASCII 29), identificadores impresos o Digital Link. No adivina separadores ausentes. */
export function parseGs1(input: string): LabelReading {
  const result: LabelReading = { warnings: [] };
  const values = new Map<string, string>();
  if (/^https:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const segments = url.pathname.split('/').filter(Boolean);
      for (let i = 0; i < segments.length - 1; i += 2) values.set(segments[i], decodeURIComponent(segments[i + 1]));
      url.searchParams.forEach((value, key) => values.set(key, value));
    } catch { result.warnings.push('El enlace del código no se pudo interpretar'); }
  } else if (/\(\d{2,4}\)/.test(input)) {
    for (const match of input.matchAll(/\((\d{2,4})\)([^()\x1d]*)/g)) values.set(match[1], match[2].trim());
  } else {
    let remaining = input.replace(/^\][A-Za-z]\d/, '').replace(/^\x1d/, '');
    while (remaining) {
      remaining = remaining.replace(/^\x1d+/, '');
      if (!remaining) break;
      const ai = remaining.startsWith('310') ? remaining.slice(0, 4) : remaining.slice(0, 2);
      const fixed = ai === '01' || ai === '02' ? 14 : ['11', '13', '15', '17'].includes(ai) || /^310\d$/.test(ai) ? 6 : undefined;
      if (fixed !== undefined) {
        const value = remaining.slice(ai.length, ai.length + fixed);
        if (!new RegExp(`^\\d{${fixed}}$`).test(value)) break;
        values.set(ai, value); remaining = remaining.slice(ai.length + fixed);
      } else if (['10', '21', '30', '37'].includes(ai)) {
        const end = remaining.indexOf('\x1d', ai.length);
        const value = remaining.slice(ai.length, end === -1 ? undefined : end);
        if (!value || value.length > (ai === '10' || ai === '21' ? 20 : 8)) break;
        values.set(ai, value); remaining = end === -1 ? '' : remaining.slice(end + 1);
      } else { if (values.size) result.warnings.push('El código contiene información adicional que requiere revisión'); break; }
    }
  }
  const gtin = values.get('01') ?? values.get('02');
  if (gtin && /^\d{14}$/.test(gtin)) result.barcode = gtin;
  const lot = values.get('10');
  if (lot && lot.length <= 40) result.lotNumber = lot;
  const expiry = values.get('17');
  if (expiry) { result.expiryDate = gs1Day(expiry); if (!result.expiryDate) result.warnings.push('Revisa el vencimiento del código'); }
  for (const [ai, value] of values) if (/^310\d$/.test(ai) && /^\d{6}$/.test(value)) result.weightKg = Number(value) / 10 ** Number(ai[3]);
  return result;
}

export function readLabelText(text: string): LabelReading {
  const result = parseGs1(text);
  const lot = text.match(/(?:LOTE|LOT|BATCH)\s*(?:N[º°o.]*)?\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/_-]{0,39})/i);
  if (!result.lotNumber && lot) result.lotNumber = lot[1];
  const expiry = text.match(/(?:VENC(?:IMIENTO)?|VTO|EXP(?:IRY)?|CAD(?:UCIDAD)?)\.?\s*[:.-]?\s*(\d{2,4})[/.\-](\d{2})[/.\-](\d{2,4})/i);
  if (!result.expiryDate && expiry) {
    const [, first, month, last] = expiry;
    const year = first.length === 4 ? first : last.length === 4 ? last : `20${last}`;
    const day = first.length === 4 ? last : first;
    const candidate = `${year}-${month}-${day}`;
    if (daySchema.safeParse(candidate).success) result.expiryDate = candidate;
    else result.warnings.push('No se pudo reconocer una fecha válida');
  }
  const weight = text.match(/(?:PESO(?:\s+NETO)?|NET(?:\s+WEIGHT)?)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)\s*KG/i);
  if (weight && result.weightKg === undefined) result.weightKg = Number(weight[1].replace(',', '.'));
  return result;
}

export function matchWarehouseCode(products: readonly WarehouseProduct[], input: string): { product: WarehouseProduct; factor: number; packagingName: string | null; reading: LabelReading } | null {
  const raw = input.trim();
  const reading = parseGs1(raw);
  const code = reading.barcode ?? raw;
  const codes = new Set([code, ...(code.length === 14 && code.startsWith('0') ? [code.slice(1)] : [])]);
  for (const product of products) {
    if ((product.barcode && codes.has(product.barcode)) || product.sku.toUpperCase() === code.toUpperCase()) return { product, factor: 1, packagingName: null, reading };
    const packaging = product.packagings.find((entry) => entry.barcode && codes.has(entry.barcode));
    if (packaging) return { product, factor: packaging.factor, packagingName: packaging.name, reading };
  }
  return null;
}
