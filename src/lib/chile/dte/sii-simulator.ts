import type { SiiSubmissionStatus } from '@prisma/client';

/**
 * Simulador del envío al SII, para ver el flujo completo (timbrado → enviado →
 * aceptado/rechazado) SIN certificado digital ni certificación ante el SII.
 *
 * Nada de lo que produce tiene validez tributaria: el Track ID lleva el
 * prefijo `SIM-` y la glosa lo dice, de modo que ningún dato simulado pueda
 * confundirse con una respuesta real del SII. Puro: sin Prisma, sin red.
 */

export const SIMULATED_TRACK_PREFIX = 'SIM-';

export const SIMULATION_NOTICE = 'SIMULACIÓN: respuesta generada por Aether, sin validez tributaria ante el SII.';

export function isSimulatedTrackId(trackId: string | null | undefined): boolean {
  return Boolean(trackId?.startsWith(SIMULATED_TRACK_PREFIX));
}

export interface SimulatedSubmissionInput {
  folio: number;
  tedXml: string | null;
  signedXml: string | null;
  now?: Date;
}

export interface SimulatedSubmission {
  trackId: string;
}

/** Un documento sin timbre ni XML no se puede "enviar", ni siquiera en simulación. */
export function simulateSubmission(input: SimulatedSubmissionInput): SimulatedSubmission {
  if (!input.tedXml || !input.signedXml) {
    throw new Error('El documento no tiene timbre ni XML. Carga un CAF de la empresa antes de emitirlo.');
  }
  const now = input.now ?? new Date();
  return { trackId: `${SIMULATED_TRACK_PREFIX}${now.getTime().toString(36).toUpperCase()}-${input.folio}` };
}

export interface SimulatedStatus {
  status: Extract<SiiSubmissionStatus, 'ACCEPTED' | 'REJECTED'>;
  detail: string;
}

/**
 * Respuesta del "SII": revisa lo mismo que se puede revisar sin conexión —
 * que el XML conserve su timbre. Si el `<TED>` impreso no está dentro del XML
 * enviado, rechaza; en cualquier otro caso acepta.
 */
export function simulateStatus(input: { tedXml: string | null; signedXml: string | null }): SimulatedStatus {
  if (!input.tedXml || !input.signedXml || !input.signedXml.includes('<TED')) {
    return { status: 'REJECTED', detail: `${SIMULATION_NOTICE} El XML enviado no contiene el timbre electrónico (TED).` };
  }
  return { status: 'ACCEPTED', detail: `${SIMULATION_NOTICE} Documento recibido y aceptado.` };
}
