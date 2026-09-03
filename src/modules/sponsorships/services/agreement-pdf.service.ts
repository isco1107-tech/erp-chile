import { prisma } from '@/lib/prisma';
import { ParagraphWriter, fillTemplate } from '@/lib/pdf/paragraph-writer';
import { requireTemplate } from '@/modules/documents/services/document-template.service';

const TIER_LABEL: Record<string, string> = {
  TITULAR_MAIN_SPONSOR: 'Auspiciador Titular',
  GOLD: 'Auspiciador Gold',
  SILVER: 'Auspiciador Silver',
  OFFICIAL_SPONSOR: 'Auspiciador Oficial',
  MEDIA_PARTNER: 'Media Partner',
  CANJE_BARTER: 'Canje',
};

function formatClp(amount: number): string {
  return new Intl.NumberFormat('es-CL').format(amount);
}

/**
 * Genera la carta de compromiso de un contrato de auspicio a partir de la
 * plantilla vigente de la empresa (`DocumentTemplate` tipo
 * `SPONSOR_COMMITMENT_LETTER`). No persiste nada — quien llama (el Route
 * Handler) decide si sube el PDF a Blob y actualiza `agreementFileUrl`.
 */
export async function renderCommitmentLetterPdf(companyId: string, contractId: string): Promise<Buffer> {
  const contract = await prisma.sponsorshipContract.findFirst({
    where: { id: contractId, companyId },
    include: { contact: true, project: true },
  });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');

  const template = await requireTemplate(companyId, 'SPONSOR_COMMITMENT_LETTER');

  const body = fillTemplate(template.bodyText, {
    sponsorName: contract.contact.razonSocial,
    sponsorRut: contract.contact.rut,
    projectName: contract.project.name,
    tier: TIER_LABEL[contract.tier] ?? contract.tier,
    cashAmount: contract.isBarter ? '—' : `$ ${formatClp(contract.cashAmount)}`,
    barterDescription: contract.barterDescription ?? '—',
    date: new Date().toLocaleDateString('es-CL'),
  });

  const writer = await ParagraphWriter.create();
  writer.writeHeading(template.name);
  writer.addSpacing(6);
  writer.writeParagraph(body);
  writer.addSpacing(40);
  writer.writeLine('_______________________________', { gap: 14 });
  writer.writeLine('Director/a de Producción');
  writer.addSpacing(20);
  writer.writeLine('_______________________________', { gap: 14 });
  writer.writeLine(contract.contact.razonSocial);

  return writer.save();
}
