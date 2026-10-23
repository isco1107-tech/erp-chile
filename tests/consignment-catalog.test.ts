/**
 * Consignación en contactos y catálogo: quién puede ser seller y de quién es un producto.
 *
 * Reglas que estos tests protegen:
 *  - un seller siempre trae su comisión (no se inventa una);
 *  - no se le quita la condición de seller ni se elimina mientras tenga productos en consignación;
 *  - el dueño de un producto solo cambia con el stock en 0, debe ser un seller DE LA EMPRESA y
 *    un producto en consignación queda con costo 0 (no se valoriza).
 *
 * Prisma: se espía el cliente real; lo no simulado lanza "Consulta no prevista".
 */

import { prisma } from '@/lib/prisma';
import { createContact, deleteContact, updateContact } from '@/modules/contacts/services/contacts.service';
import { createProduct, updateProduct } from '@/modules/inventory/services/products.service';

type Row = Record<string, unknown>;
type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: never[]) => unknown>;

const MODELS = {
  contact: ['findFirst', 'create', 'updateMany', 'deleteMany'],
  product: ['findFirst', 'count', 'create', 'updateMany'],
  consignmentSettlement: ['count'],
  category: ['findFirst'],
} as const;

function installDb(): Record<keyof typeof MODELS, Mocks> {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODELS)) {
    db[model] = {};
    for (const method of methods) {
      db[model]![method] = jest.spyOn((prisma as unknown as Record<string, Delegate>)[model]!, method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as Record<keyof typeof MODELS, Mocks>;
}

const COMPANY = 'company-a';
const dataOf = (mock: jest.Mock, call = 0) => (mock.mock.calls[call]![0] as { data: Row }).data;
const whereOf = (mock: jest.Mock, call = 0) => (mock.mock.calls[call]![0] as { where: Row }).where;

let db: ReturnType<typeof installDb>;
let tx: { $queryRaw: jest.Mock; product: Mocks; contact: Mocks };
beforeEach(() => {
  db = installDb();
  tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: { findFirst: jest.fn(), updateMany: jest.fn() },
    contact: { findFirst: jest.fn() },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation(((callback: (client: unknown) => unknown) => callback(tx)) as never);
});
afterEach(() => jest.restoreAllMocks());

const NEW_CONTACT = { rut: '12.345.678-5', razonSocial: 'Cerámicas del Sur', isConsignor: true };

describe('contactos: seller', () => {
  it('un seller nuevo exige su comisión', async () => {
    await expect(createContact(COMPANY, NEW_CONTACT)).rejects.toThrow('Indica la comisión del seller');
    await expect(createContact(COMPANY, { ...NEW_CONTACT, consignmentCommissionBps: null })).rejects.toThrow('Indica la comisión del seller');
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it('guarda la comisión del seller y no guarda una para quien no lo es', async () => {
    db.contact.create.mockResolvedValue({ id: 'c1' });
    await createContact(COMPANY, { ...NEW_CONTACT, consignmentCommissionBps: 2000 });
    expect(dataOf(db.contact.create)).toMatchObject({ companyId: COMPANY, isConsignor: true, consignmentCommissionBps: 2000 });

    await createContact(COMPANY, { ...NEW_CONTACT, isConsignor: false, consignmentCommissionBps: 2000 });
    expect(dataOf(db.contact.create, 1)).toMatchObject({ isConsignor: false });
    expect(dataOf(db.contact.create, 1).consignmentCommissionBps).toBeUndefined();
  });

  it('editar otros datos no toca la condición de seller', async () => {
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    db.contact.findFirst.mockResolvedValue({ id: 'c1' });
    await updateContact(COMPANY, 'c1', { razonSocial: 'Nuevo nombre' });
    const data = dataOf(db.contact.updateMany);
    expect(data).not.toHaveProperty('isConsignor');
    expect(data).not.toHaveProperty('consignmentCommissionBps');
    expect(db.product.count).not.toHaveBeenCalled();
  });

  it('marcar como seller a un contacto que no tiene comisión la exige', async () => {
    db.contact.findFirst.mockResolvedValue({ isConsignor: false, consignmentCommissionBps: null });
    await expect(updateContact(COMPANY, 'c1', { isConsignor: true })).rejects.toThrow('Indica la comisión del seller');
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it('cambiar la comisión de un seller la guarda; quitarle la condición la borra', async () => {
    db.contact.updateMany.mockResolvedValue({ count: 1 });
    db.product.count.mockResolvedValue(0);

    db.contact.findFirst.mockResolvedValueOnce({ isConsignor: true, consignmentCommissionBps: 1500 }).mockResolvedValueOnce({ id: 'c1' });
    await updateContact(COMPANY, 'c1', { consignmentCommissionBps: 2500 });
    expect(dataOf(db.contact.updateMany)).toMatchObject({ isConsignor: true, consignmentCommissionBps: 2500 });

    db.contact.findFirst.mockResolvedValueOnce({ isConsignor: true, consignmentCommissionBps: 1500 }).mockResolvedValueOnce({ id: 'c1' });
    await updateContact(COMPANY, 'c1', { isConsignor: false });
    expect(dataOf(db.contact.updateMany, 1)).toMatchObject({ isConsignor: false, consignmentCommissionBps: null });
  });

  it('no se le quita la condición de seller mientras tenga productos en consignación', async () => {
    db.contact.findFirst.mockResolvedValue({ isConsignor: true, consignmentCommissionBps: 1500 });
    db.product.count.mockResolvedValue(3);
    await expect(updateContact(COMPANY, 'c1', { isConsignor: false })).rejects.toThrow('3 productos en consignación');
    expect(whereOf(db.product.count)).toEqual({ companyId: COMPANY, consignorId: 'c1' });
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it('no se elimina un seller con productos ni con liquidaciones', async () => {
    db.product.count.mockResolvedValue(1);
    db.consignmentSettlement.count.mockResolvedValue(0);
    await expect(deleteContact(COMPANY, 'c1')).rejects.toThrow('productos en consignación');

    db.product.count.mockResolvedValue(0);
    db.consignmentSettlement.count.mockResolvedValue(2);
    await expect(deleteContact(COMPANY, 'c1')).rejects.toThrow('liquidaciones');
    expect(db.contact.deleteMany).not.toHaveBeenCalled();
  });

  it('un contacto sin consignación se elimina como siempre', async () => {
    db.product.count.mockResolvedValue(0);
    db.consignmentSettlement.count.mockResolvedValue(0);
    db.contact.deleteMany.mockResolvedValue({ count: 1 });
    await deleteContact(COMPANY, 'c1');
    expect(whereOf(db.contact.deleteMany)).toEqual({ companyId: COMPANY, id: 'c1' });
  });
});

describe('catálogo: dueño del producto', () => {
  const stockOf = (quantity: number) => ({ consignorId: null, consignmentCommissionBps: null, stocks: [{ quantity }] });

  it('un producto nuevo solo puede ser de un seller de la empresa', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(createProduct(COMPANY, { sku: 'A1', name: 'Taza', netPrice: 5000, unit: 'UN', consignorId: 'otro' })).rejects.toThrow('no existe o no está marcado como seller');
    expect(whereOf(db.contact.findFirst)).toEqual({ id: 'otro', companyId: COMPANY, isConsignor: true });
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it('un producto nuevo de seller guarda dueño y comisión propia', async () => {
    db.contact.findFirst.mockResolvedValue({ id: 's1' });
    db.product.create.mockResolvedValue({ id: 'p1' });
    await createProduct(COMPANY, { sku: 'A1', name: 'Taza', netPrice: 5000, unit: 'UN', consignorId: 's1', consignmentCommissionBps: 1000 });
    expect(dataOf(db.product.create)).toMatchObject({ companyId: COMPANY, consignorId: 's1', consignmentCommissionBps: 1000 });
  });

  it('un producto propio no guarda dueño ni comisión', async () => {
    db.product.create.mockResolvedValue({ id: 'p1' });
    await createProduct(COMPANY, { sku: 'A1', name: 'Taza', netPrice: 5000, unit: 'UN', consignorId: null, consignmentCommissionBps: 1000 });
    const data = dataOf(db.product.create);
    expect(data.consignorId).toBeUndefined();
    expect(data.consignmentCommissionBps).toBeUndefined();
  });

  it('cambiar el dueño con stock en bodega se rechaza', async () => {
    tx.product.findFirst.mockResolvedValue(stockOf(5));
    await expect(updateProduct(COMPANY, 'p1', { consignorId: 's1' })).rejects.toThrow('su stock debe estar en 0 (hoy tiene 5)');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('con el stock en 0 pasa a ser del seller con costo 0 y bloquea el producto mientras revisa', async () => {
    tx.product.findFirst.mockResolvedValue(stockOf(0));
    tx.contact.findFirst.mockResolvedValue({ id: 's1' });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: 'p1' });
    await updateProduct(COMPANY, 'p1', { consignorId: 's1', consignmentCommissionBps: 1800 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect((tx.product.updateMany.mock.calls[0]![0] as { where: Row }).where).toEqual({ companyId: COMPANY, id: 'p1' });
    expect(dataOf(tx.product.updateMany)).toMatchObject({ consignorId: 's1', consignmentCommissionBps: 1800, costPricePMP: 0 });
  });

  it('el seller debe ser de la empresa', async () => {
    tx.product.findFirst.mockResolvedValue(stockOf(0));
    tx.contact.findFirst.mockResolvedValue(null);
    await expect(updateProduct(COMPANY, 'p1', { consignorId: 'ajeno' })).rejects.toThrow('no existe o no está marcado como seller');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('volver a producto propio borra la comisión del producto', async () => {
    tx.product.findFirst.mockResolvedValue({ consignorId: 's1', consignmentCommissionBps: 1800, stocks: [{ quantity: 0 }] });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: 'p1' });
    await updateProduct(COMPANY, 'p1', { consignorId: null });
    expect(dataOf(tx.product.updateMany)).toMatchObject({ consignorId: null, consignmentCommissionBps: null, costPricePMP: 0 });
  });

  it('ajustar solo la comisión no exige stock en 0 ni cambia el costo', async () => {
    tx.product.findFirst.mockResolvedValue({ consignorId: 's1', consignmentCommissionBps: 1800, stocks: [{ quantity: 40 }] });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: 'p1' });
    await updateProduct(COMPANY, 'p1', { consignorId: 's1', consignmentCommissionBps: 2200 });
    const data = dataOf(tx.product.updateMany);
    expect(data).toMatchObject({ consignorId: 's1', consignmentCommissionBps: 2200 });
    expect(data).not.toHaveProperty('costPricePMP');
  });

  it('una edición sin tocar el dueño no abre transacción', async () => {
    db.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: 'p1' });
    await updateProduct(COMPANY, 'p1', { name: 'Taza grande' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const data = dataOf(db.product.updateMany);
    expect(data).not.toHaveProperty('consignorId');
  });
});
