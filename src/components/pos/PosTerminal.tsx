'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CloudOff, Delete, Printer, ScanBarcode, Trash2 } from 'lucide-react';
import { createIdempotencyTracker } from '@/lib/idempotency';
import { offlineCaptureBlock } from '@/lib/offline/queue-rules';
import { listOperations, onQueueChange, readSnapshot, saveOperation, saveSnapshot } from '@/lib/offline/queue-store';
import { applySaleToStock, buildOfflineSale, posCatalogKey, type OfflineSalePayload } from '@/lib/offline/pos-sale';
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
import { useConfirm } from '@/components/ui/confirm-provider';

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
  companyId: string;
  userId: string;
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
/** Espera tras un cambio en la cola antes de recargar el stock (una sincronización guarda varias veces seguidas). */
const CATALOG_REFRESH_MS = 1500;
const timeFormat = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

export default function PosTerminal(props: Props) {
  const confirm = useConfirm();
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
  const [online, setOnline] = useState(true);
  /** Hora de la copia del catálogo en uso cuando no se pudo cargar del servidor; `null` = catálogo al día. */
  const [catalogSavedAt, setCatalogSavedAt] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  // Una clave por venta: un reintento de la MISMA venta (respuesta perdida,
  // doble clic) no emite una segunda boleta. Ver `src/lib/idempotency.ts`.
  const idempotency = useRef(createIdempotencyTracker());

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

  const catalogKey = posCatalogKey(props.companyId, props.warehouseId);

  /**
   * Carga el catálogo del servidor y guarda una copia en el equipo. Sin
   * conexión usa esa copia (modo contingencia, docs/adr/0002), con el stock
   * ya descontado de lo vendido sin conexión.
   */
  const loadCatalog = useCallback(
    async (notify: boolean) => {
      try {
        const result = await listPosProductsAction(props.warehouseId);
        if (result.success) {
          setProducts(result.data);
          setCatalogSavedAt(null);
          await saveSnapshot(catalogKey, result.data).catch(() => undefined);
        } else if (notify) {
          toast.error(result.error);
        }
      } catch {
        const snapshot = await readSnapshot<PosProduct[]>(catalogKey).catch(() => null);
        if (snapshot) {
          setProducts(snapshot.data);
          setCatalogSavedAt(snapshot.savedAt);
        } else if (notify) {
          toast.error('Sin conexión y sin catálogo guardado en este equipo: no se puede vender hasta volver a conectarse');
        }
      }
    },
    [props.warehouseId, catalogKey]
  );

  useEffect(() => {
    void loadCatalog(true).then(() => {
      setLoadingProducts(false);
      focusSearch();
    });
  }, [loadCatalog, focusSearch]);

  // Al volver la conexión, y cada vez que la sincronización registra ventas
  // hechas sin conexión, el stock se recarga del servidor.
  useEffect(() => {
    setOnline(navigator.onLine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (navigator.onLine) void loadCatalog(false);
      }, CATALOG_REFRESH_MS);
    };
    const goOnline = () => {
      setOnline(true);
      refreshSoon();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = onQueueChange(refreshSoon);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, [loadCatalog]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q)
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

  function addProduct(product: PosProduct, units = 1) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + units } : line
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          netPrice: product.netPrice,
          quantity: units,
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

    // El lector entrega el código exacto (de barras, de un empaque o el SKU):
    // esa coincidencia manda sobre la búsqueda parcial, para que escanear
    // nunca agregue el producto equivocado. Un empaque agrega sus unidades.
    for (const product of products) {
      const pack = product.packagings.find((pkg) => pkg.barcode.toLowerCase() === q);
      if (pack) {
        addProduct(product, pack.factor);
        toast.success(`${pack.name}: ${pack.factor} × ${product.name}`);
        return;
      }
    }
    const exact = products.find((p) => p.barcode?.toLowerCase() === q) ?? products.find((p) => p.sku.toLowerCase() === q);
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

  async function clearAll() {
    if (cart.length > 0 && !await confirm('¿Vaciar la venta en curso?')) return;
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

  function resetSale() {
    setCart([]);
    setCashReceived('');
    setCustomerRut('');
    setQuery('');
    focusSearch();
  }

  /**
   * Modo contingencia: la venta queda en la cola del equipo y se entrega un
   * comprobante provisorio. La boleta se emite al sincronizar (decisión del
   * cliente registrada en docs/adr/0002, pendiente de validar con su contador).
   */
  async function sellOffline(payload: OfflineSalePayload, idempotencyKey: string, rut: string) {
    let block: string | null;
    try {
      block = offlineCaptureBlock(await listOperations(), props.companyId);
    } catch {
      toast.error('Este navegador no permite guardar ventas sin conexión. Vuelve a cobrar cuando vuelva la conexión.');
      return;
    }
    if (block) {
      toast.error(block);
      return;
    }

    const capturedAt = new Date();
    const operation = buildOfflineSale({
      companyId: props.companyId,
      userId: props.userId,
      shiftId: props.shiftId,
      idempotencyKey,
      payload,
      totalLabel: formatCurrency(total),
      capturedAt,
    });
    try {
      await saveOperation(operation);
    } catch {
      toast.error('No se pudo guardar la venta en este equipo. Vuelve a cobrar cuando vuelva la conexión.');
      return;
    }
    // Ya guardada: la próxima venta, aunque sea idéntica, es otra.
    idempotency.current.reset();

    setTicket({
      companyName: props.companyName,
      companyRut: props.companyRut,
      companyAddress: props.companyAddress,
      folio: null,
      provisionalNumber: operation.localNumber,
      issuedAt: capturedAt,
      cashierName: props.cashierName,
      customerName: rut ? `Cliente ${formatRut(rut)}` : 'Consumidor Final',
      customerRut: rut ? formatRut(rut) : '66.666.666-6',
      lines: computed.items.map((line) => ({
        description: line.name,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.netPrice,
        subtotal: line.subtotal,
        isExempt: line.isExempt,
      })),
      netAmount: computed.totals.netAmount,
      exemptAmount: computed.totals.exemptAmount,
      ivaAmount: computed.totals.ivaAmount,
      totalAmount: total,
      paymentMethodLabel: POS_PAYMENT_METHOD_LABELS[paymentMethod],
      cashReceived: isCash ? received : undefined,
      changeDue: isCash ? Math.max(0, received - total) : undefined,
    });

    toast.success(
      isCash && received > total
        ? `Venta guardada sin conexión (${operation.localNumber}) — Vuelto ${formatCurrency(received - total)}`
        : `Venta guardada sin conexión (${operation.localNumber})`,
      { description: 'Entrega el comprobante provisorio. La boleta se emite sola al volver la conexión.' }
    );

    const nextProducts = applySaleToStock(products, payload.items);
    setProducts(nextProducts);
    // La copia conserva la hora en que vino del servidor.
    void saveSnapshot(catalogKey, nextProducts, catalogSavedAt ?? undefined).catch(() => undefined);
    resetSale();
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
      if (!await confirm(`Stock insuficiente en: ${detail}. El sistema rechazará la venta. ¿Intentar de todos modos?`)) {
        return;
      }
    }

    const payload: OfflineSalePayload = {
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      paymentMethod,
      cashReceived: isCash ? received : undefined,
      customerRut: rut || undefined,
    };
    const idempotencyKey = idempotency.current.keyFor({ shiftId: props.shiftId, ...payload });

    setSaving(true);
    try {
      if (!navigator.onLine) {
        await sellOffline(payload, idempotencyKey, rut);
        return;
      }

      let result: Awaited<ReturnType<typeof createPosSaleAction>>;
      try {
        result = await createPosSaleAction(props.shiftId, { ...payload, idempotencyKey });
      } catch {
        // Red caída o servidor sin respuesta. Si la venta alcanzó a
        // registrarse, ni el reintento ni la cola la duplican: ambos usan la
        // misma clave.
        const offline = await confirm({
          title: 'No se pudo contactar al servidor',
          description:
            'Puedes volver a cobrar, o seguir sin conexión: la venta queda guardada en este equipo, se entrega un comprobante provisorio y la boleta se emite sola al volver la conexión.',
          confirmLabel: 'Vender sin conexión',
          cancelLabel: 'Volver a intentar',
          destructive: false,
        });
        if (offline) await sellOffline(payload, idempotencyKey, rut);
        return;
      }

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const sale = result.data;
      idempotency.current.reset();
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

      resetSale();
      // El stock cambió: se recarga para que la próxima venta valide contra el
      // saldo real y no contra el que se cargó al abrir la caja.
      void loadCatalog(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const offlineMode = !online || catalogSavedAt !== null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        {offlineMode && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning print:hidden">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">{online ? 'Sin respuesta del servidor' : 'Sin conexión'}: sigues vendiendo en modo contingencia</p>
              <p className="text-xs">
                Las ventas quedan guardadas en este equipo (hasta 2 horas) y se registran solas al volver la conexión.
                Se entrega un comprobante provisorio; la boleta electrónica se emite al sincronizar.
                {catalogSavedAt && ` Precios y stock guardados a las ${timeFormat.format(new Date(catalogSavedAt))}.`}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-card p-4">
          <Label htmlFor="pos-search" className="mb-2 flex items-center gap-2">
            <ScanBarcode className="size-4 text-muted-foreground" aria-hidden="true" /> Escanear o buscar producto
          </Label>
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
            aria-describedby="pos-search-hint"
          />
          <p id="pos-search-hint" className="mt-2 text-xs text-muted-foreground">
            {loadingProducts ? 'Cargando catálogo…' : 'El lector de código de barras agrega el producto al instante.'}
          </p>
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

        <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full min-w-[520px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-left">Producto</th>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-left">Cantidad</th>
                {/* Neto en ambas columnas: el IVA se suma una vez en el total. */}
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-right">P. unit. neto</th>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-right">Neto línea</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                    <td className="p-12 text-center text-sm text-muted-foreground" colSpan={5}>
                    <ScanBarcode className="mx-auto mb-2 size-7 text-muted-foreground/60" aria-hidden="true" />
                    Escanea o busca un producto para comenzar la venta
                  </td>
                </tr>
              )}
              {computed.items.map((line) => (
                <tr key={line.productId} className="border-t border-border transition-colors hover:bg-muted/50">
                  <td className="p-2">
                    <p className="font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.sku}</p>
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
                  <td className="p-2 text-right tabular-nums">{formatCurrency(line.netPrice)}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{formatCurrency(line.subtotal)}</td>
                  <td className="p-2">
                    <Button type="button" size="xs" variant="ghost" aria-label={`Quitar ${line.name}`} onClick={() => removeLine(line.productId)}>
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
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
          <p className="text-[11px] font-medium tracking-wide uppercase opacity-70">
            {props.cashRegisterName} · {props.warehouseName}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-sm opacity-80">Total a pagar</span>
            <span className="text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">{formatCurrency(total)}</span>
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums opacity-70">
            <span>Neto {formatCurrency(computed.totals.netAmount)}</span>
            <span>IVA {formatCurrency(computed.totals.ivaAmount)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-card p-4">
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
          <div className="rounded-2xl border border-border bg-card shadow-card p-4">
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
                change < 0 ? 'border-danger/25 bg-danger-soft text-danger' : 'border-success/25 bg-success-soft text-success'
              }`}
            >
              <span className="text-sm font-medium">{change < 0 ? 'Falta' : 'Vuelto'}</span>
              <span className="text-2xl font-bold tabular-nums" aria-live="polite">{formatCurrency(Math.abs(change))}</span>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-card p-4">
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
            {saving ? (online ? 'Emitiendo boleta…' : 'Guardando venta…') : `Cobrar ${formatCurrency(total)}${online ? '' : ' sin conexión'}`}
          </Button>
        </div>

        {ticket && (
          <Button type="button" variant="outline" className="w-full" onClick={printTicket}>
            <Printer className="mr-2 size-4" />{' '}
            {ticket.provisionalNumber ? `Reimprimir comprobante ${ticket.provisionalNumber}` : `Reimprimir boleta #${ticket.folio}`}
          </Button>
        )}
      </div>

      {ticket && <PosTicket data={ticket} />}
    </div>
  );
}
