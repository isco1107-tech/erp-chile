/**
 * Servicio de impacto de la boleta con Prisma simulado: filtro por empresa del
 * token, módulo apagado, empresa suspendida, y que jamás salgan montos ni datos
 * de contacto del productor.
 */
jest.mock('@/lib/prisma', () => ({ prisma: { salesDocument: { findFirst: jest.fn() } } }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { signImpactToken } from '@/lib/impact/token';
import { buildReceiptImpact, getPublicImpact } from '@/modules/impact/services/impact.service';

const findFirst = prisma.salesDocument.findFirst as unknown as jest.Mock;
const companyId = 'cmcompany0000000000000001';
const documentId = 'cmdoc000000000000000001';

function doc(over: { status?: string; hasConsignment?: boolean; items?: unknown[] } = {}) {
  return {
    issueDate: new Date('2026-10-21T15:00:00Z'),
    company: {
      businessName: 'Súper Productores',
      status: over.status ?? 'ACTIVE',
      features: { hasConsignment: over.hasConsignment ?? true },
    },
    items: over.items ?? [
      {
        productId: 'p1',
        quantity: 2,
        total: 5000,
        product: {
          companyId,
          producerId: 'pr1',
          producer: { companyId, contact: { nombreFantasia: 'Miel Ñuble', razonSocial: 'Apícola Pérez SpA' } },
        },
      },
      {
        productId: 'p2',
        quantity: 1,
        total: 3000,
        product: {
          companyId,
          producerId: 'pr2',
          producer: { companyId, contact: { nombreFantasia: null, razonSocial: 'Huerta Verde Ltda' } },
        },
      },
      { productId: 'p3', quantity: 1, total: 900, product: { companyId, producerId: null, producer: null } },
    ],
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = 'secreto-de-prueba-impacto';
  findFirst.mockReset();
});

describe('getPublicImpact', () => {
  it('lee el documento filtrando por la empresa y el documento del token', async () => {
    findFirst.mockResolvedValue(doc());
    const token = signImpactToken({ companyId, salesDocumentId: documentId });
    const result = await getPublicImpact(token);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: documentId, companyId, status: 'ISSUED' });
    expect(findFirst.mock.calls[0][0].select.items.where.companyId).toBe(companyId);
    expect(result?.text).toBe('Hoy compraste a 2 productores');
    expect(result?.producers).toEqual([
      { name: 'Huerta Verde Ltda', itemCount: 1 },
      { name: 'Miel Ñuble', itemCount: 1 },
    ]);
  });

  it('no expone montos ni datos del productor', async () => {
    findFirst.mockResolvedValue(doc());
    const result = await getPublicImpact(signImpactToken({ companyId, salesDocumentId: documentId }));
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/amount|rut|email|phone|comision|commission|5000|3000/i);
    expect(json).not.toContain('Apícola Pérez');
  });

  it('token inválido: ni consulta la base', async () => {
    expect(await getPublicImpact('basura')).toBeNull();
    expect(await getPublicImpact(`${signImpactToken({ companyId, salesDocumentId: documentId })}x`)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('módulo apagado, empresa suspendida o documento ausente: null', async () => {
    const token = signImpactToken({ companyId, salesDocumentId: documentId });
    findFirst.mockResolvedValueOnce(doc({ hasConsignment: false }));
    expect(await getPublicImpact(token)).toBeNull();
    findFirst.mockResolvedValueOnce(doc({ status: 'SUSPENDED' }));
    expect(await getPublicImpact(token)).toBeNull();
    findFirst.mockResolvedValueOnce(null);
    expect(await getPublicImpact(token)).toBeNull();
  });

  it('venta sin productores: null (la métrica se omite)', async () => {
    findFirst.mockResolvedValue(
      doc({ items: [{ productId: 'p3', quantity: 1, total: 900, product: { companyId, producerId: null, producer: null } }] })
    );
    expect(await getPublicImpact(signImpactToken({ companyId, salesDocumentId: documentId }))).toBeNull();
  });

  it('un productor que pertenece a otra empresa no cuenta', async () => {
    findFirst.mockResolvedValue(
      doc({
        items: [
          {
            productId: 'p1',
            quantity: 1,
            total: 1000,
            product: {
              companyId,
              producerId: 'prX',
              producer: { companyId: 'otraEmpresa', contact: { nombreFantasia: 'Ajeno', razonSocial: 'Ajeno SpA' } },
            },
          },
        ],
      })
    );
    expect(await getPublicImpact(signImpactToken({ companyId, salesDocumentId: documentId }))).toBeNull();
  });
});

describe('buildReceiptImpact', () => {
  it('devuelve texto, URL firmada y QR', async () => {
    findFirst.mockResolvedValue(doc());
    const result = await buildReceiptImpact(companyId, documentId, 'https://erp.test');
    expect(result?.text).toBe('Hoy compraste a 2 productores');
    expect(result?.qrUrl).toMatch(/^https:\/\/erp\.test\/impacto\/cmcompany0000000000000001\.cmdoc000000000000000001\./);
    expect(result?.qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(findFirst.mock.calls[0][0].where.companyId).toBe(companyId);
  });

  it('null sin nada que imprimir y nunca lanza', async () => {
    findFirst.mockResolvedValueOnce(doc({ hasConsignment: false }));
    expect(await buildReceiptImpact(companyId, documentId, 'https://erp.test')).toBeNull();
    findFirst.mockRejectedValueOnce(new Error('db caída'));
    expect(await buildReceiptImpact(companyId, documentId, 'https://erp.test')).toBeNull();
  });
});
