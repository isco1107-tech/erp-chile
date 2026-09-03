import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 595.28; // A4 puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LIST_INDENT = 18;
const NOTE_PADDING = 10;

const TEXT_COLOR = rgb(0.15, 0.15, 0.15);
const MUTED_COLOR = rgb(0.35, 0.35, 0.35);
const BORDER_COLOR = rgb(0.7, 0.7, 0.7);

/**
 * Escritor de documentos simples (cartas, contratos) sobre `pdf-lib`, con
 * salto de línea automático por ancho de página — a diferencia del acta de
 * escrutinio (`scrutiny-pdf.service.ts`), que es una tabla y no necesita
 * wrap de párrafos largos. Un solo helper compartido para no reimplementar
 * el mismo cálculo de ancho de texto en cada documento generado.
 *
 * Soporta el formato de línea que usa `contract-pdf.service.ts` para
 * reproducir un contrato legal real (títulos de cláusula, listas con letra,
 * recuadro de nota) sin necesitar un motor de markup: cada método dibuja un
 * bloque, el parser de línea (en el servicio que llama) decide cuál invocar.
 */
export class ParagraphWriter {
  private pdf: PDFDocument;
  private font!: PDFFont;
  private fontBold!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  private constructor(pdf: PDFDocument) {
    this.pdf = pdf;
  }

  static async create(): Promise<ParagraphWriter> {
    const pdf = await PDFDocument.create();
    const writer = new ParagraphWriter(pdf);
    writer.font = await pdf.embedFont(StandardFonts.Helvetica);
    writer.fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    writer.addPage();
    return writer;
  }

  private addPage(): void {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(lineHeight: number): void {
    if (this.y - lineHeight < MARGIN) this.addPage();
  }

  /** Envuelve `text` dentro de `maxWidth` empezando en `x`, dibujando línea por línea. Núcleo compartido por párrafos, listas y el recuadro de nota. */
  private wrapAndDraw(text: string, opts: { x: number; maxWidth: number; size: number; lineHeight: number; font: PDFFont; color: typeof TEXT_COLOR }): void {
    const { x, maxWidth, size, lineHeight, font, color } = opts;
    const words = text.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        this.ensureSpace(lineHeight);
        this.page.drawText(line, { x, y: this.y, size, font, color });
        this.y -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, { x, y: this.y, size, font, color });
      this.y -= lineHeight;
    }
  }

  writeHeading(text: string, size = 16): void {
    const gap = size + 10;
    this.ensureSpace(gap);
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.fontBold, color: rgb(0.1, 0.1, 0.1) });
    this.y -= gap;
  }

  /** Título de cláusula (`## `): negrita, algo más grande, con espacio antes — no arranca una página nueva a propósito, para no dejar clausulas huérfanas al final de la hoja. */
  writeClauseHeading(text: string, size = 12): void {
    this.addSpacing(8);
    const lineHeight = size + 6;
    this.wrapAndDraw(text, { x: MARGIN, maxWidth: CONTENT_WIDTH, size, lineHeight, font: this.fontBold, color: rgb(0.1, 0.1, 0.1) });
    this.addSpacing(2);
  }

  writeLine(text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}): void {
    const size = opts.size ?? 11;
    const gap = opts.gap ?? size + 6;
    this.ensureSpace(gap);
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: opts.bold ? this.fontBold : this.font, color: TEXT_COLOR });
    this.y -= gap;
  }

  /** Envuelve `text` al ancho de la página, respetando saltos de línea explícitos (`\n`) como fin de párrafo. */
  writeParagraph(text: string, opts: { size?: number; lineHeight?: number } = {}): void {
    const size = opts.size ?? 11;
    const lineHeight = opts.lineHeight ?? size + 6;
    for (const paragraph of text.split('\n')) {
      if (paragraph.trim() === '') {
        this.y -= lineHeight;
        continue;
      }
      this.wrapAndDraw(paragraph, { x: MARGIN, maxWidth: CONTENT_WIDTH, size, lineHeight, font: this.font, color: TEXT_COLOR });
    }
  }

  /**
   * Ítem de lista con letra (`a)`, `b)`, `c)`...) y sangría colgante — el
   * texto envuelto queda alineado bajo el propio texto, no bajo la letra.
   * `index` es 0-based; se convierte a letra acá para que quien llama no
   * tenga que llevar el alfabeto a mano.
   */
  writeListItem(index: number, text: string, size = 11): void {
    const letter = String.fromCharCode(97 + (index % 26));
    const lineHeight = size + 6;
    const marker = `${letter}) `;
    const markerWidth = this.font.widthOfTextAtSize(marker, size);
    const firstLineMaxWidth = CONTENT_WIDTH - markerWidth;

    const words = text.split(/\s+/).filter(Boolean);
    let line = '';
    let firstLine = true;
    const drawLine = () => {
      const x = firstLine ? MARGIN + markerWidth : MARGIN + LIST_INDENT;
      this.ensureSpace(lineHeight);
      if (firstLine) this.page.drawText(marker, { x: MARGIN, y: this.y, size, font: this.font, color: TEXT_COLOR });
      this.page.drawText(line, { x, y: this.y, size, font: this.font, color: TEXT_COLOR });
      this.y -= lineHeight;
      firstLine = false;
    };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const maxWidth = firstLine ? firstLineMaxWidth : CONTENT_WIDTH - LIST_INDENT;
      if (this.font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        drawLine();
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) drawLine();
    else if (firstLine) {
      // Ítem sin texto (no debería pasar en la práctica) — igual dibuja la letra.
      this.ensureSpace(lineHeight);
      this.page.drawText(marker, { x: MARGIN, y: this.y, size, font: this.font, color: TEXT_COLOR });
      this.y -= lineHeight;
    }
  }

  /** Recuadro con borde para una nota/advertencia (bloque de líneas `> ` consecutivas) — calcula el alto real del texto envuelto antes de dibujar el borde, así el recuadro nunca queda más chico que el contenido. */
  writeNoteBox(text: string, size = 10): void {
    const lineHeight = size + 5;
    const innerWidth = CONTENT_WIDTH - NOTE_PADDING * 2;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(candidate, size) > innerWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    const boxHeight = lines.length * lineHeight + NOTE_PADDING * 2;
    this.ensureSpace(boxHeight + 8);
    const boxTop = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: boxTop - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      borderColor: BORDER_COLOR,
      borderWidth: 1,
    });
    let cursorY = boxTop - NOTE_PADDING - size;
    for (const l of lines) {
      this.page.drawText(l, { x: MARGIN + NOTE_PADDING, y: cursorY, size, font: this.font, color: MUTED_COLOR });
      cursorY -= lineHeight;
    }
    this.y = boxTop - boxHeight - 8;
  }

  addSpacing(amount: number): void {
    this.y -= amount;
  }

  async save(): Promise<Buffer> {
    const bytes = await this.pdf.save();
    return Buffer.from(bytes);
  }
}

/** Sustituye `{{variable}}` en `template` con `data[variable]` — sin motor de scripting, solo reemplazo directo. Variables sin valor quedan vacías. */
export function fillTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? '');
}
