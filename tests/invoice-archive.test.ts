import { archivedInvoiceSchema, supplierKeyOf } from '@/modules/invoice-archive/schema';

describe('archivo de facturas', () => {
  it('agrupa proveedores aunque cambien mayúsculas, tildes, puntos o espacios', () => {
    expect(supplierKeyOf('  Distribuidora  Álamo S.A. ')).toBe('distribuidora alamo sa');
    expect(supplierKeyOf('DISTRIBUIDORA ALAMO SA')).toBe('distribuidora alamo sa');
    expect(supplierKeyOf('Panadería Ñuñoa')).toBe('panaderia nunoa');
  });

  const valid = { supplierName: 'Distribuidora Álamo', totalAmount: 119000, issueDate: '2026-09-20' };

  it('acepta proveedor, total y fecha; folio y nota son opcionales', () => {
    const parsed = archivedInvoiceSchema.safeParse({ ...valid, invoiceNumber: '', notes: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.invoiceNumber).toBeUndefined();
      expect(parsed.data.notes).toBeUndefined();
    }
  });

  it('exige un total entero y positivo en pesos', () => {
    expect(archivedInvoiceSchema.safeParse({ ...valid, totalAmount: 0 }).success).toBe(false);
    expect(archivedInvoiceSchema.safeParse({ ...valid, totalAmount: 1500.5 }).success).toBe(false);
    expect(archivedInvoiceSchema.safeParse({ ...valid, totalAmount: undefined }).success).toBe(false);
  });

  it('rechaza un proveedor vacío o solo con signos', () => {
    expect(archivedInvoiceSchema.safeParse({ ...valid, supplierName: '  ' }).success).toBe(false);
    expect(archivedInvoiceSchema.safeParse({ ...valid, supplierName: '...' }).success).toBe(false);
  });

  it('rechaza fechas futuras o mal tipeadas', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(archivedInvoiceSchema.safeParse({ ...valid, issueDate: future }).success).toBe(false);
    expect(archivedInvoiceSchema.safeParse({ ...valid, issueDate: '0202-01-01' }).success).toBe(false);
  });
});
