import { addSerial, addUnits, linesPendingSerials, serialProblem, setQuantity, setSerials, type CartLine, type CartProduct } from '@/lib/pos/cart';
import { holdSale, parseHeldSales } from '@/lib/pos/held-sales';

const notebook: CartProduct = { id: 'p1', sku: 'NB', name: 'Notebook', netPrice: 1000, grossPrice: 1190, stock: 5, isTrackable: true, isExempt: false, tracksSerials: true };
const milk: CartProduct = { id: 'p2', sku: 'LE', name: 'Leche', netPrice: 500, grossPrice: 595, stock: 50, isTrackable: true, isExempt: false };

describe('series en el carrito del POS', () => {
  it('un producto sin serie nunca queda pendiente', () => {
    const cart = addUnits([], milk, 3);
    expect(serialProblem(cart[0]!)).toBeNull();
    expect(linesPendingSerials(cart)).toEqual([]);
  });

  it('un producto con serie queda pendiente hasta tener una por unidad', () => {
    let cart: CartLine[] = addUnits([], notebook, 2);
    expect(serialProblem(cart[0]!)).toBe('Notebook: faltan 2 series');
    cart = addSerial(cart, 'p1', 'SN-1').cart;
    expect(serialProblem(cart[0]!)).toBe('Notebook: faltan 1 serie');
    cart = addSerial(cart, 'p1', 'SN-2').cart;
    expect(serialProblem(cart[0]!)).toBeNull();
  });

  it('rechaza una serie repetida o de más', () => {
    let cart: CartLine[] = addUnits([], notebook, 1);
    cart = addSerial(cart, 'p1', 'SN-1').cart;
    expect(addSerial(cart, 'p1', 'SN-1').error).toContain('ya está');
    expect(addSerial(cart, 'p1', 'SN-9').error).toContain('Ya indicaste todas');
    expect(addSerial(cart, 'no-existe', 'SN-9').cart).toBe(cart);
  });

  it('subir la cantidad deja la línea pendiente y bajarla marca las que sobran', () => {
    let cart: CartLine[] = setSerials(addUnits([], notebook, 1), 'p1', ['SN-1']);
    cart = addUnits(cart, notebook, 1);
    expect(serialProblem(cart[0]!)).toBe('Notebook: faltan 1 serie');
    cart = setSerials(cart, 'p1', ['SN-1', 'SN-2']);
    cart = setQuantity(cart, 'p1', 1);
    expect(serialProblem(cart[0]!)).toBe('Notebook: sobran 1 serie');
  });

  it('no admite fracciones en un producto con serie', () => {
    const cart = addUnits([], notebook, 1.5);
    expect(serialProblem(cart[0]!)).toContain('unidades enteras');
  });

  it('las series sobreviven a poner la venta en espera', () => {
    const cart = setSerials(addUnits([], notebook, 1), 'p1', ['SN-1']);
    const held = holdSale([], { id: 'h1', heldAt: 1, customerRut: null, customerName: null, rutResolved: false, lines: cart });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const restored = parseHeldSales(JSON.stringify(held.list));
    expect(restored[0]!.lines[0]).toMatchObject({ tracksSerials: true, serials: ['SN-1'] });
  });
});
