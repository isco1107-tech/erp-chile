import type { DataSubjectRequestStatus, DataSubjectRequestType } from '@prisma/client';

/**
 * Versión de la política de privacidad de la postulación. Se guarda en cada
 * `Candidate.privacyPolicyVersion` al aceptar el formulario público: así se
 * sabe QUÉ texto vio cada persona. Súbela (YYYY-MM-DD) cada vez que cambie el
 * contenido de `src/app/politica-privacidad/page.tsx`.
 */
export const PRIVACY_POLICY_VERSION = '2026-10-02';

/**
 * Plazo de respuesta a una solicitud de derechos, en días corridos, y prórroga
 * máxima. Valores de la Ley 21.719 según las guías consultadas; confirmar con
 * asesoría legal antes de comprometerlos por contrato. Están aquí, en un solo
 * lugar, para ajustarlos sin tocar el resto del código.
 */
export const REQUEST_RESPONSE_DAYS = 30;
export const REQUEST_EXTENSION_DAYS = 30;

/** Avisar en el panel cuando faltan estos días o menos. */
export const REQUEST_DUE_SOON_DAYS = 7;

export const REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  ACCESS: 'Acceso',
  RECTIFICATION: 'Rectificación',
  ERASURE: 'Supresión',
  OPPOSITION: 'Oposición',
  PORTABILITY: 'Portabilidad',
  BLOCKING: 'Bloqueo',
};

export const REQUEST_TYPE_DESCRIPTIONS: Record<DataSubjectRequestType, string> = {
  ACCESS: 'Saber qué datos tuyos tratamos y recibir una copia.',
  RECTIFICATION: 'Corregir datos tuyos que estén errados o incompletos.',
  ERASURE: 'Pedir que eliminemos tus datos cuando ya no sean necesarios o retires tu consentimiento.',
  OPPOSITION: 'Oponerte a que usemos tus datos para una finalidad determinada, por ejemplo marketing.',
  PORTABILITY: 'Recibir tus datos en un formato estructurado para llevarlos a otro lugar.',
  BLOCKING: 'Pedir que suspendamos temporalmente el uso de tus datos mientras se resuelve un reclamo.',
};

export const REQUEST_STATUS_LABELS: Record<DataSubjectRequestStatus, string> = {
  RECEIVED: 'Recibida',
  IN_PROGRESS: 'En curso',
  RESOLVED: 'Resuelta',
  REJECTED: 'Rechazada',
};

export const REQUEST_TYPES = Object.keys(REQUEST_TYPE_LABELS) as DataSubjectRequestType[];

/**
 * Los RUT de personas jurídicas parten en 50.000.000; los de personas naturales
 * son menores. Una productora que es persona natural (empresario individual)
 * NO debe publicar su RUT ni su domicilio particular en una política pública:
 * ahí la política deja el dato a completar a mano. Un RUT jurídico antiguo bajo
 * 50 millones también cae en el lado seguro (no se publica).
 */
export function isLegalEntityRut(cleanRut: string): boolean {
  const body = Number(cleanRut.slice(0, -1));
  return Number.isFinite(body) && body >= 50_000_000;
}
