import { prisma } from '@/lib/prisma';
import { ParagraphWriter, fillTemplate } from '@/lib/pdf/paragraph-writer';
import { requireTemplate } from '@/modules/documents/services/document-template.service';

/**
 * Interpreta el `bodyText` de la plantilla línea por línea y despacha al
 * método de `ParagraphWriter` correspondiente — un parser lineal simple, sin
 * motor de markup ni dependencia nueva, pensado para reproducir el formato
 * real del contrato (título, recuadro de nota, cláusulas, listas con letra):
 *   `# texto`  → título principal
 *   `## texto` → título de cláusula
 *   `- texto`  → ítem de lista (se numera con letra automáticamente dentro
 *                de cada racha consecutiva de `- `)
 *   `> texto`  → se agrupa con las líneas `> ` siguientes en un recuadro
 *   línea vacía → separador de párrafo
 *   cualquier otra línea → párrafo normal
 */
function renderBody(writer: ParagraphWriter, bodyText: string): void {
  const lines = bodyText.split('\n');
  let noteBuffer: string[] = [];
  let listIndex = 0;
  let paragraphBuffer: string[] = [];

  function flushNote() {
    if (noteBuffer.length > 0) {
      writer.writeNoteBox(noteBuffer.join(' '));
      noteBuffer = [];
    }
  }
  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      writer.writeParagraph(paragraphBuffer.join(' '));
      paragraphBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('> ')) {
      flushParagraph();
      noteBuffer.push(line.slice(2));
      continue;
    }
    flushNote();

    if (line.startsWith('## ')) {
      flushParagraph();
      writer.writeClauseHeading(line.slice(3));
      listIndex = 0;
    } else if (line.startsWith('# ')) {
      flushParagraph();
      writer.writeHeading(line.slice(2));
      listIndex = 0;
    } else if (line.startsWith('- ')) {
      flushParagraph();
      writer.writeListItem(listIndex, line.slice(2));
      listIndex += 1;
    } else if (line.trim() === '') {
      flushParagraph();
      writer.addSpacing(6);
      listIndex = 0;
    } else {
      paragraphBuffer.push(line);
      listIndex = 0;
    }
  }
  flushParagraph();
  flushNote();
}

/**
 * Genera el contrato de imagen de una candidata a partir de la plantilla
 * vigente de la empresa (`DocumentTemplate` tipo `CANDIDATE_CONTRACT`). No
 * persiste nada — quien llama (el Route Handler) decide si sube el PDF a
 * Blob y lo registra como `CandidateDocument`.
 *
 * El bloque de firmas se arma acá, no como parte editable de la plantilla:
 * organización + candidata siempre, y el tutor/representante legal solo si
 * `candidate.guardianName` está cargado — evita dejar un tercer bloque en
 * blanco sin sentido cuando la candidata es mayor de edad.
 */
export async function renderCandidateContractPdf(companyId: string, candidateId: string): Promise<Buffer> {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, companyId },
    include: { project: true, company: true },
  });
  if (!candidate) throw new Error('Candidata no encontrada');

  const template = await requireTemplate(companyId, 'CANDIDATE_CONTRACT');

  const body = fillTemplate(template.bodyText, {
    candidateName: candidate.fullName,
    candidateRut: candidate.rut,
    projectName: candidate.project.name,
    organizationName: candidate.company.businessName,
    organizationRut: candidate.company.rut,
    date: new Date().toLocaleDateString('es-CL'),
  });

  const writer = await ParagraphWriter.create();
  renderBody(writer, body);

  writer.addSpacing(30);
  writer.writeClauseHeading('FIRMAS');
  writer.addSpacing(10);

  writer.writeLine('_______________________________', { gap: 14 });
  writer.writeLine(candidate.company.businessName, { bold: true });
  writer.writeLine(`RUT N.° ${candidate.company.rut}`, { size: 9 });
  writer.writeLine('Por LA ORGANIZACIÓN', { size: 9, gap: 24 });

  writer.writeLine('_______________________________', { gap: 14 });
  writer.writeLine(candidate.fullName, { bold: true });
  writer.writeLine(`RUT N.° ${candidate.rut}`, { size: 9 });
  writer.writeLine('LA CANDIDATA', { size: 9, gap: 24 });

  if (candidate.guardianName) {
    writer.writeLine('_______________________________', { gap: 14 });
    writer.writeLine(candidate.guardianName, { bold: true });
    if (candidate.guardianRut) writer.writeLine(`RUT N.° ${candidate.guardianRut}`, { size: 9 });
    writer.writeLine('Representante legal (candidata menor de edad)', { size: 9 });
  }

  return writer.save();
}
