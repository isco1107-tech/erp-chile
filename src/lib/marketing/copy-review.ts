import { CHANNEL_RULES, type MarketingChannel } from './brand-voice';
import { CLAIM_GUARDRAILS, normalizeForMatch, type ClaimLevel } from './claims';

/**
 * Revisión automática de un texto de marketing de Aether (ADR 0015), la
 * puerta que toda pieza pasa antes de publicarse (orden `marketing.revisar`).
 *
 * No mide si el texto es bueno —eso lo hacen la crítica del agente y la
 * persona que aprueba—, sino que atrapa lo que lo delata como «un anuncio más
 * de IA» o lo vuelve falso o riesgoso:
 *  - promesas que el producto no cumple y superlativos sin respaldo (`claims.ts`);
 *  - precios que no están en el tarifario;
 *  - muletillas de texto generado («en la era digital», «lleva tu negocio al
 *    siguiente nivel», «no es solo X, es Y», rayas por todas partes);
 *  - exceso de emojis, hashtags, exclamaciones y MAYÚSCULAS;
 *  - datos personales (correos, RUT, teléfonos) y españolismos.
 *
 * Pura y determinista: el mismo texto da el mismo resultado.
 */

export type ReviewLevel = ClaimLevel;

export interface ReviewFinding {
  regla: string;
  nivel: ReviewLevel;
  mensaje: string;
  fragmento?: string;
}

export interface CopyReview {
  aprobado: boolean;
  puntaje: number;
  hallazgos: ReviewFinding[];
  metricas: { caracteres: number; palabras: number; hashtags: number; emojis: number; exclamaciones: number };
}

export interface CopyReviewContext {
  /**
   * Montos que Aether publica (los «desde» del landing). Vacío = Aether no
   * publica precios y cualquier monto bloquea: se invita a cotizar.
   */
  preciosValidos: readonly number[];
  /** Dominios de Aether: un enlace a ellos debe llevar `utm_campaign`. */
  dominiosPropios: readonly string[];
  /** Correos que sí pueden aparecer (ventas). */
  correosPermitidos: readonly string[];
}

/** Puntaje mínimo para aprobar (sin bloqueos): admite hasta 3 advertencias. */
export const PASSING_SCORE = 76;
const BLOCK_COST = 30;
const WARN_COST = 8;

/**
 * Muletillas que delatan texto generado o de plantilla. Se escriben sin tildes
 * y en minúsculas (se comparan contra `normalizeForMatch`).
 */
export const AI_TELLS: readonly { patron: RegExp; ejemplo: string }[] = [
  { patron: /\ben\s+(?:el\s+mundo\s+(?:actual|de\s+hoy)|la\s+era\s+digital|el\s+vertiginoso|un\s+mundo\s+cada\s+vez)/, ejemplo: 'en el mundo actual / en la era digital' },
  { patron: /\b(?:lleva|llevar|llevamos)\s+(?:tu|su)\s+(?:negocio|empresa|emprendimiento)\s+al\s+(?:siguiente|proximo|otro)\s+nivel\b/, ejemplo: 'lleva tu negocio al siguiente nivel' },
  { patron: /\ba\s+otro\s+nivel\b/, ejemplo: 'a otro nivel' },
  { patron: /\brevoluciona\w*/, ejemplo: 'revoluciona' },
  { patron: /\bdesbloque\w*/, ejemplo: 'desbloquea' },
  { patron: /\bsumergete\b|\bsumerjete\b/, ejemplo: 'sumérgete' },
  { patron: /\bdescubre\s+(?:como|el|la|los|las|todo|por\s+que)\b/, ejemplo: 'descubre cómo' },
  { patron: /\bpotencia\s+(?:tu|tus|su|sus)\b/, ejemplo: 'potencia tu' },
  { patron: /\b(?:transforma|eleva|maximiza|impulsa)\s+(?:tu|tus|su|sus)\s+(?:negocio|empresa|productividad|ventas|potencial)\b/, ejemplo: 'transforma tu negocio' },
  { patron: /\bsabias\s+que\b/, ejemplo: '¿Sabías que…?' },
  { patron: /\bimagina\s+(?:un|una|que|poder)\b/, ejemplo: 'imagina un mundo' },
  { patron: /\bno\s+te\s+(?:lo\s+)?pierdas\b/, ejemplo: '¡No te lo pierdas!' },
  { patron: /\bsin\s+precedentes\b/, ejemplo: 'sin precedentes' },
  { patron: /\bde\s+vanguardia\b/, ejemplo: 'de vanguardia' },
  { patron: /\bsolucion(?:es)?\s+integral(?:es)?\b/, ejemplo: 'solución integral' },
  { patron: /\bgame\s*changer\b/, ejemplo: 'game changer' },
  { patron: /\bun\s+antes\s+y\s+un\s+despues\b/, ejemplo: 'un antes y un después' },
  { patron: /\bel\s+futuro\s+(?:es|ya\s+es)\s+(?:ahora|hoy)\b/, ejemplo: 'el futuro es ahora' },
  { patron: /\btu\s+(?:mejor\s+)?aliad[oa]\b/, ejemplo: 'tu aliado' },
  { patron: /\ben\s+un\s+abrir\s+y\s+cerrar\s+de\s+ojos\b/, ejemplo: 'en un abrir y cerrar de ojos' },
  { patron: /\btodo\s+lo\s+que\s+necesitas\b/, ejemplo: 'todo lo que necesitas' },
  { patron: /\bmas\s+alla\s+de\s+lo\s+(?:imaginable|que\s+imaginas)\b/, ejemplo: 'más allá de lo imaginable' },
  { patron: /\b(?:te\s+lo\s+contamos|te\s+contamos\s+todo)\b/, ejemplo: 'te lo contamos' },
  { patron: /\bhilo\b.*\u{1F9F5}|\u{1F9F5}/u, ejemplo: 'hilo 🧵' },
  { patron: /\bcansad[oa]\s+de\b/, ejemplo: '¿Cansado de…?' },
  { patron: /\bte\s+has\s+preguntado\b/, ejemplo: '¿Te has preguntado…?' },
  { patron: /\bperfecto\s+para\s+(?:ti|tu)\b/, ejemplo: 'perfecto para ti' },
];

/** «No es solo X, es Y» y sus variantes: la construcción más reconocible del texto generado. */
const NOT_JUST_RE = /\bno\s+(?:es|son)\s+(?:solo|solamente|simplemente|un[ao]?\s+mas)\s+[^.!?\n]{1,60}[,;:—-]\s*(?:es|son)\b/;
const MORE_THAN_RE = /\b(?:es\s+)?mas\s+que\s+un[ao]?\s+(?:erp|sistema|software|plataforma|herramienta|app)\b/;

const SPAIN_ISMS: readonly { patron: RegExp; chile: string }[] = [
  { patron: /\bordenador(?:es)?\b/, chile: 'computador' },
  { patron: /\bvosotr[oa]s\b/, chile: 'ustedes' },
  { patron: /\bvuestr[oa]s?\b/, chile: 'su / sus' },
  { patron: /\bguay\b/, chile: '(otra palabra)' },
  { patron: /\bmola\b|\bmolan\b/, chile: '(otra palabra)' },
  { patron: /\bcoger\b|\bcoge\b|\bcogemos\b/, chile: 'tomar' },
  { patron: /\bflipa\w*\b/, chile: '(otra palabra)' },
];

/** Siglas que sí van en mayúsculas. */
const ACRONYMS = new Set(['SII', 'IVA', 'RUT', 'ERP', 'POS', 'DTE', 'F29', 'PYME', 'PYMES', 'CLP', 'UTM', 'PWA', 'CRM', 'CAF', 'TED', 'PMP', 'XML', 'PDF', 'NPS', 'CSAT', 'SKU', 'AETHER', 'IA', 'UF', 'RRHH', 'API', 'ISO', 'HACCP', 'SEREMI', 'SAG', 'PPM', 'AFP', 'ISAPRE', 'FONASA', 'BCI', 'SUMUP']);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const HASHTAG_RE = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>()]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const PHONE_RE = /(?:\+?56\s?)?\b9\s?\d{4}\s?\d{4}\b/g;
const PRICE_RE = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?![\d.,]*\s*(?:mil|millones?|mm)\b)/gi;
const PERCENT_RE = /\b\d+(?:[.,]\d+)?\s?%/g;
const MULTIPLIER_RE = /\b\d+(?:[.,]\d+)?\s?(?:x|veces)\s+(?:mas|menos)\b/;
const SAVINGS_RE = /\bahorr\w*\s+(?:hasta\s+)?\d+/;

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

function firstMatch(text: string, re: RegExp): RegExpExecArray | null {
  const flags = re.flags.replace('g', '');
  return new RegExp(re.source, flags).exec(text);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function reviewMarketingCopy(text: string, channel: MarketingChannel, context: CopyReviewContext): CopyReview {
  const rules = CHANNEL_RULES[channel];
  const findings: ReviewFinding[] = [];
  const add = (regla: string, nivel: ReviewLevel, mensaje: string, fragmento?: string) => findings.push({ regla, nivel, mensaje, ...(fragmento ? { fragmento } : {}) });

  const trimmed = text.trim();
  const norm = normalizeForMatch(trimmed);
  const metricas = {
    caracteres: [...trimmed].length,
    palabras: trimmed ? trimmed.split(/\s+/).length : 0,
    hashtags: (trimmed.match(HASHTAG_RE) ?? []).length,
    emojis: (trimmed.match(EMOJI_RE) ?? []).length,
    exclamaciones: (trimmed.match(/!/g) ?? []).length,
  };

  if (!trimmed) {
    add('vacio', 'bloquea', 'El texto está vacío.');
    return { aprobado: false, puntaje: 0, hallazgos: findings, metricas };
  }

  // ── Forma, según el canal ────────────────────────────────────────────────
  if (metricas.caracteres > rules.maxCaracteres) add('largo', 'bloquea', `${rules.nombre} admite hasta ${rules.maxCaracteres} caracteres y el texto tiene ${metricas.caracteres}.`);
  const hook = trimmed.split('\n')[0]?.trim() ?? '';
  if ([...hook].length > rules.ganchoMax) add('gancho', 'advierte', `La primera línea tiene ${[...hook].length} caracteres: en ${rules.nombre} se corta a los ~${rules.ganchoMax}. El gancho tiene que sostenerse solo.`, hook.slice(0, 60));
  if (metricas.hashtags > rules.hashtagsMax) add('hashtags', 'advierte', `${metricas.hashtags} hashtags: en ${rules.nombre} el máximo de la guía es ${rules.hashtagsMax}. Los hashtags de relleno se ven a anuncio automático.`);
  if (metricas.emojis > rules.emojisMax) add('emojis', 'advierte', `${metricas.emojis} emojis: el máximo en ${rules.nombre} es ${rules.emojisMax}, y solo si cumplen una función.`);
  if (metricas.exclamaciones > 1) add('exclamaciones', 'advierte', `${metricas.exclamaciones} signos de exclamación: con uno basta (o ninguno).`);
  const shouting = (trimmed.match(/(?<![\p{L}\p{N}])\p{Lu}{4,}(?![\p{L}\p{N}])/gu) ?? []).filter((word) => !ACRONYMS.has(word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  if (shouting.length >= 2) add('mayusculas', 'advierte', 'Palabras enteras en MAYÚSCULAS: en el texto se lee como un grito. Las mayúsculas van en el diseño, no en el texto.', shouting.slice(0, 3).join(', '));

  // ── Promesas que el producto no cumple y Ley del Consumidor ─────────────
  for (const guard of CLAIM_GUARDRAILS) {
    for (const pattern of guard.patrones) {
      const m = firstMatch(norm, pattern);
      if (m) {
        add(`afirmacion:${guard.id}`, guard.nivel, `${guard.regla} ${guard.porQue}`, snippet(norm, m.index, m[0].length));
        break;
      }
    }
  }

  // ── Precios: solo los del tarifario, y siempre netos + IVA ──────────────
  const valid = new Set(context.preciosValidos);
  let anyPrice = false;
  for (const m of trimmed.matchAll(PRICE_RE)) {
    const amount = Number(m[1].replace(/\./g, ''));
    anyPrice = true;
    if (valid.has(amount)) continue;
    const why = valid.size
      ? `$${m[1]} no es un precio que Aether publique. Los precios salen de \`oferta.politicaDePrecios\` del contexto, nunca se redondean ni se inventan.`
      : `Aether no publica precios (igual que el landing: «precio según módulos, cotización a medida»). En vez de un monto, invita a cotizar.`;
    add('precio', 'bloquea', why, snippet(trimmed, m.index ?? 0, m[0].length));
  }
  if (anyPrice && !/\+\s?iva\b|\bmas\s+iva\b|\bneto\b|\bnetos\b/.test(norm)) add('precio-iva', 'advierte', 'Los precios de Aether son netos: di «+ IVA» junto al monto.');

  // ── Cifras sin fuente ────────────────────────────────────────────────────
  // El 19% de IVA es un dato legal, no una promesa: no cuenta como cifra sin fuente.
  const percent = [...trimmed.matchAll(PERCENT_RE)].find((m) => !(Number(m[0].replace(/[^\d.,]/g, '').replace(',', '.')) === 19 && /\biva\b/.test(norm))) ?? null;
  const multiplier = firstMatch(norm, MULTIPLIER_RE);
  const savings = firstMatch(norm, SAVINGS_RE);
  const figure = percent ?? multiplier ?? savings;
  if (figure) add('cifra', 'advierte', 'Una cifra (porcentaje, «x veces», «ahorra N») solo va si sale de datos reales y la fuente está anotada en la ficha de la pieza. El IVA (19%) y las tasas legales sí se pueden citar.', snippet(percent ? trimmed : norm, figure.index ?? 0, figure[0].length));

  // ── Muletillas de texto generado ────────────────────────────────────────
  const tells = AI_TELLS.flatMap((t) => {
    const m = firstMatch(norm, t.patron);
    return m ? [{ ...t, m }] : [];
  });
  for (const tell of tells) add('muletilla', 'advierte', `Muletilla de texto genérico («${tell.ejemplo}»): dilo con un hecho concreto.`, snippet(norm, tell.m.index, tell.m[0].length));
  if (NOT_JUST_RE.test(norm) || MORE_THAN_RE.test(norm)) {
    add('muletilla', 'advierte', 'Construcción «no es solo X, es Y» / «más que un ERP»: es la marca más reconocible del texto generado. Di directamente qué hace.');
  }
  const dashes = (trimmed.match(/—/g) ?? []).length;
  if (dashes >= 2) add('rayas', 'advierte', `${dashes} rayas (—): usadas en serie delatan texto generado. Usa punto o coma.`);
  if (tells.length >= 3) add('plantilla', 'bloquea', `${tells.length} muletillas de plantilla en un mismo texto: hay que reescribirlo desde un hecho concreto, no retocarlo.`);

  // ── Español de Chile ─────────────────────────────────────────────────────
  for (const word of SPAIN_ISMS) {
    const m = firstMatch(norm, word.patron);
    if (m) add('espanol-chile', 'advierte', `«${m[0]}» no se usa en Chile: ${word.chile}.`, m[0]);
  }

  // ── Datos personales ─────────────────────────────────────────────────────
  const allowedEmails = new Set(context.correosPermitidos.map((e) => e.toLowerCase()));
  for (const m of trimmed.matchAll(EMAIL_RE)) {
    if (!allowedEmails.has(m[0].toLowerCase())) add('dato-personal', 'bloquea', 'Un correo que no es el de ventas de Aether: nunca datos de personas o clientes en una publicación.', m[0]);
  }
  const rut = firstMatch(trimmed, RUT_RE);
  if (rut) add('dato-personal', 'bloquea', 'Un RUT en el texto: nunca datos de personas o empresas clientes en una publicación.', rut[0]);
  const phone = firstMatch(trimmed, PHONE_RE);
  if (phone) add('telefono', 'advierte', 'Un número de teléfono: solo el WhatsApp oficial de ventas, y mejor como botón que en el texto.', phone[0]);

  // ── Enlaces ──────────────────────────────────────────────────────────────
  const own = new Set(context.dominiosPropios.map((d) => d.toLowerCase().replace(/^www\./, '')));
  const urls = trimmed.match(URL_RE) ?? [];
  if (urls.length && !rules.enlacesEnTexto) add('enlace-no-clicable', 'advierte', `En ${rules.nombre} un enlace escrito en el texto no se puede tocar: va en la bio o en una historia.`);
  for (const url of urls) {
    const host = hostOf(url);
    if (host && own.has(host) && !/[?&]utm_campaign=/.test(url)) add('enlace-sin-campana', 'advierte', 'Un enlace a Aether sin utm_campaign: no se podrá saber qué trajo esta pieza.', url);
  }

  const blocks = findings.filter((f) => f.nivel === 'bloquea').length;
  const warns = findings.length - blocks;
  const puntaje = Math.max(0, 100 - blocks * BLOCK_COST - warns * WARN_COST);
  return { aprobado: blocks === 0 && puntaje >= PASSING_SCORE, puntaje, hallazgos: findings, metricas };
}
