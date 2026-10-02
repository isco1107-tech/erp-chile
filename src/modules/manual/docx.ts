import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  TabStopType,
  TextRun,
  type ParagraphChild,
} from 'docx';
import { MANUAL_CHAPTERS, type ManualChapter, type ManualSection } from './types';

/**
 * Manual de usuario en Word (.docx), armado con el MISMO contenido filtrado
 * que ve la persona en `/dashboard/manual`: solo módulos contratados y, en el
 * alcance "mi rol", solo lo que su rol puede hacer. Pensado para imprimir y
 * para capacitar: portada, índice con enlaces, un capítulo por grupo del
 * menú, capturas de cada pantalla, pasos numerados y recuadros "Importante".
 *
 * Sin E/S propia: las imágenes las entrega `loadImage` (en la ruta, desde
 * `public/`; en las pruebas, un doble), así el armado se prueba sin disco.
 */

export interface ManualDocxImage {
  data: Buffer;
  type: 'png' | 'jpg';
  width: number;
  height: number;
}

export interface ManualDocxInput {
  companyName: string;
  /** Línea bajo el título de la portada: a quién va dirigido este manual. */
  audience: string;
  generatedAt: Date;
  /** Secciones de módulos (ya filtradas por plan y, si corresponde, por rol). */
  sections: readonly ManualSection[];
  /** Flujos, problemas frecuentes y glosario (capítulo "Referencia"). */
  reference: readonly ManualSection[];
  loadImage: (publicPath: string) => Promise<ManualDocxImage | null>;
  /** Captura de una sección (o `null` si no tiene): `sectionScreenshot` de content.ts. */
  screenshotOf: (section: ManualSection) => string | null;
}

const INK = '12161F';
const GOLD = 'B8963E';
const MUTED = '5B6270';
const TIP_FILL = 'F7F1DF';
const FONT = 'Calibri';

/** Carta, márgenes de 1": 6,5" útiles = 624 px a 96 ppp. */
const PAGE = { width: 12240, height: 15840, margin: 1440 };
const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 430;

const STEPS_REFERENCE = 'manual-steps';

function anchorId(id: string): string {
  // Los marcadores de Word no aceptan guiones ni empezar con número.
  return `s_${id.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
}

function chapterNumberLabel(index: number): string {
  return `Capítulo ${index + 1}`;
}

/** Ancho/alto en px para que la captura quepa en el ancho útil sin pasarse de alto. */
export function fitImage(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: MAX_IMAGE_WIDTH, height: Math.round(MAX_IMAGE_WIDTH * 0.625) };
  const scale = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Agrupa las secciones por capítulo, en el orden de lectura de `MANUAL_CHAPTERS`. */
export function groupByChapter(sections: readonly ManualSection[]): { chapter: ManualChapter; sections: ManualSection[] }[] {
  return MANUAL_CHAPTERS.map((chapter) => ({ chapter, sections: sections.filter((section) => section.chapter === chapter) })).filter(
    (group) => group.sections.length > 0
  );
}

function body(text: string, options: { italics?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text, italics: options.italics, color: options.color, size: options.size })],
  });
}

function tipParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 160, line: 288 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: TIP_FILL },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } },
    indent: { left: 240, right: 120 },
    children: [new TextRun({ text: 'Importante: ', bold: true, color: INK }), new TextRun({ text })],
  });
}

function stepParagraph(text: string, instance: number): Paragraph {
  return new Paragraph({
    numbering: { reference: STEPS_REFERENCE, level: 0, instance },
    spacing: { after: 80, line: 288 },
    children: [new TextRun(text)],
  });
}

function bulletParagraph(children: ParagraphChild[]): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 288 }, children });
}

async function screenshotParagraphs(section: ManualSection, input: ManualDocxInput): Promise<Paragraph[]> {
  const path = input.screenshotOf(section);
  if (!path) return [];
  const image = await input.loadImage(path);
  if (!image) return [];
  const size = fitImage(image.width, image.height);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      keepNext: true,
      children: [new ImageRun({ type: image.type, data: image.data, transformation: size, altText: { name: section.title, title: section.title, description: `Captura de pantalla: ${section.title}` } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Pantalla: ${section.title}`, italics: true, size: 18, color: MUTED })],
    }),
  ];
}

export async function buildManualDocx(input: ManualDocxInput): Promise<Buffer> {
  const chapters = groupByChapter(input.sections);
  const referenceChapter = input.reference.length > 0 ? [{ chapter: 'Referencia' as ManualChapter, sections: [...input.reference] }] : [];
  const allChapters = [...chapters.filter((group) => group.chapter !== 'Referencia'), ...referenceChapter];
  const generated = input.generatedAt.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

  // ── Portada ────────────────────────────────────────────────────────────
  const cover: Paragraph[] = [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({ children: [new TextRun({ text: 'AETHER ERP', bold: true, color: GOLD, size: 24, characterSpacing: 40 })] }),
    new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'Manual de Usuario', bold: true, color: INK, size: 64 })] }),
    new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: input.companyName, color: INK, size: 36 })] }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 12 } },
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: input.audience, color: MUTED, size: 24 })],
    }),
    new Paragraph({ children: [new TextRun({ text: `Generado el ${generated}`, color: MUTED, size: 22 })] }),
    new Paragraph({
      spacing: { before: 1200 },
      children: [
        new TextRun({
          text: 'Este manual incluye solo los módulos que tu empresa tiene contratados. Las capturas son referenciales: los datos de tu empresa pueden verse distintos.',
          color: MUTED,
          size: 20,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ── Cómo usar este manual ──────────────────────────────────────────────
  const howTo: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Cómo usar este manual')] }),
    body('Cada capítulo corresponde a un grupo del menú lateral del sistema y cada sección a una pantalla o módulo. Al inicio de cada sección hay un resumen de para qué sirve, una captura de la pantalla y, después, los pasos numerados de cada tarea.'),
    body('Además de este documento, dentro del sistema tienes tres ayudas:'),
    bulletParagraph([new TextRun({ text: 'Cómo usar: ', bold: true }), new TextRun('el botón de la barra superior abre un recorrido guiado de la pantalla en la que estás.')]),
    bulletParagraph([new TextRun({ text: 'Asistente: ', bold: true }), new TextRun('escríbele con tus palabras; te explica, te lleva a la pantalla correcta y puede hacer tareas por ti con tu confirmación.')]),
    bulletParagraph([new TextRun({ text: 'Manual en línea: ', bold: true }), new TextRun('en Ayuda → Manual de Usuario, con buscador. Siempre está actualizado con la última versión del sistema.')]),
    new Paragraph({ spacing: { before: 240 }, heading: HeadingLevel.HEADING_1, children: [new TextRun('Índice')] }),
  ];

  // ── Índice con enlaces ─────────────────────────────────────────────────
  const index: Paragraph[] = [];
  allChapters.forEach((group, chapterIndex) => {
    index.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [new TextRun({ text: `${chapterNumberLabel(chapterIndex)} · ${group.chapter}`, bold: true, color: INK })],
      })
    );
    for (const section of group.sections) {
      index.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 40 },
          children: [new InternalHyperlink({ anchor: anchorId(section.id), children: [new TextRun({ text: section.title, style: 'Hyperlink' })] })],
        })
      );
    }
  });

  // ── Capítulos ──────────────────────────────────────────────────────────
  const content: Paragraph[] = [];
  let numberingInstance = 0;
  for (const [chapterIndex, group] of allChapters.entries()) {
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: `${chapterNumberLabel(chapterIndex)} · ${group.chapter}` })],
      })
    );

    for (const section of group.sections) {
      content.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          children: [new Bookmark({ id: anchorId(section.id), children: [new TextRun(section.title)] })],
        }),
        body(section.summary, { italics: true, color: MUTED })
      );
      content.push(...(await screenshotParagraphs(section, input)));

      const isGlossary = section.id === 'glosario';
      for (const topic of section.topics) {
        if (!isGlossary) {
          content.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(topic.title)] }));
        }
        if (isGlossary) {
          for (const entry of topic.steps) {
            const [term, ...rest] = entry.split(': ');
            content.push(
              new Paragraph({
                spacing: { after: 100, line: 288 },
                children: [new TextRun({ text: `${term}: `, bold: true, color: INK }), new TextRun(rest.join(': '))],
              })
            );
          }
        } else if (section.id === 'problemas-frecuentes') {
          for (const line of topic.steps) content.push(bulletParagraph([new TextRun(line)]));
        } else {
          numberingInstance += 1;
          for (const step of topic.steps) content.push(stepParagraph(step, numberingInstance));
        }
        if (topic.tip) content.push(tipParagraph(topic.tip));
      }
    }
  }

  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: PAGE.width - PAGE.margin * 2 }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9', space: 6 } },
        children: [
          new TextRun({ text: `Manual de Usuario · ${input.companyName}`, size: 16, color: MUTED }),
          new TextRun({ children: ['\tPágina ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
        ],
      }),
    ],
  });

  const document = new Document({
    creator: 'Aether ERP',
    title: `Manual de Usuario — ${input.companyName}`,
    description: input.audience,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: '262A33' } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 36, bold: true, color: INK },
          paragraph: { spacing: { before: 240, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: INK },
          paragraph: { spacing: { before: 360, after: 100 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 23, bold: true, color: GOLD },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: STEPS_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 540, hanging: 300 } }, run: { bold: true, color: INK } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin } } },
        headers: { default: new Header({ children: [] }) },
        footers: { default: footer },
        children: [...cover, ...howTo, ...index, ...content],
      },
    ],
  });

  return Packer.toBuffer(document);
}

/** Lee ancho y alto de un PNG o JPEG desde sus bytes, sin decodificar la imagen. */
export function readImageSize(data: Buffer): { type: 'png' | 'jpg'; width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { type: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1]!;
      const length = data.readUInt16BE(offset + 2);
      // SOF0..SOF15 (menos DHT/JPG/DAC) traen alto y ancho.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}
