import { prisma } from '@/lib/prisma';
import type { CandidateDocument, CandidateDocumentStatus } from '@prisma/client';
import type { DocumentCreateInput, DocumentUpdateInput } from '../schema';

export async function assertCandidateOwnership(companyId: string, candidateId: string): Promise<void> {
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId }, select: { id: true } });
  if (!candidate) throw new Error('Candidata no encontrada');
}

/**
 * `status` no se confía en lo que quedó guardado la última vez que alguien
 * tocó el documento: se recalcula acá mismo cada vez que se lee, comparando
 * `expiresAt` contra la fecha actual — un contrato de imagen firmado hace un
 * año y ya vencido debe mostrarse como vencido sin que nadie tenga que volver
 * a guardarlo para que cambie de estado.
 */
function deriveStatus(signedAt: Date | null, expiresAt: Date | null): CandidateDocumentStatus {
  if (expiresAt && expiresAt.getTime() < Date.now()) return 'EXPIRED';
  if (signedAt) return 'SIGNED';
  return 'PENDING';
}

function withComputedStatus<T extends { signedAt: Date | null; expiresAt: Date | null; status: CandidateDocumentStatus }>(doc: T): T {
  return { ...doc, status: deriveStatus(doc.signedAt, doc.expiresAt) };
}

export async function addDocument(
  companyId: string,
  candidateId: string,
  data: DocumentCreateInput
): Promise<CandidateDocument> {
  await assertCandidateOwnership(companyId, candidateId);
  const signedAt = data.signedAt ?? null;
  const expiresAt = data.expiresAt ?? null;
  const created = await prisma.candidateDocument.create({
    data: {
      companyId,
      candidateId,
      title: data.title,
      fileUrl: data.fileUrl,
      signedAt: signedAt || undefined,
      expiresAt: expiresAt || undefined,
      status: deriveStatus(signedAt, expiresAt),
    },
  });
  return withComputedStatus(created);
}

export async function updateDocument(
  companyId: string,
  documentId: string,
  data: DocumentUpdateInput
): Promise<CandidateDocument> {
  const existing = await prisma.candidateDocument.findFirst({ where: { id: documentId, companyId } });
  if (!existing) throw new Error('Documento no encontrado');

  const signedAt = data.signedAt !== undefined ? data.signedAt : existing.signedAt;
  const expiresAt = data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;
  const status = deriveStatus(signedAt, expiresAt);

  await prisma.candidateDocument.updateMany({
    where: { id: documentId, companyId },
    data: { signedAt: signedAt ?? null, expiresAt: expiresAt ?? null, status },
  });

  const updated = await prisma.candidateDocument.findFirst({ where: { id: documentId, companyId } });
  if (!updated) throw new Error('Documento no encontrado');
  return withComputedStatus(updated);
}

export async function listDocuments(companyId: string, candidateId: string): Promise<CandidateDocument[]> {
  const documents = await prisma.candidateDocument.findMany({
    where: { companyId, candidateId },
    orderBy: { createdAt: 'desc' },
  });
  return documents.map(withComputedStatus);
}

export async function deleteDocument(companyId: string, documentId: string): Promise<void> {
  const result = await prisma.candidateDocument.deleteMany({ where: { id: documentId, companyId } });
  if (result.count === 0) throw new Error('Documento no encontrado');
}

/**
 * Crea o actualiza el contrato de imagen generado desde plantilla
 * (`documentType = CONTRACT_IMAGE`). Solo puede haber una fila
 * `CONTRACT_IMAGE` vigente por candidata: si ya existe y está firmada, se
 * rechaza la regeneración (mismo criterio que `SponsorshipContract.agreementSignedAt`)
 * — hay que cargar un documento nuevo a mano si el contrato cambia después de
 * firmado, no pisar el que ya tiene validez legal.
 */
export async function upsertGeneratedContract(companyId: string, candidateId: string, fileUrl: string): Promise<CandidateDocument> {
  await assertCandidateOwnership(companyId, candidateId);

  const existing = await prisma.candidateDocument.findFirst({ where: { companyId, candidateId, documentType: 'CONTRACT_IMAGE' } });
  if (existing) {
    if (existing.signedAt) {
      throw new Error('Esta candidata ya tiene un contrato de imagen firmado — no se puede regenerar. Sube el documento nuevo manualmente si corresponde.');
    }
    await prisma.candidateDocument.updateMany({ where: { id: existing.id, companyId }, data: { fileUrl } });
    const updated = await prisma.candidateDocument.findFirst({ where: { id: existing.id, companyId } });
    if (!updated) throw new Error('Documento no encontrado');
    return withComputedStatus(updated);
  }

  const created = await prisma.candidateDocument.create({
    data: { companyId, candidateId, title: 'Contrato de imagen', documentType: 'CONTRACT_IMAGE', fileUrl, status: 'PENDING' },
  });
  return withComputedStatus(created);
}

/** Guarda la referencia al documento de ZapSign en la fila `CONTRACT_IMAGE` recién subida — separado de `upsertGeneratedContract` porque ese ya corre antes de conocer el token que devuelve ZapSign. */
export async function saveZapsignRequest(
  companyId: string,
  documentId: string,
  data: { zapsignDocToken: string; zapsignSignUrl: string | null }
): Promise<CandidateDocument> {
  const result = await prisma.candidateDocument.updateMany({ where: { id: documentId, companyId }, data });
  if (result.count === 0) throw new Error('Documento no encontrado');
  const updated = await prisma.candidateDocument.findFirst({ where: { id: documentId, companyId } });
  if (!updated) throw new Error('Documento no encontrado');
  return withComputedStatus(updated);
}

/**
 * Registra la firma confirmada por ZapSign — llamada exclusivamente desde el
 * webhook, después de que este ya reconsultó el estado real contra la API de
 * ZapSign (nunca a partir del body del webhook sin verificar). Busca por
 * `zapsignDocToken` (campo `@unique` global, mismo criterio que
 * `JudgeAssignment.accessToken`): la fila que aparece ya trae su propio
 * `companyId`, no hace falta que el webhook lo conozca de antemano. Idempotente:
 * si la fila ya tiene `signedAt`, no hace nada.
 */
export async function markContractSignedByZapsignToken(zapsignDocToken: string, fileUrl: string): Promise<CandidateDocument | null> {
  const existing = await prisma.candidateDocument.findUnique({ where: { zapsignDocToken } });
  if (!existing) return null;
  if (existing.signedAt) return withComputedStatus(existing);

  const signedAt = new Date();
  await prisma.candidateDocument.updateMany({
    where: { id: existing.id, zapsignDocToken },
    data: { fileUrl, signedAt, status: 'SIGNED' },
  });
  const updated = await prisma.candidateDocument.findUnique({ where: { zapsignDocToken } });
  if (!updated) return null;
  return withComputedStatus(updated);
}
