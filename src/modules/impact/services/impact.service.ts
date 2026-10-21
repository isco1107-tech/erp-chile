import 'server-only';

import type { DteType } from '@prisma/client';
import QRCode from 'qrcode';
import { TAXABLE_SALES_DTE_TYPES } from '@/lib/chile/document-sign';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';
import { summarizeImpact, type ImpactSummary } from '@/lib/impact/summary';
import { impactUrl, signImpactToken, verifyImpactToken } from '@/lib/impact/token';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';

/**
 * Boleta con información de impacto: "Hoy compraste a N productores".
 *
 * Dos usos:
 *  - Página pública `/impacto/[token]` (`getPublicImpact`): lee el documento
 *    con la empresa que firma el token, nunca otra.
 *  - Reverso de la boleta del POS (`buildReceiptImpact`): texto + QR hacia esa
 *    página.
 *
 * Qué sale hacia afuera: nombre comercial del productor y cuántos productos
 * suyos hay en la compra. Jamás RUT, contacto, montos de venta, comisión ni
 * liquidación (el `amount` que calcula `summarizeImpact` se descarta aquí).
 * Sin el módulo `hasConsignment`, con la empresa suspendida o sin
 * productores en la venta, no hay nada que mostrar ni imprimir.
 */

/** Ventas (no notas de crédito/débito): mismo criterio que la consignación. */
const IMPACT_DTE_TYPES: DteType[] = TAXABLE_SALES_DTE_TYPES.filter(
  (type) => type !== 'NOTA_CREDITO_61' && type !== 'NOTA_DEBITO_56'
);

export interface PublicImpactProducer {
  name: string;
  itemCount: number;
}

export interface PublicImpact {
  companyName: string;
  issuedAt: Date;
  producerCount: number;
  /** "Hoy compraste a 3 productores" (el de la boleta). */
  text: string;
  producers: PublicImpactProducer[];
}

interface LoadedImpact {
  companyName: string;
  issuedAt: Date;
  summary: ImpactSummary;
}

async function loadImpact(companyId: string, salesDocumentId: string): Promise<LoadedImpact | null> {
  const document = await prisma.salesDocument.findFirst({
    where: { id: salesDocumentId, companyId, status: 'ISSUED', dteType: { in: IMPACT_DTE_TYPES } },
    select: {
      issueDate: true,
      company: { select: { businessName: true, status: true, features: { select: { hasConsignment: true } } } },
      items: {
        where: { companyId, quantity: { gt: 0 } },
        select: {
          productId: true,
          quantity: true,
          total: true,
          product: {
            select: {
              companyId: true,
              producerId: true,
              producer: {
                select: { companyId: true, contact: { select: { nombreFantasia: true, razonSocial: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!document) return null;
  if (document.company.status !== 'ACTIVE' && document.company.status !== 'TRIAL') return null;
  if (document.company.features?.hasConsignment !== true) return null;

  const summary = summarizeImpact(
    document.items.map((item) => {
      // Defensa en profundidad: un productor de otra empresa jamás cuenta.
      const producer = item.product?.producer && item.product.producer.companyId === companyId ? item.product.producer : null;
      const contact = producer?.contact;
      return {
        productId: item.productId,
        producerId: producer ? (item.product?.producerId ?? null) : null,
        producerName: contact ? contact.nombreFantasia?.trim() || contact.razonSocial : null,
        quantity: item.quantity,
        lineTotal: item.total,
      };
    })
  );
  if (!summary) return null;
  return { companyName: document.company.businessName, issuedAt: document.issueDate, summary };
}

/** Datos de la página pública. `null` = token inválido/vencido o nada que mostrar. */
export async function getPublicImpact(token: string): Promise<PublicImpact | null> {
  const payload = verifyImpactToken(token);
  if (!payload) return null;
  const loaded = await loadImpact(payload.companyId, payload.salesDocumentId);
  if (!loaded) return null;
  return {
    companyName: loaded.companyName,
    issuedAt: loaded.issuedAt,
    producerCount: loaded.summary.producerCount,
    text: loaded.summary.text,
    // Solo nombre y cantidad de productos: sin montos.
    producers: loaded.summary.producers.map(({ name, itemCount }) => ({ name, itemCount })),
  };
}

export interface ReceiptImpact {
  /** Texto del reverso: "Hoy compraste a N productores". */
  text: string;
  /** URL pública a la que apunta el QR. */
  qrUrl: string;
  /** QR ya dibujado (SVG como data URI) para imprimir sin generar nada en el navegador. */
  qrDataUrl: string;
}

/**
 * Bloque de impacto para la boleta de una venta ya EMITIDA (llamar después de
 * confirmar la transacción de la venta; solo lee). Devuelve `null` si no hay
 * nada que imprimir. Nunca lanza: un fallo aquí no puede tumbar una venta.
 */
export async function buildReceiptImpact(
  companyId: string,
  salesDocumentId: string,
  baseUrl: string = platformBaseUrl()
): Promise<ReceiptImpact | null> {
  try {
    const loaded = await loadImpact(companyId, salesDocumentId);
    if (!loaded) return null;
    const qrUrl = impactUrl(baseUrl, signImpactToken({ companyId, salesDocumentId }));
    const svg = await QRCode.toString(qrUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return {
      text: loaded.summary.text,
      qrUrl,
      qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  } catch (error) {
    captureException(error, { module: 'impacto', companyId, extra: { salesDocumentId } });
    return null;
  }
}
