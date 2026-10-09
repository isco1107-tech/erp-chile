import { prisma } from '@/lib/prisma';
import { isDte } from '@/lib/chile/dte/codes';
import {
  isSimulatedTrackId,
  SIMULATION_NOTICE,
  simulateStatus,
  simulateSubmission,
} from '@/lib/chile/dte/sii-simulator';

/**
 * Despacho de un DTE ya timbrado al SII: PENDING → SENT → ACCEPTED/REJECTED.
 *
 * Hoy solo existe el modo `simulation` (`DTE_SII_MODE=simulation`): recorre el
 * mismo ciclo de estados sin certificado digital y marca todo como simulado.
 * El envío real (semilla/token/EnvioDTE de `sii-client.ts`) necesita el
 * certificado de la empresa y la certificación ante el SII; mientras tanto
 * se rechaza con un mensaje claro en vez de fingir que despachó.
 */

export class SiiSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiiSubmissionError';
  }
}

export type SiiMode = 'simulation' | 'disabled';

export function getSiiMode(): SiiMode {
  return process.env.DTE_SII_MODE === 'simulation' ? 'simulation' : 'disabled';
}

function requireSimulation(): void {
  if (getSiiMode() !== 'simulation') {
    throw new SiiSubmissionError(
      'El envío real al SII requiere el certificado digital de la empresa y la certificación del SII, que aún no están configurados.'
    );
  }
}

const SUBMISSION_SELECT = {
  id: true,
  folio: true,
  dteType: true,
  status: true,
  tedXml: true,
  signedXml: true,
  siiTrackId: true,
  siiStatus: true,
} as const;

/** Envía el documento: pasa de "timbrado, sin despachar" a "enviado" con su Track ID. */
export async function submitDocumentToSii(companyId: string, documentId: string) {
  requireSimulation();

  const document = await prisma.salesDocument.findFirst({
    where: { id: documentId, companyId },
    select: SUBMISSION_SELECT,
  });
  if (!document) throw new SiiSubmissionError('Documento no encontrado');
  if (!isDte(document.dteType)) throw new SiiSubmissionError('Este documento no es un DTE y no se envía al SII');
  if (document.status !== 'ISSUED') throw new SiiSubmissionError('Solo se envían documentos emitidos');
  if (document.siiStatus !== 'PENDING') throw new SiiSubmissionError('Este documento ya fue enviado');

  if (document.folio === null) throw new SiiSubmissionError('El documento no tiene folio');
  const { trackId } = simulateSubmission({ ...document, folio: document.folio });

  // El estado va en el WHERE: un doble clic o dos pestañas no pueden enviar dos veces.
  const updated = await prisma.salesDocument.updateMany({
    where: { id: documentId, companyId, siiStatus: 'PENDING', status: 'ISSUED' },
    data: { siiStatus: 'SENT', siiTrackId: trackId, siiStatusAt: new Date(), siiStatusDetail: SIMULATION_NOTICE },
  });
  if (updated.count !== 1) throw new SiiSubmissionError('Este documento ya fue enviado');
  return { folio: document.folio, dteType: document.dteType, trackId };
}

/** Consulta el resultado de un envío: pasa de "enviado" a aceptado o rechazado. */
export async function refreshDocumentSiiStatus(companyId: string, documentId: string) {
  requireSimulation();

  const document = await prisma.salesDocument.findFirst({
    where: { id: documentId, companyId },
    select: SUBMISSION_SELECT,
  });
  if (!document) throw new SiiSubmissionError('Documento no encontrado');
  if (document.siiStatus !== 'SENT') throw new SiiSubmissionError('Este documento no tiene un envío pendiente de respuesta');
  if (!isSimulatedTrackId(document.siiTrackId)) {
    throw new SiiSubmissionError('Este envío no es simulado: solo el SII puede informar su resultado');
  }

  const result = simulateStatus(document);
  const updated = await prisma.salesDocument.updateMany({
    where: { id: documentId, companyId, siiStatus: 'SENT' },
    data: { siiStatus: result.status, siiStatusAt: new Date(), siiStatusDetail: result.detail },
  });
  if (updated.count !== 1) throw new SiiSubmissionError('El estado del documento cambió; recarga la página');
  return { folio: document.folio, dteType: document.dteType, status: result.status };
}
