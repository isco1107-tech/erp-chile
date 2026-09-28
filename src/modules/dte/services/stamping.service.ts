import type { DteType, Prisma } from '@prisma/client';
import { buildDte, type DteLine, type DteReference, type DteTotals } from '@/lib/chile/dte/document';
import { isDte } from '@/lib/chile/dte/codes';
import { captureException } from '@/lib/observability';
import { assignFolioFromCaf, NoFoliosAvailableError } from './caf.service';

type TxClient = Prisma.TransactionClient;

/**
 * Puente entre la emisión de un documento de venta y la maquinaria del SII.
 *
 * Existe para que `sales.service.ts` no tenga que saber de CAF, timbres ni
 * XML: pide un folio y, si la empresa tiene folios autorizados, recibe además
 * el material para timbrar.
 */

export interface FolioAssignment {
  folio: number;
  /** `null` cuando el folio salió del contador interno y no de un CAF. */
  cafId: string | null;
  /** Material de timbrado. `null` = documento sin validez tributaria ante el SII. */
  stamping: { cafBlockXml: string; privateKeyPem: string; siiCode: number } | null;
}

/**
 * Asigna el folio del documento.
 *
 * Preferencia: si hay un CAF vigente para ese tipo, el folio sale de ahí y el
 * documento se puede timbrar. Si no hay ninguno, cae al contador interno
 * (`FolioSequence`) que existía antes.
 *
 * Ese respaldo NO es un descuido: hay empresas usando el sistema hoy sin CAF
 * cargado, y cambiar la emisión a "falla si no hay CAF" les detendría la
 * operación de un día para otro. El documento que resulta lleva numeración
 * interna y no es un DTE — la pantalla de folios lo dice explícitamente y
 * `stamping: null` deja el hecho registrado en el dato, no solo en la UI.
 */
export async function assignSalesFolio(
  tx: TxClient,
  companyId: string,
  dteType: DteType
): Promise<FolioAssignment> {
  if (isDte(dteType)) {
    try {
      const assigned = await assignFolioFromCaf(tx, companyId, dteType);
      return {
        folio: assigned.folio,
        cafId: assigned.cafId,
        stamping: {
          cafBlockXml: assigned.cafBlockXml,
          privateKeyPem: assigned.privateKeyPem,
          siiCode: assigned.siiCode,
        },
      };
    } catch (error) {
      // Sin CAF cargado se sigue con numeración interna. Cualquier otro error
      // (llave corrupta, CAF ilegible) sí debe detener la emisión: emitir con
      // un folio autorizado pero sin timbre válido es peor que no emitir.
      if (!(error instanceof NoFoliosAvailableError)) throw error;
    }
  }

  const sequence = await tx.folioSequence.upsert({
    where: { companyId_dteType: { companyId, dteType } },
    update: { currentFolio: { increment: 1 } },
    create: { companyId, dteType, currentFolio: 1 },
  });

  return { folio: sequence.currentFolio, cafId: null, stamping: null };
}

export interface StampDocumentInput {
  siiCode: number;
  folio: number;
  issueDate: Date;
  dueDate?: Date | null;
  paymentMethod: string;
  issuer: {
    rut: string;
    businessName: string;
    giro: string | null;
    actividadEconomicaCodigo: string | null;
    address: string | null;
    comuna: string | null;
    ciudad: string | null;
  };
  receiver: {
    rut: string;
    businessName: string;
    giro: string | null;
    address: string | null;
    comuna: string | null;
    ciudad: string | null;
  } | null;
  lines: DteLine[];
  totals: DteTotals;
  references?: DteReference[];
  cafBlockXml: string;
  privateKeyPem: string;
}

/**
 * Forma de pago según el SII: 1 contado, 2 crédito, 3 sin costo.
 * El ERP guarda un texto libre; acá se traduce al código del esquema.
 */
export function siiPaymentMode(paymentMethod: string): 1 | 2 | 3 {
  return paymentMethod === 'CREDITO_30' ? 2 : 1;
}

export interface StampedDocument {
  tedXml: string;
  signedXml: string;
}

/** El timbre no se pudo generar: la emisión completa se deshace (folio incluido). */
export class DteStampingError extends Error {}

/**
 * Genera el timbre y el XML del documento.
 *
 * Falla CERRADO: se llama dentro de la transacción de emisión, así que si el
 * timbre no se puede generar se deshace todo (stock, pago y folio del CAF) y
 * el cajero ve el motivo. Antes se tragaba el error y quedaba un documento con
 * folio autorizado pero sin timbre: una boleta entregada sin timbre, con un
 * folio del SII ya gastado, que es peor que no emitir (ver assignSalesFolio).
 */
export function stampDocument(input: StampDocumentInput): StampedDocument {
  try {
    const built = buildDte({
      siiCode: input.siiCode,
      folio: input.folio,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      paymentMode: siiPaymentMode(input.paymentMethod),
      issuer: input.issuer,
      receiver: input.receiver,
      lines: input.lines,
      totals: input.totals,
      references: input.references,
      cafBlockXml: input.cafBlockXml,
      privateKeyPem: input.privateKeyPem,
    });

    // `signedXml` guarda el DTE con su timbre. Todavía le falta el bloque
    // `<Signature>` de XML-DSig con el certificado digital de la empresa, que
    // es lo que el SII exige para aceptar el ENVÍO. El documento ya es
    // verificable offline por su timbre; lo que no está es el despacho.
    return { tedXml: built.tedXml, signedXml: built.xml };
  } catch (error) {
    captureException(error, {
      module: 'dte',
      extra: { folio: input.folio, siiCode: input.siiCode },
    });
    // Un carácter que el SII no acepta se lo puede corregir el propio cajero:
    // ese mensaje se muestra tal cual. Cualquier otra falla es del CAF o del
    // sistema y va a observabilidad, no a la pantalla.
    const fixable = error instanceof Error && /carácter que el SII no acepta/.test(error.message);
    throw new DteStampingError(
      fixable && error instanceof Error
        ? error.message
        : 'No se pudo generar el timbre electrónico, así que el documento no se emitió. Intenta de nuevo; si se repite, revisa los folios (CAF) cargados.'
    );
  }
}
