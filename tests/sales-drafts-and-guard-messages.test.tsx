import { renderToStaticMarkup } from 'react-dom/server';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postCreditNoteIssued: jest.fn(),
  postSalesDocumentIssued: jest.fn(),
  reverseSalesDocumentPosting: jest.fn(),
}));
jest.mock('@/lib/auth/session', () => ({ verifySessionToken: jest.fn() }));
jest.mock('@/lib/auth/sessions', () => ({ isSessionRevoked: jest.fn(), touchSession: jest.fn() }));
jest.mock('@/lib/auth/ip-allowlist-guard', () => ({ checkIpAllowlist: jest.fn() }));
jest.mock('@/lib/security/cloudflare', () => ({ getClientIp: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));

import { deleteSalesDraft, getSalesDraftForEdit } from '@/modules/sales/services/sales.service';
import {
  ModuleNotEnabledError,
  authErrorMessage,
  missingPermissionMessage,
  moduleNotEnabledMessage,
} from '@/lib/auth/guards';
import FolioNotice from '@/components/sales/FolioNotice';

afterEach(() => jest.restoreAllMocks());

function mockTx(tx: Record<string, unknown>) {
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: unknown) =>
    (callback as (client: unknown) => Promise<unknown>)(tx)) as never);
}

describe('deleteSalesDraft', () => {
  it('rechaza un documento emitido sin borrar nada', async () => {
    const deleteMany = jest.fn();
    mockTx({
      salesDocument: {
        findFirst: async () => ({ id: 'd1', status: 'ISSUED', dteType: 'FACTURA_33', totalAmount: 1000 }),
        deleteMany,
      },
      payment: { count: async () => 0 },
    });
    await expect(deleteSalesDraft('cmp_1', 'd1')).rejects.toThrow(/Solo se pueden eliminar borradores/);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rechaza un documento de otra empresa (la lectura va filtrada por companyId)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    mockTx({ salesDocument: { findFirst, deleteMany: jest.fn() }, payment: { count: async () => 0 } });
    await expect(deleteSalesDraft('cmp_1', 'ajeno')).rejects.toThrow('Documento no encontrado');
    expect(findFirst.mock.calls[0]![0].where).toEqual({ id: 'ajeno', companyId: 'cmp_1' });
  });

  it('borra solo con id + companyId + status DRAFT', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    mockTx({
      salesDocument: {
        findFirst: async () => ({ id: 'd1', status: 'DRAFT', dteType: 'BOLETA_39', totalAmount: 5000 }),
        deleteMany,
      },
      payment: { count: async () => 0 },
    });
    await expect(deleteSalesDraft('cmp_1', 'd1')).resolves.toEqual({ id: 'd1', dteType: 'BOLETA_39', totalAmount: 5000 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'd1', companyId: 'cmp_1', status: 'DRAFT' } });
  });

  it('no borra si el documento se emitió entre la lectura y el borrado', async () => {
    mockTx({
      salesDocument: {
        findFirst: async () => ({ id: 'd1', status: 'DRAFT', dteType: 'BOLETA_39', totalAmount: 5000 }),
        deleteMany: async () => ({ count: 0 }),
      },
      payment: { count: async () => 0 },
    });
    await expect(deleteSalesDraft('cmp_1', 'd1')).rejects.toThrow(/ya no existe o se emitió/);
  });

  it('no borra un borrador con pagos asociados', async () => {
    const deleteMany = jest.fn();
    mockTx({
      salesDocument: {
        findFirst: async () => ({ id: 'd1', status: 'DRAFT', dteType: 'BOLETA_39', totalAmount: 5000 }),
        deleteMany,
      },
      payment: { count: async () => 1 },
    });
    await expect(deleteSalesDraft('cmp_1', 'd1')).rejects.toThrow(/pagos asociados/);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('getSalesDraftForEdit', () => {
  it('solo lee borradores de la empresa y arma los datos del formulario', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'd1',
      contactId: 'c1',
      warehouseId: 'w1',
      dteType: 'FACTURA_33',
      paymentMethod: 'CREDITO_30',
      dueDate: new Date('2026-11-05T00:00:00.000Z'),
      referenceFolio: null,
      referenceType: null,
      notes: null,
      sellerId: null,
      salesOrderId: null,
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      items: [
        { salesOrderItemId: null, productId: 'p1', sku: 'A1', description: 'Cosa', quantity: 2, unitPrice: 1000, isExempt: false, discountPercent: 0, unitCostPMP: 700 },
      ],
    });
    jest.spyOn(prisma.salesDocument, 'findFirst').mockImplementation(findFirst as never);

    const draft = await getSalesDraftForEdit('cmp_1', 'd1');

    expect(findFirst.mock.calls[0]![0].where).toEqual({ id: 'd1', companyId: 'cmp_1', status: 'DRAFT' });
    expect(draft?.dueDate).toBe('2026-11-05');
    expect(draft?.notes).toBe('');
    expect(draft?.items).toHaveLength(1);
    // El costo nunca viaja al formulario.
    expect(JSON.stringify(draft)).not.toContain('unitCostPMP');
  });

  it('devuelve null si no hay borrador', async () => {
    jest.spyOn(prisma.salesDocument, 'findFirst').mockResolvedValue(null as never);
    await expect(getSalesDraftForEdit('cmp_1', 'x')).resolves.toBeNull();
  });
});

describe('mensajes de autorización', () => {
  it('el permiso faltante se nombra con su etiqueta y dice a quién pedirlo', () => {
    const message = missingPermissionMessage('sales:write');
    expect(message).toContain('«Crear ventas y cotizaciones»');
    expect(message).toContain('dueño de la cuenta');
    expect(message).toContain('Configuración → Equipo');
  });

  it('el módulo fuera del plan se nombra', () => {
    expect(moduleNotEnabledMessage('hasDteBilling')).toContain('«Facturación Electrónica (DTE)»');
    expect(authErrorMessage(new ModuleNotEnabledError('hasPos'))).toContain('«Punto de Venta (POS)»');
    expect(authErrorMessage(new ModuleNotEnabledError('hasPos'))).toMatch(/^Módulo no incluido en tu plan actual/);
  });
});

describe('FolioNotice', () => {
  const base = { dteType: 'FACTURA_33' as const, hasDteBilling: true, hasFolios: false, canManageFolios: true };

  it('avisa numeración interna y enlaza a Folios cuando faltan folios', () => {
    const html = renderToStaticMarkup(<FolioNotice {...base} />);
    expect(html).toContain('Se emitirá con numeración interna, sin validez ante el SII');
    expect(html).toContain('href="/dashboard/settings/folios"');
  });

  it('sin permiso para cargar folios no ofrece el enlace', () => {
    const html = renderToStaticMarkup(<FolioNotice {...base} canManageFolios={false} />);
    expect(html).toContain('numeración interna');
    expect(html).not.toContain('href=');
  });

  it('no avisa si hay folios, ni para una cotización', () => {
    expect(renderToStaticMarkup(<FolioNotice {...base} hasFolios />)).toBe('');
    expect(renderToStaticMarkup(<FolioNotice {...base} dteType="COTIZACION" />)).toBe('');
  });

  it('sin facturación electrónica muestra una nota neutra, sin enlace', () => {
    const html = renderToStaticMarkup(<FolioNotice {...base} hasDteBilling={false} />);
    expect(html).toContain('son internos');
    expect(html).not.toContain('settings/folios');
  });
});
