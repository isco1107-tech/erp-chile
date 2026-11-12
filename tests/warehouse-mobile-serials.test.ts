import { addSerialToLine, lineNeedsSerials, removeSerialFromLine, toOperations, upgradeDraft, validateDraft, addProduct, emptyDraft, mergeDuplicates, type Draft } from '@/lib/warehouse-mobile/draft';
import { moveOpSchema } from '@/modules/warehouse-mobile/schema';
import type { MobileProduct } from '@/modules/warehouse-mobile/types';

const product = (overrides: Partial<MobileProduct> = {}): MobileProduct => ({
  id: 'p1', sku: 'NB', name: 'Notebook', brand: null, unit: 'UN', barcode: null, imageUrl: null, tracksLots: false, tracksSerials: true, isActive: true, stock: 5, totalStock: 5, ...overrides,
});
const ctx = { canCreateProduct: false, supplierCount: 0 };
const draftWith = (mode: Draft['mode'], p = product()): Draft => addProduct(emptyDraft(mode, 'w1'), p, { id: 'l1', now: 1, origin: 'manual', photoId: null } as never);

describe('series en la lista de la bodega móvil', () => {
  it('solo los productos con la marca piden series', () => {
    expect(lineNeedsSerials(draftWith('RECEIVE').lines[0]!)).toBe(true);
    expect(lineNeedsSerials(draftWith('RECEIVE', product({ tracksSerials: false })).lines[0]!)).toBe(false);
    // Un catálogo guardado antes no trae la marca: se trata como sin serie.
    expect(lineNeedsSerials(draftWith('RECEIVE', product({ tracksSerials: undefined })).lines[0]!)).toBe(false);
  });

  it('cada serie leída sube la cantidad y no admite repetidas', () => {
    let draft = draftWith('RECEIVE');
    const first = addSerialToLine(draft, 'l1', ' sn-1 ');
    expect(first.patch).toEqual({ serials: ['SN-1'], quantity: 1 });
    draft = { ...draft, lines: [{ ...draft.lines[0]!, ...first.patch! }] };
    const second = addSerialToLine(draft, 'l1', 'SN-2');
    expect(second.patch).toEqual({ serials: ['SN-1', 'SN-2'], quantity: 2 });
    expect(addSerialToLine(draft, 'l1', 'sn-1').error).toContain('ya está');
    expect(addSerialToLine(draft, 'l1', '<x>').error).toContain('no válida');
    expect(addSerialToLine(draft, 'nada', 'SN-9').error).toContain('no se controla');
  });

  it('no se puede enviar con series de menos o de más', () => {
    const draft = draftWith('RECEIVE');
    const withQty = (quantity: number, serials: string[]): Draft => ({ ...draft, lines: [{ ...draft.lines[0]!, quantity, serials }] });
    expect(validateDraft(withQty(2, ['A']), ctx).map((p) => p.message)).toEqual(['Falta 1 serie: lee o escribe la de cada unidad.']);
    expect(validateDraft(withQty(1, ['A', 'B']), ctx).map((p) => p.message)).toEqual(['Sobra 1 serie: quita las que no van.']);
    expect(validateDraft(withQty(2, ['A', 'B']), ctx)).toEqual([]);
    expect(validateDraft(withQty(1.5, []), ctx)[0]!.message).toContain('unidades enteras');
  });

  it('las series viajan en la operación y quitar una la deja fuera', () => {
    const draft = draftWith('RECEIVE');
    const line = { ...draft.lines[0]!, quantity: 2, serials: ['A', 'B'] };
    const ops = toOperations({ ...draft, lines: [line] }).ops;
    expect(ops[0]).toMatchObject({ kind: 'MOVE', quantity: 2, serials: ['A', 'B'] });
    expect(removeSerialFromLine(line, 'A')).toEqual({ serials: ['B'] });
    // Un producto sin serie no manda el campo.
    const plain = draftWith('RECEIVE', product({ tracksSerials: false }));
    expect(toOperations(plain).ops[0]).not.toHaveProperty('serials');
  });

  it('las líneas con series no se juntan y un borrador viejo se actualiza', () => {
    const a = { ...draftWith('RECEIVE').lines[0]!, serials: ['A'] };
    const b = { ...draftWith('RECEIVE').lines[0]!, id: 'l2', serials: [] };
    expect(mergeDuplicates([a, b])).toHaveLength(2);
    const old = { ...draftWith('RECEIVE'), lines: [{ ...draftWith('RECEIVE').lines[0]!, serials: undefined as unknown as string[] }] };
    expect(upgradeDraft(old).lines[0]!.serials).toEqual([]);
  });

  it('el servidor exige una serie por unidad cuando vienen', () => {
    const base = { kind: 'MOVE', clientOpId: 'abcdefgh12', mode: 'RECEIVE', productId: 'p1', warehouseId: 'w1' } as const;
    expect(moveOpSchema.safeParse({ ...base, quantity: 2, serials: ['A', 'B'] }).success).toBe(true);
    expect(moveOpSchema.safeParse({ ...base, quantity: 3, serials: ['A', 'B'] }).success).toBe(false);
    expect(moveOpSchema.safeParse({ ...base, quantity: 2, serials: ['A', 'a'] }).success).toBe(false);
    expect(moveOpSchema.safeParse({ ...base, quantity: 1, serials: ['<x>'] }).success).toBe(false);
    // Sin series (un teléfono con una cola vieja) sigue valiendo.
    expect(moveOpSchema.safeParse({ ...base, quantity: 3 }).success).toBe(true);
  });
});
