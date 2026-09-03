'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Delete, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosTicket, { type TicketData } from './PosTicket';
import { createPosSaleAction, listPosProductsAction } from '@/modules/pos/actions/pos.actions';
import type { PosProduct } from '@/modules/pos/services/pos.service';
import {
  POS_PAYMENT_METHODS,
  POS_PAYMENT_METHOD_LABELS,
  type PosPaymentMethod,
} from '@/modules/pos/schema';
import { computeDocument } from '@/modules/sales/calc';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut, validateRut } from '@/lib/chile/rut';

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  netPrice: number;
  quantity: number;
  stock: number;
  isTrackable: boolean;
  isExempt: boolean;
}

interface Props {
  shiftId: string;
  warehouseId: string;
  warehouseName: string;
  cashRegisterName: string;
  cashierName: string;
  companyName: string;
  companyRut: string;
  companyAddress: string | null;
}

const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '000'];
/** Denominaciones frecuentes en efectivo, para no teclear el monto completo. */
const QUICK_CASH = [1000, 2000, 5000, 10000, 20000];

export default function PosTerminal(props: Props) {
  const router = useRouter();

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');
  const [customerRut, setCustomerRut] = useState('');
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * El lector de código de barras se comporta como un teclado que teclea muy
   * rápido y termina con Enter. Si el foco no está en el buscador, el código se
   * pierde en cualquier otro control, así que se devuelve el foco tras cada
   * acción.
   */
  const focusSearch = useCallback(() => {
    // En el siguiente frame: si se llama en medio del render, React todavía no
    // montó el input tras cerrar un diálogo o cambiar de vista.
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    listPosProductsAction(props.warehouseId).then((result) => {
      if (result.success) setProducts(result.data);
      else toast.error(result.error);
      setLoadingProducts(false);
      focusSearch();
    });
  }, [props.warehouseId, focusSearch]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, products]);

  const computed = useMemo(
    () =>
      computeDocument(
        cart.map((line) => ({
          ...line,
          unitPrice: line.netPrice,
          quantity: line.quantity,
          isExempt: line.isExempt,
        }))
      ),
    [cart]
  );

  const total = computed.totals.totalAmount;
  const received = Number(cashReceived) || 0;
  const change = received - total;
  const isCash = paymentMethod === 'EFECTIVO';
  const canCharge = cart.length > 0 && !saving && (!isCash || received >= total);

  function addProduct(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          netPrice: product.netPrice,
          quantity: 1,
          stock: product.stock,
          isTrackable: product.isTrackable,
          isExempt: product.isExempt,
        },
      ];
    });
    setQuery('');
    focusSearch();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;

    // El lector entrega el SKU exacto: esa coincidencia manda sobre la búsqueda
    // parcial, para que escanear nunca agregue el producto equivocado.
    const exact = products.find((p) => p.sku.toLowerCase() === q);
    const chosen = exact ?? matches[0];
    if (!chosen) {
      toast.error(`Sin resultados para "${query.trim()}"`);
      return;
    }
    addProduct(chosen);
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    );
    focusSearch();
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
    focusSearch();
  }

  function pressKey(key: string) {
    setCashReceived((prev) => {
      const next = `${prev}${key}`.replace(/^0+(?=\d)/, '');
      return next.slice(0, 9);
    });
  }

  function clearAll() {
    if (cart.length > 0 && !confirm('¿Vaciar la venta en curso?')) return;
    setCart([]);
    setCashReceived('');
    setCustomerRut('');
    setQuery('');
    focusSearch();
  }

  /** Manda el ticket a la impresora aislándolo del resto de la interfaz. */
  function printTicket() {
    document.documentElement.classList.add('pos-printing');
    window.print();
    document.documentElement.classList.remove('pos-printing');
  }

  async function handleCharge() {
    if (cart.length === 0) return;

    const rut = customerRut.trim();
    if (rut && !validateRut(rut)) {
      toast.error('El RUT del cliente no es válido');
      return;
    }

    const lowStock = cart.filter((line) => line.isTrackable && line.quantity > line.stock);
    if (lowStock.length > 0) {
      const detail = lowStock.map((l) => `${l.sku} (disponible ${l.stock})`).join(', ');
      if (!confirm(`Stock insuficiente en: ${detail}. El sistema rechazará la venta. ¿Intentar de todos modos?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const result = await createPosSaleAction(props.shiftId, {
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod,
        cashReceived: isCash ? received : undefined,
        customerRut: rut || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const sale = result.data;
      setTicket({
        companyName: props.companyName,
        companyRut: props.companyRut,
        companyAddress: props.companyAddress,
        folio: sale.folio,
        issuedAt: new Date(sale.issueDate),
        cashierName: props.cashierName,
        customerName: rut ? `Cliente ${formatRut(rut)}` : 'Consumidor Final',
        customerRut: rut ? formatRut(rut) : '66.666.666-6',
        lines: sale.items.map((item) => ({
          description: item.description,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          isExempt: item.isExempt,
        })),
        netAmount: sale.netAmount,
        exemptAmount: sale.exemptAmount,
        ivaAmount: sale.ivaAmount,
        totalAmount: sale.totalAmount,
        paymentMethodLabel: POS_PAYMENT_METHOD_LABELS[paymentMethod],
        cashReceived: isCash ? received : undefined,
        changeDue: isCash ? sale.changeDue : undefined,
      });

      toast.success(
        isCash && sale.changeDue > 0
          ? `Boleta #${sale.folio} — Vuelto ${formatCurrency(sale.changeDue)}`
          : `Boleta #${sale.folio} emitida`
      );

      setCart([]);
      setCashReceived('');
      setCustomerRut('');
      setQuery('');
      // El stock cambió: se recarga para que la próxima venta valide contra el
      // saldo real y no contra el que se cargó al abrir la caja.
      listPosProductsAction(props.warehouseId).then((r) => {
        if (r.success) setProducts(r.data);
      });
      router.refresh();
      focusSearch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="hud-surface rounded-2xl p-4">
          <p className="hud-label mb-2">Input stream / barcode</p><Label htmlFor="pos-search">Escanear o buscar producto</Label>
          <Input
            id="pos-search"
            ref={searchRef}
            autoFocus
            autoComplete="off"
            placeholder="Código de barras, SKU o nombre — Enter para agregar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-12 text-lg"
          />
          {loadingProducts && <p className="mt-2 font-mono text-xs text-muted-foreground">Cargando catálogo...</p>}
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {matches.map((product) => (
                <li
                  key={product.id}
                  className="flex cursor-pointer items-center justify-between border-b border-border px-3 py-3 text-sm transition-colors last:border-0 hover:bg-accent"
                  onClick={() => addProduct(product)}
                >
                  <span>
                    <span className="font-medium">{product.sku}</span> — {product.name}
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span className={product.isTrackable && product.stock <= 0 ? 'text-destructive' : ''}>
                      Stock {product.stock}
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(product.grossPrice)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hud-surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[520px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="hud-label p-3 text-left">Producto</th>
                <th className="hud-label p-3 text-left">Cantidad</th>
                {/* Neto en ambas columnas: el IVA se suma una vez en el total. */}
                <th className="hud-label p-3 text-left">P. Unit. neto</th>
                <th className="hud-label p-3 text-left">Neto línea</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                    <td className="p-10 text-center font-mono text-xs text-muted-foreground" colSpan={5}>
                    Escanea un producto para comenzar
                  </td>
                </tr>
              )}
              {computed.items.map((line) => (
                <tr key={line.productId} className="border-t border-border transition-colors hover:bg-muted/50">
                  <td className="p-2">
                    <p className="font-medium">{line.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <Button type="button" size="xs" variant="outline" onClick={() => changeQuantity(line.productId, -1)}>
                        −
                      </Button>
                      <span className="w-8 text-center font-medium">{line.quantity}</span>
                      <Button type="button" size="xs" variant="outline" onClick={() => changeQuantity(line.productId, 1)}>
                        +
                      </Button>
                    </div>
                    {line.isTrackable && line.quantity > line.stock && (
                      <p className="mt-1 text-xs text-destructive">Sobre stock ({line.stock})</p>
                    )}
                  </td>
                  <td className="p-2">{formatCurrency(line.netPrice)}</td>
                  <td className="p-2 font-medium">{formatCurrency(line.subtotal)}</td>
                  <td className="p-2">
                    <Button type="button" size="xs" variant="ghost" onClick={() => removeLine(line.productId)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="hud-surface rounded-2xl p-5">
          <p className="hud-label">
            {props.cashRegisterName} · {props.warehouseName}
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total a pagar</span>
            <span className="font-mono text-4xl tabular-nums text-primary drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]">{formatCurrency(total)}</span>
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
            <span>Neto {formatCurrency(computed.totals.netAmount)}</span>
            <span>IVA {formatCurrency(computed.totals.ivaAmount)}</span>
          </div>
        </div>

        <div className="hud-surface rounded-2xl p-4">
          <Label>Medio de pago</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POS_PAYMENT_METHODS.map((method) => (
              <Button
                key={method}
                type="button"
                variant={paymentMethod === method ? 'default' : 'outline'}
                onClick={() => {
                  setPaymentMethod(method);
                  focusSearch();
                }}
              >
                {POS_PAYMENT_METHOD_LABELS[method]}
              </Button>
            ))}
          </div>
        </div>

        {isCash && (
          <div className="hud-surface rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="cash-received">Efectivo recibido</Label>
              <span className="text-lg font-semibold">{formatCurrency(received)}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {QUICK_CASH.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setCashReceived(String(received + amount))}
                >
                  +{formatCurrency(amount)}
                </Button>
              ))}
              <Button type="button" size="xs" variant="outline" onClick={() => setCashReceived(String(total))}>
                Exacto
              </Button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1">
              {KEYPAD.map((key) => (
                <Button key={key} type="button" variant="outline" className="h-11 text-lg" onClick={() => pressKey(key)}>
                  {key}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="col-span-2 h-11"
                onClick={() => setCashReceived((prev) => prev.slice(0, -1))}
              >
                <Delete className="size-4" />
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setCashReceived('')}>
                C
              </Button>
            </div>

            <div
              className={`mt-3 flex items-baseline justify-between rounded-xl border px-3 py-3 ${
                change < 0 ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <span className="text-sm font-medium">{change < 0 ? 'Falta' : 'Vuelto'}</span>
              <span className="text-2xl font-bold">{formatCurrency(Math.abs(change))}</span>
            </div>
          </div>
        )}

        <div className="hud-surface rounded-2xl p-4">
          <Label htmlFor="customer-rut">RUT del cliente (opcional)</Label>
          <Input
            id="customer-rut"
            placeholder="Sin RUT: boleta a consumidor final"
            value={customerRut}
            onChange={(e) => setCustomerRut(e.target.value)}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && validateRut(value)) setCustomerRut(formatRut(value));
            }}
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={clearAll} disabled={cart.length === 0}>
            Cancelar
          </Button>
          <Button type="button" className="h-12 flex-1 text-base" disabled={!canCharge} onClick={handleCharge}>
            {saving ? 'Emitiendo...' : `Cobrar ${formatCurrency(total)}`}
          </Button>
        </div>

        {ticket && (
          <Button type="button" variant="outline" className="w-full" onClick={printTicket}>
            <Printer className="mr-2 size-4" /> Reimprimir boleta #{ticket.folio}
          </Button>
        )}
      </div>

      {ticket && <PosTicket data={ticket} />}
    </div>
  );
}
