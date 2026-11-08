jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ del: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(async () => ({ id: 'u1', companyId: 'c1', email: 'a@b.cl' })),
  authErrorMessage: () => null,
}));
jest.mock('@/modules/invoice-archive/services/invoice-archive.service', () => ({
  listSupplierInvoices: jest.fn(async () => [
    { id: 'inv_1', companyId: 'c1', fileUrl: 'r2private:///invoice-archive/c1/abc.pdf', mimeType: 'application/pdf' },
  ]),
}));

import { listSupplierInvoicesAction } from '@/modules/invoice-archive/actions/invoice-archive.actions';

/**
 * Endurecimiento 2026-11: la ubicación real del archivo de una factura (bucket
 * privado o URL pública antigua) nunca viaja al navegador; el panel solo
 * recibe la ruta autenticada que revisa sesión, permiso y empresa.
 */
describe('archivo de facturas: el navegador nunca recibe la ubicación real', () => {
  it('cambia fileUrl por la ruta autenticada', async () => {
    const result = await listSupplierInvoicesAction('proveedor');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]!.fileUrl).toBe('/api/invoice-archive/inv_1/file');
      expect(JSON.stringify(result.data)).not.toContain('r2private');
    }
  });
});
