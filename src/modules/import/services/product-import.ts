import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { normalizeHeader } from './parse.service';

/**
 * Piezas propias de la importación de PRODUCTOS (unidad, código de barras y
 * productor). Viven aparte de `import.service.ts` para poder probarlas sin
 * base de datos.
 */

const COMBINING_DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

/**
 * Genera un SKU único legible basado en el nombre.
 */
export function generateProductSku(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(COMBINING_DIACRITICS, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'PRODUCTO';

  let sku = base;
  let suffix = 1;
  while (taken.has(sku.toLowerCase())) {
    suffix++;
    sku = `${base}-${suffix}`;
  }
  taken.add(sku.toLowerCase());
  return sku;
}

export const PRODUCT_UNITS = ['UN', 'KG', 'MT', 'LTS', 'CJA', 'PAR'] as const;

/**
 * Abreviaturas con las que otros sistemas exportan la unidad de medida. Solo
 * equivalencias inequívocas: lo que no está aquí sigue siendo error de fila.
 */
const UNIT_SYNONYMS: Record<string, (typeof PRODUCT_UNITS)[number]> = {
  UNI: 'UN', UNID: 'UN', UND: 'UN', UNIDAD: 'UN', UNIDADES: 'UN',
  KILO: 'KG', KILOS: 'KG', KGS: 'KG', KILOGRAMO: 'KG', KILOGRAMOS: 'KG',
  LT: 'LTS', LTR: 'LTS', LITRO: 'LTS', LITROS: 'LTS',
  MTS: 'MT', METRO: 'MT', METROS: 'MT',
  CAJA: 'CJA', CAJAS: 'CJA',
  PARES: 'PAR',
};

/** Unidad canónica, `UN` si viene vacía, o `null` si no se reconoce. */
export function normalizeUnit(raw: string | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase().replace(/\./g, '');
  if (!value) return 'UN';
  if ((PRODUCT_UNITS as readonly string[]).includes(value)) return value;
  return UNIT_SYNONYMS[value] ?? null;
}

const BARCODE_PATTERN = /^[A-Za-z0-9._/-]{3,50}$/;
const SCIENTIFIC_NOTATION = /^\d(\.\d+)?E\+\d+$/i;

/** Mensaje de error del código de barras, o `null` si es aceptable (vacío también lo es). */
export function barcodeError(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (SCIENTIFIC_NOTATION.test(value.replace(',', '.'))) {
    return `"${value}" parece un número en notación científica (Excel lo recortó). Formatea la columna como texto y vuelve a exportar`;
  }
  if (!BARCODE_PATTERN.test(value)) {
    return `"${value}" no es un código válido (3 a 50 caracteres, solo letras, números, punto, guion o barra, sin espacios)`;
  }
  return null;
}

export interface ProducerRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ProducerLookup {
  byRut: Map<string, ProducerRef>;
  byName: Map<string, ProducerRef[]>;
}

export function buildProducerLookup(
  producers: ReadonlyArray<{ id: string; isActive: boolean; contact: { rutClean: string; razonSocial: string } }>
): ProducerLookup {
  const byRut = new Map<string, ProducerRef>();
  const byName = new Map<string, ProducerRef[]>();
  for (const producer of producers) {
    const ref: ProducerRef = { id: producer.id, name: producer.contact.razonSocial, isActive: producer.isActive };
    byRut.set(producer.contact.rutClean, ref);
    const key = normalizeHeader(producer.contact.razonSocial);
    byName.set(key, [...(byName.get(key) ?? []), ref]);
  }
  return { byRut, byName };
}

/**
 * Carga los productores de la empresa. Devuelve `null` si la tabla aún no
 * existe en esta base (migración de consignación sin aplicar): la columna
 * "Productor" es opcional, así que el resto de la importación sigue
 * funcionando y solo las filas que la usan reciben un error claro.
 */
export async function loadProducerLookup(companyId: string): Promise<ProducerLookup | null> {
  try {
    const producers = await prisma.producer.findMany({
      where: { companyId },
      select: { id: true, isActive: true, contact: { select: { rutClean: true, razonSocial: true } } },
    });
    return buildProducerLookup(producers);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code !== 'P2021' && code !== 'P2022') captureException(error, { module: 'importacion', companyId, extra: { reason: 'producer-lookup' } });
    return null;
  }
}

export type ProducerResolution = { ok: true; producer: ProducerRef } | { ok: false; message: string };

/** Resuelve el texto de la columna "Productor" (RUT o razón social) contra los productores de la empresa. */
export function resolveProducer(raw: string, lookup: ProducerLookup | null): ProducerResolution {
  const value = raw.trim();
  if (!lookup) {
    return { ok: false, message: 'Los productores (consignación) no están disponibles en esta cuenta; deja la columna vacía' };
  }
  let producer: ProducerRef | undefined;
  if (validateRut(value)) {
    producer = lookup.byRut.get(cleanRut(value));
  } else {
    const matches = lookup.byName.get(normalizeHeader(value)) ?? [];
    if (matches.length > 1) {
      return { ok: false, message: `Hay más de un productor llamado "${value}"; usa su RUT para distinguirlos` };
    }
    producer = matches[0];
  }
  if (!producer) {
    return { ok: false, message: `No existe un productor "${value}" en tu empresa. Créalo primero en Consignación o deja la columna vacía` };
  }
  if (!producer.isActive) {
    return { ok: false, message: `El productor "${producer.name}" está inactivo; reactívalo para asignarle productos` };
  }
  return { ok: true, producer };
}
