/**
 * Server Actions de consignación, productos y contactos: ids, permisos y errores.
 *
 *  - un id que no es texto (un objeto con un operador de Prisma) se rechaza ANTES de tocar nada: llegaba
 *    tal cual a `updateMany` y alcanzaba a todos los productos o contactos de la empresa;
 *  - la comisión y el dueño de un producto de seller, y la condición de seller de un contacto, solo cambian
 *    con `consignment:write` (quien edita productos o clientes no fija lo que se le paga a un tercero), y se
 *    comparan contra lo guardado: editar otra cosa con el formulario no es un cambio;
 *  - los errores inesperados no se muestran crudos al usuario: van a observabilidad.
 */

const permissions = new Set<string>();
const session = { id: 'u1', email: 'admin@test.cl', companyId: 'company-a' };

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
const captureException = jest.fn();
jest.mock('@/lib/observability', () => ({ captureException: (...args: unknown[]) => captureException(...args) }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(async (permission: string) => {
    if (!permissions.has(permission)) throw new Error('sin permiso');
    return session;
  }),
  authErrorMessage: () => null,
  can: (_session: unknown, permission: string) => permissions.has(permission),
}));
jest.mock('@/modules/inventory/services/products.service', () => ({
  getProduct: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  setProductActive: jest.fn(),
}));
jest.mock('@/modules/contacts/services/contacts.service', () => ({
  getContact: jest.fn(),
  createContact: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: jest.fn(),
}));
jest.mock('@/modules/inventory/services/consignment-settlement.service', () => ({
  generateSettlement: jest.fn(),
  getPendingSettlement: jest.fn(),
}));

import { createAuditLog } from '@/lib/auth/audit';
import { createProductAction, deleteProductAction, getProductAction, setProductActiveAction, updateProductAction } from '@/modules/inventory/actions/products.actions';
import { createContactAction, deleteContactAction, getContactAction, updateContactAction } from '@/modules/contacts/actions/contacts.actions';
import { generateSettlementAction, getPendingSettlementAction } from '@/modules/inventory/actions/consignment.actions';
import * as products from '@/modules/inventory/services/products.service';
import * as contacts from '@/modules/contacts/services/contacts.service';
import * as settlements from '@/modules/inventory/services/consignment-settlement.service';

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;
const BAD_IDS: unknown[] = [{ not: '' }, ['a'], 123, null, undefined, '', 'x'.repeat(65)];

beforeEach(() => {
  permissions.clear();
  jest.clearAllMocks();
});

describe('un id que no es texto no alcanza a ningún registro', () => {
  it.each(BAD_IDS.map((value) => [JSON.stringify(value) ?? String(value), value] as const))('productos y contactos rechazan %s sin llamar al servicio', async (_label, bad) => {
    for (const permission of ['products:read', 'products:write', 'contacts:read', 'contacts:write']) permissions.add(permission);
    const id = bad as string;
    const results = [
      await getProductAction(id),
      await updateProductAction(id, { consignorId: 's1' }),
      await deleteProductAction(id),
      await setProductActiveAction(id, false),
      await getContactAction(id),
      await updateContactAction(id, { isConsignor: true, consignmentCommissionBps: 0 }),
      await deleteContactAction(id),
    ];
    for (const result of results) expect(result).toEqual({ success: false, error: 'Datos inválidos' });
    for (const service of [products.getProduct, products.updateProduct, products.deleteProduct, products.setProductActive, contacts.getContact, contacts.updateContact, contacts.deleteContact]) {
      expect(service).not.toHaveBeenCalled();
    }
  });
});

describe('dueño y comisión de un producto de seller', () => {
  const stored = { id: 'p1', consignorId: 's1', consignmentCommissionBps: 1500 };

  beforeEach(() => {
    permissions.add('products:write');
    mocked(products.getProduct).mockResolvedValue(stored);
    mocked(products.updateProduct).mockResolvedValue(stored);
  });

  it('sin consignment:write no se cambia el dueño ni la comisión', async () => {
    const owner = await updateProductAction('p1', { consignorId: 's2' });
    const commission = await updateProductAction('p1', { consignorId: 's1', consignmentCommissionBps: 0 });
    for (const result of [owner, commission]) expect(result).toMatchObject({ success: false, error: expect.stringContaining('permiso de consignación') });
    expect(products.updateProduct).not.toHaveBeenCalled();
  });

  it('editar otra cosa con el formulario (que manda siempre estos campos) no es un cambio', async () => {
    const result = await updateProductAction('p1', { name: 'Taza grande', consignorId: 's1', consignmentCommissionBps: 1500 });
    expect(result.success).toBe(true);
    expect(products.updateProduct).toHaveBeenCalledTimes(1);
  });

  it('un producto propio editado por el formulario (dueño null y sin comisión) tampoco lo es', async () => {
    mocked(products.getProduct).mockResolvedValue({ id: 'p9', consignorId: null, consignmentCommissionBps: null });
    const result = await updateProductAction('p9', { name: 'Otro nombre', consignorId: null, consignmentCommissionBps: null });
    expect(result.success).toBe(true);
  });

  it('con consignment:write sí se cambia', async () => {
    permissions.add('consignment:write');
    const result = await updateProductAction('p1', { consignorId: 's2', consignmentCommissionBps: 1000 });
    expect(result.success).toBe(true);
    expect(products.updateProduct).toHaveBeenCalledWith('company-a', 'p1', expect.objectContaining({ consignorId: 's2', consignmentCommissionBps: 1000 }));
  });

  it('crear un producto de seller exige el permiso; uno propio no', async () => {
    mocked(products.createProduct).mockResolvedValue({ id: 'n1', sku: 'A', name: 'A' });
    mocked(products.getProduct).mockResolvedValue({ id: 'n1', costPricePMP: 0 });
    const base = { sku: 'A1', name: 'Taza', netPrice: 5000, unit: 'UN' };
    expect(await createProductAction({ ...base, consignorId: 's1' })).toMatchObject({ success: false, error: expect.stringContaining('permiso de consignación') });
    expect(products.createProduct).not.toHaveBeenCalled();
    expect((await createProductAction({ ...base, consignorId: null })).success).toBe(true);
    expect(products.createProduct).toHaveBeenCalledTimes(1);
  });
});

describe('condición de seller y comisión de un contacto', () => {
  const stored = { id: 'c1', isConsignor: true, consignmentCommissionBps: 2000 };

  beforeEach(() => {
    permissions.add('contacts:write');
    mocked(contacts.getContact).mockResolvedValue(stored);
    mocked(contacts.updateContact).mockResolvedValue(stored);
  });

  it('un vendedor no marca sellers ni cambia su comisión (y no queda nada hecho)', async () => {
    const create = await createContactAction({ rut: '12.345.678-5', razonSocial: 'Cerámicas', isConsignor: true, consignmentCommissionBps: 2000 });
    const raise = await updateContactAction('c1', { isConsignor: true, consignmentCommissionBps: 0 });
    const demote = await updateContactAction('c1', { isConsignor: false });
    for (const result of [create, raise, demote]) expect(result).toMatchObject({ success: false, error: expect.stringContaining('permiso de consignación') });
    expect(contacts.createContact).not.toHaveBeenCalled();
    expect(contacts.updateContact).not.toHaveBeenCalled();
  });

  it('editar los datos de un seller sin tocar su comisión es de cualquiera con contacts:write y no deja bitácora de consignación', async () => {
    const result = await updateContactAction('c1', { razonSocial: 'Nuevo nombre', isConsignor: true, consignmentCommissionBps: 2000 });
    expect(result.success).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledTimes(1);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('un cliente normal se crea y se edita sin el permiso', async () => {
    mocked(contacts.createContact).mockResolvedValue({ id: 'c2' });
    expect((await createContactAction({ rut: '12.345.678-5', razonSocial: 'Cliente', isConsignor: false })).success).toBe(true);
    mocked(contacts.getContact).mockResolvedValue({ id: 'c2', isConsignor: false, consignmentCommissionBps: null });
    mocked(contacts.updateContact).mockResolvedValue({ id: 'c2' });
    expect((await updateContactAction('c2', { razonSocial: 'Cliente 2', isConsignor: false, consignmentCommissionBps: null })).success).toBe(true);
  });

  it('con consignment:write el cambio se hace y queda en la bitácora con lo anterior y lo nuevo', async () => {
    permissions.add('consignment:write');
    const result = await updateContactAction('c1', { isConsignor: true, consignmentCommissionBps: 2500 });
    expect(result.success).toBe(true);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-a',
        entity: 'Contact',
        entityId: 'c1',
        metadata: { consignment: { from: { isConsignor: true, commissionBps: 2000 }, to: { isConsignor: true, commissionBps: 2500 } } },
      })
    );
  });
});

describe('errores de las acciones de consignación', () => {
  beforeEach(() => {
    permissions.add('consignment:write');
    permissions.add('consignment:read');
  });

  it('un error de negocio (Error plano con mensaje en español) se muestra tal cual', async () => {
    mocked(settlements.generateSettlement).mockRejectedValue(new Error('No hay ventas pendientes de liquidar para este seller'));
    const result = await generateSettlementAction({ consignorId: 's1', adjustmentAmount: 0 });
    expect(result).toEqual({ success: false, error: 'No hay ventas pendientes de liquidar para este seller' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('un fallo inesperado NO se muestra crudo: se reporta y la persona ve un mensaje genérico', async () => {
    mocked(settlements.getPendingSettlement).mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'lines')"));
    const result = await getPendingSettlementAction('s1');
    expect(result).toEqual({ success: false, error: expect.stringContaining('No se pudo completar la operación') });
    expect(JSON.stringify(result)).not.toContain('Cannot read properties');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]![1]).toMatchObject({ module: 'consignacion', companyId: 'company-a' });
  });

  it('un id que no es texto en lo que se consulta no llega al servicio como objeto', async () => {
    mocked(settlements.getPendingSettlement).mockResolvedValue({ consignor: { id: 'x' }, lines: [], totals: {} });
    await getPendingSettlementAction({ not: '' } as unknown as string);
    expect(settlements.getPendingSettlement).toHaveBeenCalledWith('company-a', '[object Object]');
  });

  it('generar valida con Zod: un ajuste sin motivo o con decimales se rechaza antes del servicio', async () => {
    expect(await generateSettlementAction({ consignorId: 's1', adjustmentAmount: 500 })).toMatchObject({ success: false, error: 'Explica el motivo del ajuste' });
    expect((await generateSettlementAction({ consignorId: 's1', adjustmentAmount: 1.5, adjustmentNote: 'Bonificación' })).success).toBe(false);
    expect(settlements.generateSettlement).not.toHaveBeenCalled();
  });
});
