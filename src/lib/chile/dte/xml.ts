/**
 * Utilidades de serialización XML para los documentos del SII.
 *
 * No se usa una librería de construcción de XML a propósito: los documentos
 * del SII se firman sobre su serialización exacta, así que quien controla los
 * bytes controla la validez de la firma. Una librería que decida por su cuenta
 * el orden de atributos, la indentación o la forma de las etiquetas vacías
 * puede producir un XML equivalente pero con otra firma.
 */

/**
 * Escapa texto para incrustarlo como contenido de un elemento.
 *
 * El SII exige la codificación de estos cinco caracteres; una razón social con
 * `&` (muy común: "PEREZ & CIA LTDA") produce un XML mal formado sin esto y el
 * documento se rechaza completo.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Recorta y limpia un texto a la longitud máxima que admite un campo del SII.
 *
 * Los esquemas del SII definen largos máximos estrictos (por ejemplo `IT1` del
 * timbre son 40 caracteres). Pasarse no es una advertencia: el documento se
 * rechaza. Se normalizan además los saltos de línea, que no son válidos dentro
 * de estos campos.
 */
export function fitField(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Elemento simple. Devuelve cadena vacía si no hay valor, para poder omitir opcionales. */
export function element(tag: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

/**
 * Fecha en formato `AAAA-MM-DD` según la zona horaria de Chile.
 *
 * Se calcula sobre la hora chilena y no sobre UTC porque un documento emitido
 * a las 21:00 en Chile ya es del día siguiente en UTC: usar UTC adelantaría la
 * fecha de emisión de todos los documentos de la tarde, que para el SII es una
 * inconsistencia entre la fecha declarada y el período tributario.
 */
export function siiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Marca de tiempo `AAAA-MM-DDTHH:MM:SS` en hora de Chile, sin sufijo de zona (el SII no lo admite). */
export function siiTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  // `en-CA` con hour12:false devuelve "24" para la medianoche; el SII espera "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * RUT en el formato que exige el SII: sin puntos, con guion, dígito
 * verificador en mayúscula. `12.345.678-k` → `12345678-K`.
 */
export function siiRut(rut: string): string {
  return rut.replace(/[.\s]/g, '').toUpperCase();
}
