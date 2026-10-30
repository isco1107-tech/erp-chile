/**
 * Lo que el marketing de Aether NO puede decir (ADR 0015). Cada regla sale
 * de lo que el producto hace HOY según CLAUDE.md y de la Ley 19.496 del
 * Consumidor (publicidad veraz y comprobable). Viaja al agente de la
 * Supersuite en `marketing.contexto` (sin los patrones) y la aplica
 * `copy-review.ts` sobre cada texto.
 *
 * Los patrones se prueban contra el texto en minúsculas y SIN tildes
 * (`normalizeForMatch`): se escriben sin acentos. Cuando algo cambia en el
 * producto (por ejemplo, llega el envío al SII), se actualiza la regla aquí y
 * su prueba en `tests/marketing-copy-review.test.ts`.
 */

export type ClaimLevel = 'bloquea' | 'advierte';

export interface ClaimGuardrail {
  id: string;
  tema: string;
  nivel: ClaimLevel;
  /** Qué no decir, para el agente. */
  regla: string;
  /** Por qué: el hecho del producto o la ley que lo respalda. */
  porQue: string;
  patrones: RegExp[];
}

export const CLAIM_GUARDRAILS: readonly ClaimGuardrail[] = [
  {
    id: 'sii-envio',
    tema: 'SII',
    nivel: 'bloquea',
    regla: 'No decir que Aether envía documentos al SII, que está conectado o integrado con el SII, ni que reemplaza al portal del SII.',
    porQue: 'Aether timbra con el CAF y genera el XML del DTE, pero la firma con el certificado digital y el envío al SII todavía no existen (el propio landing lo dice).',
    patrones: [/\benvi\w*\s+(?:\w+\s+){0,3}al\s+sii\b/, /\b(?:conectad|integrad|sincronizad)\w*\s+(?:directamente\s+)?(?:con|al)\s+(?:el\s+)?sii\b/, /\breemplaz\w*\s+(?:\w+\s+){0,3}(?:portal|pagina)\s+del\s+sii\b/],
  },
  {
    id: 'facturacion-electronica',
    tema: 'SII',
    nivel: 'bloquea',
    regla: 'No ofrecer «facturación electrónica» ni boletas o facturas con validez ante el SII.',
    porQue: 'Facturación electrónica está fuera de la oferta y de todo plan, y sin envío al SII un documento no tiene validez tributaria.',
    patrones: [/\bfacturacion\s+electronica\b/, /\b(?:boletas?|facturas?)\s+electronicas?\s+(?:\w+\s+){0,2}(?:validas?|ante\s+el\s+sii|al\s+sii)\b/, /\bvalidez\s+(?:tributaria|legal|ante\s+el\s+sii)\b/],
  },
  {
    id: 'sii-certificacion',
    tema: 'SII',
    nivel: 'bloquea',
    regla: 'No decir que Aether está certificado, homologado o aprobado por el SII.',
    porQue: 'No existe tal certificación. (Que los folios los autoriza el SII sí es cierto: eso se puede decir.)',
    patrones: [/\b(?:certificad|homologad|aprobad|avalad)\w*\s+(?:\w+\s+){0,2}(?:por\s+el\s+)?sii\b/],
  },
  {
    id: 'pos-sin-conexion',
    tema: 'Punto de venta',
    nivel: 'bloquea',
    regla: 'No decir que el punto de venta o el ERP funcionan sin conexión.',
    porQue: 'El POS necesita conexión para confirmar cada operación; no hay sincronización contable sin conexión.',
    patrones: [/\bsin\s+(?:conexion|internet|senal)\b/, /\boffline\b/, /\bfuera\s+de\s+linea\b/],
  },
  {
    id: 'webpay',
    tema: 'Pagos',
    nivel: 'advierte',
    regla: 'No ofrecer Webpay como algo probado.',
    porQue: 'Webpay Plus se escribió y probó solo contra una pasarela simulada; falta un pago completo con credenciales de Transbank.',
    patrones: [/\bwebpay\b/, /\btransbank\b/],
  },
  {
    id: 'hardware-pos',
    tema: 'Punto de venta',
    nivel: 'advierte',
    regla: 'No prometer compatibilidad con cajones o impresoras específicas.',
    porQue: 'El cajón y la impresora se probaron con dispositivos simulados; ningún equipo físico está probado.',
    patrones: [/\b(?:cajon|cajones|impresoras?)\s+(?:\w+\s+){0,3}(?:compatibles?|probad\w*|certificad\w*)\b/],
  },
  {
    id: 'tiendas-de-apps',
    tema: 'Aplicaciones',
    nivel: 'advierte',
    regla: 'No mencionar Google Play, App Store ni APK.',
    porQue: 'Las aplicaciones se instalan desde el navegador (Bodega, Control, Seller Center) o con el instalador de escritorio del POS; no hay apps publicadas en tiendas.',
    patrones: [/\bgoogle\s+play\b/, /\bapp\s+store\b/, /\bapk\b/, /\bplay\s+store\b/],
  },
  {
    id: 'ia-reemplaza',
    tema: 'Inteligencia artificial',
    nivel: 'bloquea',
    regla: 'No decir que la IA reemplaza al contador, declara impuestos o hace la contabilidad sola.',
    porQue: 'Los agentes proponen y crean borradores con confirmación; nunca emiten DTE, mueven stock ni registran pagos. El F29 se calcula, no se declara.',
    patrones: [
      /\breemplaz\w*\s+(?:\w+\s+){0,2}(?:contador\w*|contabilidad)\b/,
      /\b(?:declara|paga)\w*\s+(?:\w+\s+){0,3}(?:impuestos|f29|iva)\s+(?:\w+\s+){0,2}(?:sol[oa]s?|automatic\w*|por\s+ti)\b/,
      /\bla\s+ia\s+(?:\w+\s+){0,2}(?:emite|declara|paga|lleva\s+(?:tu|la)\s+contabilidad)\b/,
    ],
  },
  {
    id: 'superlativos',
    tema: 'Ley del Consumidor',
    nivel: 'bloquea',
    regla: 'Nada de «el mejor», «número 1», «líder» ni «el único» sin un estudio que lo respalde.',
    porQue: 'Ley 19.496: la publicidad debe ser veraz y comprobable; una comparación sin respaldo objetivo es engañosa.',
    patrones: [
      /\b(?:el|la)\s+mejor\s+(?:erp|sistema|software|plataforma|opcion|herramienta)\b/,
      /\bnumero\s*(?:1|uno)\b/,
      /#\s?1\b/,
      /\bunic[oa]s?\s+(?:erp|sistema|software|plataforma)\s+(?:\w+\s+){0,4}(?:chile|mercado|pais)\b/,
      /\blider(?:es)?\s+(?:del|en\s+el)\s+mercado\b/,
    ],
  },
  {
    id: 'garantias',
    tema: 'Ley del Consumidor',
    nivel: 'bloquea',
    regla: 'Nada de garantías absolutas: «garantizado», «100% seguro», «sin errores», «nunca falla».',
    porQue: 'Ninguna plataforma puede prometerlo y la Ley 19.496 obliga a cumplir lo que se ofrece en la publicidad.',
    patrones: [/\bgarantiz\w*/, /\b100\s*%\s*(?:segur|confiable|libre|garantiz|exact|efectiv)/, /\bsin\s+errores\b/, /\bcero\s+errores\b/, /\bnunca\s+(?:falla|se\s+cae)\b/],
  },
  {
    id: 'gratis',
    tema: 'Precio',
    nivel: 'advierte',
    regla: 'No ofrecer nada «gratis» ni «sin costo».',
    porQue: 'No hay un plan gratuito publicado: solo si ventas lo confirmó para esa campaña (y la pieza lo dice con sus condiciones).',
    patrones: [/\bgratis\b/, /\bgratuit\w*/, /\bsin\s+costo\b/],
  },
];

/** Minúsculas y sin tildes (la ñ queda como n): así se escriben los patrones. */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
