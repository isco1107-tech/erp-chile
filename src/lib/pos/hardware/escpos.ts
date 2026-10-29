import { formatCurrency } from '@/lib/chile/tax';
import { formatQuantity } from '../cart';
import { ticketHeading, type TicketData } from '../ticket';

/**
 * ESC/POS: el lenguaje de casi todas las impresoras térmicas de boletas (Epson,
 * Bixolon, Star en modo ESC/POS, Xprinter, etc.) y de los cajones que cuelgan
 * de ellas por el conector RJ11. Todo aquí son bytes puros: se puede probar sin
 * impresora, pero lo que se IMPRIME de verdad depende del modelo (juego de
 * caracteres, ancho de papel), por eso la pantalla de configuración tiene una
 * "prueba de impresión" para verificarlo antes de usarlo en una venta.
 */
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type CodePage = 'cp858' | 'cp850';
/** Número de la tabla de caracteres para `ESC t n` (PC858 = 19, PC850 = 2 en Epson y compatibles). */
export const CODE_PAGE_ID: Record<CodePage, number> = { cp858: 19, cp850: 2 };

/** Mitad alta (0x80–0xFF) de la página 850: tildes, ñ, ¿, ¡ y símbolos de uso común. */
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅ' +
  'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
  'áíóúñÑªº¿®¬½¼¡«»' +
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
  'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' +
  '­±‗¾¶§÷¸°¨·¹³²■ ';

function buildTable(codePage: CodePage): Map<string, number> {
  const high = codePage === 'cp858' ? `${CP850_HIGH.slice(0, 0x55)}€${CP850_HIGH.slice(0x56)}` : CP850_HIGH;
  const table = new Map<string, number>();
  [...high].forEach((char, index) => {
    if (!table.has(char)) table.set(char, 0x80 + index);
  });
  return table;
}

const TABLES: Record<CodePage, Map<string, number>> = { cp858: buildTable('cp858'), cp850: buildTable('cp850') };

/** Sustitutos ASCII de signos que la impresora no tiene. */
const ASCII_FALLBACK: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '*', '\t': ' ', ' ': ' ',
};

/** Texto → bytes de la página elegida. Lo que no existe sale como `?`: nunca rompe el trabajo de impresión. */
export function encodeText(text: string, codePage: CodePage = 'cp858'): number[] {
  const table = TABLES[codePage];
  const bytes: number[] = [];
  for (const raw of text) {
    const char = ASCII_FALLBACK[raw] ?? raw;
    for (const piece of char) {
      const code = piece.codePointAt(0) ?? 0x3f;
      // Cualquier espacio Unicode (el de "p. m." de las fechas es U+202F) sale como espacio normal, no como `?`.
      if (/\p{Zs}/u.test(piece)) bytes.push(0x20);
      else if (code === LF) bytes.push(LF);
      else if (code >= 0x20 && code < 0x7f) bytes.push(code);
      else if (code < 0x20 || code === 0x7f) bytes.push(0x20);
      else bytes.push(table.get(piece) ?? 0x3f);
    }
  }
  return bytes;
}

/** Corta o rellena a `width` caracteres. */
function fit(text: string, width: number): string {
  return text.length > width ? text.slice(0, width) : text;
}

/** Parte un texto en líneas de hasta `width` caracteres, sin cortar palabras salvo que sean más largas que la línea. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (rest.length > width) {
        if (current) { lines.push(current); current = ''; }
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      if (!current) current = rest;
      else if (current.length + 1 + rest.length <= width) current += ` ${rest}`;
      else { lines.push(current); current = rest; }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

/** Izquierda y derecha en la misma línea; si no caben, la izquierda baja a otra línea. */
export function twoColumns(left: string, right: string, width: number): string[] {
  if (left.length + 1 + right.length <= width) return [left + ' '.repeat(width - left.length - right.length) + right];
  const wrapped = wrapText(left, Math.max(8, width - right.length - 1));
  const last = wrapped.pop() ?? '';
  return [...wrapped, fit(last, Math.max(0, width - right.length - 1)).padEnd(width - right.length) + right];
}

const center = (text: string, width: number): string => {
  const clipped = fit(text, width);
  return ' '.repeat(Math.floor((width - clipped.length) / 2)) + clipped;
};

/**
 * Pulso que abre el cajón: `ESC p m t1 t2`. `pin` 0 es el conector 2 (el que
 * usan casi todos los cajones RJ11) y 1 el conector 5. t1/t2 van en unidades de
 * 2 ms: por defecto 50 ms encendido y 500 ms apagado, el `1B 70 00 19 FA` clásico.
 */
export function drawerPulse(options: { pin?: 0 | 1; pulseMs?: number } = {}): Uint8Array {
  const pin = options.pin ?? 0;
  const on = Math.min(255, Math.max(1, Math.round((options.pulseMs ?? 50) / 2)));
  return Uint8Array.from([ESC, 0x70, pin, on, 0xfa]);
}

export class EscPosBuilder {
  private readonly bytes: number[] = [];

  constructor(private readonly codePage: CodePage = 'cp858') {
    this.bytes.push(ESC, 0x40, ESC, 0x74, CODE_PAGE_ID[codePage]);
  }

  align(mode: 'left' | 'center' | 'right'): this {
    this.bytes.push(ESC, 0x61, mode === 'left' ? 0 : mode === 'center' ? 1 : 2);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Tamaño del texto: 1 = normal, 2 = doble. */
  size(width: 1 | 2, height: 1 | 2): this {
    this.bytes.push(GS, 0x21, ((width - 1) << 4) | (height - 1));
    return this;
  }

  line(text = ''): this {
    this.bytes.push(...encodeText(text, this.codePage), LF);
    return this;
  }

  feed(lines: number): this {
    this.bytes.push(ESC, 0x64, Math.min(255, Math.max(0, lines)));
    return this;
  }

  /** Corte parcial (GS V 1): lo entienden Epson y casi todos los compatibles. */
  cut(): this {
    this.bytes.push(GS, 0x56, 0x01);
    return this;
  }

  raw(bytes: Uint8Array): this {
    this.bytes.push(...bytes);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export interface TicketPrintOptions {
  /** Caracteres por línea con la fuente normal: 48 en papel de 80 mm, 32 en 58 mm. */
  columns: number;
  codePage: CodePage;
  cut: boolean;
  /** Pulso del cajón al INICIO del trabajo, así se abre mientras sale la boleta. */
  drawer?: { pin: 0 | 1; pulseMs: number };
}

const SANTIAGO = 'America/Santiago';

/** 25-10-2026 15:30, en hora de Santiago y sin "a. m./p. m.": la impresora no necesita esos espacios especiales. */
function when(date: Date): string {
  return date
    .toLocaleString('es-CL', { timeZone: SANTIAGO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .replace(',', '');
}

/** La boleta de mostrador en ESC/POS: mismo contenido que `PosTicket`, en texto de ancho fijo. */
export function buildTicketEscPos(data: TicketData, options: TicketPrintOptions): Uint8Array {
  const width = Math.max(24, Math.min(64, options.columns));
  const rule = '-'.repeat(width);
  const out = new EscPosBuilder(options.codePage);
  if (options.drawer) out.raw(drawerPulse(options.drawer));

  out.align('center').bold(true);
  for (const part of wrapText(data.companyName, width)) out.line(part);
  out.bold(false).line(`RUT ${data.companyRut}`);
  if (data.companyAddress) for (const part of wrapText(data.companyAddress, width)) out.line(part);
  out.align('left').line(rule);

  const heading = ticketHeading(data);
  out.align('center').bold(true).line(heading.title).bold(false).line(`N° ${data.folio ?? '-'}`);
  for (const part of wrapText(heading.notice, width)) out.line(part);
  out.align('left').line(rule);

  for (const text of [`Fecha: ${when(data.issuedAt)}`, `Atiende: ${data.cashierName}`, `Cliente: ${data.customerName}`, `RUT: ${data.customerRut}`]) {
    for (const part of wrapText(text, width)) out.line(part);
  }
  out.line(rule);

  // Unitario y total de línea ambos en NETO; el IVA se suma una sola vez al pie (igual que el ticket del navegador).
  for (const item of data.lines) {
    for (const part of wrapText(item.description, width)) out.line(part);
    const detail = `${formatQuantity(item.quantity)} x ${formatCurrency(item.unitPrice)}${item.isExempt ? ' (E)' : ''}`;
    for (const part of twoColumns(detail, formatCurrency(item.subtotal), width)) out.line(part);
  }
  out.line(rule);

  for (const part of twoColumns('Neto', formatCurrency(data.netAmount), width)) out.line(part);
  if (data.exemptAmount > 0) for (const part of twoColumns('Exento (E)', formatCurrency(data.exemptAmount), width)) out.line(part);
  for (const part of twoColumns('IVA 19%', formatCurrency(data.ivaAmount), width)) out.line(part);
  out.bold(true).size(1, 2);
  for (const part of twoColumns('TOTAL', formatCurrency(data.totalAmount), width)) out.line(part);
  out.size(1, 1).bold(false).line(rule);

  for (const part of twoColumns('Pago', data.paymentMethodLabel, width)) out.line(part);
  if (data.cashReceived !== undefined) for (const part of twoColumns('Efectivo', formatCurrency(data.cashReceived), width)) out.line(part);
  if (data.changeDue !== undefined && data.changeDue > 0) {
    out.bold(true);
    for (const part of twoColumns('Vuelto', formatCurrency(data.changeDue), width)) out.line(part);
    out.bold(false);
  }
  out.line(rule).align('center');
  for (const part of wrapText('¡Gracias por su compra!', width)) out.line(part);
  for (const part of wrapText('Documento emitido por sistema ERP', width)) out.line(part);
  out.feed(options.cut ? 4 : 6);
  if (options.cut) out.cut();
  return out.build();
}

/** Hoja de prueba: regla de columnas (para ver el ancho real) y todos los caracteres españoles. */
export function buildTestPageEscPos(options: TicketPrintOptions, now: Date = new Date()): Uint8Array {
  const width = Math.max(24, Math.min(64, options.columns));
  const out = new EscPosBuilder(options.codePage);
  if (options.drawer) out.raw(drawerPulse(options.drawer));
  out.align('center').bold(true).size(2, 2).line('PRUEBA').size(1, 1).line('IMPRESORA DE BOLETAS').bold(false);
  out.align('left').line('-'.repeat(width));
  out.line(center(when(now), width));
  const digits = '1234567890'.repeat(Math.ceil(width / 10)).slice(0, width);
  out.line(digits);
  out.line(`Ancho: ${width} columnas`);
  out.line('Tildes: á é í ó ú ñ Ñ ü Ü');
  out.line('Signos: ¿Qué tal? ¡Hola! $1.250.000 €');
  out.line('Si ves signos raros, cambia la');
  out.line('tabla de caracteres (850/858).');
  out.line('-'.repeat(width));
  out.feed(options.cut ? 4 : 6);
  if (options.cut) out.cut();
  return out.build();
}
