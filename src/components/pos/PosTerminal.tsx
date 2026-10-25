'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock3, Package, Printer, RefreshCw, ScanBarcode, Settings2, Trash2, Unlock, UserRound } from 'lucide-react';
import { createIdempotencyTracker } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosTicket, { type TicketData } from './PosTicket';
import PaymentDialog from './PaymentDialog';
import RutStep from './RutStep';
import SaleDone, { type CompletedSale } from './SaleDone';
import HeldSalesDialog from './HeldSalesDialog';
import DrawerOpenDialog from './DrawerOpenDialog';
import HardwareDialog from './hardware/HardwareDialog';
import { usePosHardware } from './hardware/PosHardwareProvider';
import {
  createPosSaleAction,
  listPosProductsAction,
  lookupPosCustomerAction,
  registerDrawerOpenAction,
} from '@/modules/pos/actions/pos.actions';
import type { PosProduct, PosSaleResult } from '@/modules/pos/services/pos.service';
import { POS_PAYMENT_METHOD_LABELS, type PosPaymentMethod } from '@/modules/pos/schema';
import { computeDocument } from '@/modules/sales/calc';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import {
  addUnits,
  changeQuantity,
  countUnits,
  formatQuantity,
  normalizeQuantity,
  removeLine,
  setQuantity,
  type CartLine,
} from '@/lib/pos/cart';
import { parseCashDigits } from '@/lib/pos/cash';
import { holdSale, takeHeldSale, type HeldSale } from '@/lib/pos/held-sales';
import { heldSalesStoreFor, newHeldId } from '@/lib/pos/held-sales-store';
import { parseQuantityPrefix, resolveScan, searchProducts, type ScanResolution } from '@/lib/pos/scan';
import { playPosSound } from '@/lib/pos/sounds';
import { useConfirm } from '@/components/ui/confirm-provider';

interface Props {
  shiftId: string;
  shiftClosed?: boolean;
  /** La pestaña «Vender» está a la vista: solo entonces valen los atajos de teclado y el foco del lector. */
  active?: boolean;
  onBusyChange?: (value: boolean) => void;
  onPendingChange?: (value: boolean) => void;
  warehouseId: string;
  warehouseName: string;
  cashRegisterName: string;
  cashierName: string;
  companyName: string;
  companyRut: string;
  companyAddress: string | null;
}

interface Customer {
  rut: string | null;
  name: string | null;
  /** El paso del RUT ya se resolvió (con RUT o como consumidor final). */
  resolved: boolean;
}

const NO_CUSTOMER: Customer = { rut: null, name: null, resolved: false };
const GENERIC_RUT = '66.666.666-6';

type Resolved = Extract<ScanResolution<PosProduct>, { kind: 'product' }>;

/** Manda el ticket a la impresora del navegador aislándolo del resto de la interfaz. */
function printBrowserTicket() {
  document.documentElement.classList.add('pos-printing');
  window.print();
  document.documentElement.classList.remove('pos-printing');
}

/**
 * Terminal del cajero. El orden de una venta es el de un supermercado:
 * escanear → (al primer producto) RUT del cliente → seguir escaneando →
 * Enter/F9 → cobrar con el teclado → vuelto a la vista y cajón abierto.
 */
export default function PosTerminal(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const hardware = usePosHardware();
  const sounds = hardware.config.sounds;
  const terminalActive = props.active !== false;

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer>(NO_CUSTOMER);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  const [hardwareProblem, setHardwareProblem] = useState<string | null>(null);
  const [uncertainCharge, setUncertainCharge] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const [slip, setSlip] = useState<{ reason: string; at: Date } | null>(null);
  const [printTick, setPrintTick] = useState(0);
  const [online, setOnline] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const uncertain = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const charging = useRef(false);
  // Una clave por venta: un reintento de la MISMA venta (respuesta perdida,
  // doble clic) no emite una segunda boleta. Ver `src/lib/idempotency.ts`.
  const idempotency = useRef(createIdempotencyTracker());

  const heldStore = useMemo(() => heldSalesStoreFor(props.shiftId), [props.shiftId]);
  const held = useSyncExternalStore(heldStore.subscribe, heldStore.getSnapshot, heldStore.getServerSnapshot);

  const { onBusyChange, onPendingChange } = props;
  useEffect(() => { onPendingChange?.(saving || uncertainCharge); }, [saving, uncertainCharge, onPendingChange]);
  useEffect(() => { onBusyChange?.(saving); }, [saving, onBusyChange]);

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

  const refreshProducts = useCallback(async (showError = true) => {
    if (uncertain.current) return;
    setLoadingProducts(true);
    try {
      const result = await listPosProductsAction(props.warehouseId);
      if (!result.success) {
        setCatalogError(true);
        if (showError) toast.error(result.error);
        return;
      }
      setProducts(result.data);
      // Otra caja puede haber vendido desde que agregamos una línea. Conserva
      // el carrito, pero actualiza su referencia de stock y precio del catálogo.
      setCart((previous) => previous.map((line) => {
        const product = result.data.find((item) => item.id === line.productId);
        return product ? { ...line, stock: product.stock, netPrice: product.netPrice, grossPrice: product.grossPrice, isExempt: product.isExempt } : line;
      }));
      setCatalogError(false);
      setLastRefresh(new Date());
    } catch {
      setCatalogError(true);
      if (showError) toast.error('No se pudo actualizar el catálogo. Revisa la conexión e intenta nuevamente.');
    } finally { setLoadingProducts(false); }
  }, [props.warehouseId]);

  useEffect(() => {
    void refreshProducts().then(focusSearch);
    const onOnline = () => { setOnline(true); if (!charging.current) void refreshProducts(false); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible' && !charging.current && navigator.onLine) void refreshProducts(false); };
    setOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refreshProducts, focusSearch]);

  useEffect(() => {
    if (cart.length === 0 && held.length === 0) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [cart.length, held.length]);

  // Imprime la boleta del navegador DESPUÉS de que React la dibujó (cobro con impresión automática).
  useEffect(() => {
    if (printTick === 0) return;
    const frame = requestAnimationFrame(() => printBrowserTicket());
    return () => cancelAnimationFrame(frame);
  }, [printTick]);

  // El comprobante de apertura de cajón (modo «impresora del sistema») se imprime y se retira.
  useEffect(() => {
    if (!slip) return;
    const frame = requestAnimationFrame(() => {
      printBrowserTicket();
      setSlip(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [slip]);

  useEffect(() => {
    if (!lastAdded) return;
    document.getElementById(`pos-line-${lastAdded}`)?.scrollIntoView({ block: 'nearest' });
  }, [lastAdded, cart.length]);

  const matches = useMemo(() => searchProducts(products, query), [query, products]);

  const computed = useMemo(
    () => computeDocument(cart.map((line) => ({ ...line, unitPrice: line.netPrice }))),
    [cart],
  );

  const total = computed.totals.totalAmount;
  const units = countUnits(cart);
  const received = parseCashDigits(cashReceived);
  const isCash = paymentMethod === 'EFECTIVO';
  const rutStepOpen = cart.length > 0 && (!customer.resolved || editingCustomer);
  const canCharge = cart.length > 0 && !saving && !props.shiftClosed && online && !catalogError && !loadingProducts && (!isCash || received >= total);
  const anyDialogOpen = paymentOpen || heldOpen || drawerOpen || hardwareOpen;
  const blockedReason = !online
    ? 'Sin conexión: vuelve a conectarte para cobrar.'
    : props.shiftClosed
      ? 'Este turno está cerrado: no se puede cobrar.'
      : catalogError
        ? 'No se pudo actualizar el catálogo. Vuelve y presiona «Actualizar catálogo».'
        : loadingProducts
          ? 'Actualizando el catálogo…'
          : null;

  function resetSale() {
    setCart([]);
    setCashReceived('');
    setCustomer(NO_CUSTOMER);
    setEditingCustomer(false);
    setPaymentMethod('EFECTIVO');
    setPaymentOpen(false);
    setQuery('');
    setActiveIndex(-1);
    setLastAdded(null);
  }

  function addProduct(product: PosProduct, quantity = 1) {
    const startsSale = cart.length === 0 && !customer.resolved;
    setCart((previous) => addUnits(previous, product, quantity));
    setQuery('');
    setActiveIndex(-1);
    setCompleted(null);
    setHardwareProblem(null);
    setLastAdded(product.id);
    playPosSound('ok', sounds);
    // Al primer producto el foco pasa al RUT; desde el segundo, vuelve al lector.
    if (!startsSale) focusSearch();
  }

  function addResolved(resolution: Resolved) {
    if (resolution.via === 'packaging') toast.success(`${resolution.packName}: ${formatQuantity(resolution.units)} × ${resolution.product.name}`);
    addProduct(resolution.product, resolution.units);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Escape') {
      setQuery('');
      setActiveIndex(-1);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const text = query.trim();
    // Enter con el buscador vacío y una venta en curso = ir a cobrar.
    if (!text) {
      if (cart.length > 0) openPayment();
      return;
    }
    const prefix = parseQuantityPrefix(text);
    const picked = activeIndex >= 0 ? matches[activeIndex] : undefined;
    if (picked && !prefix.invalid) {
      addProduct(picked, prefix.units);
      return;
    }
    // El lector entrega el código exacto (de barras, de un empaque o el SKU):
    // esa coincidencia manda sobre la búsqueda parcial, para que escanear
    // nunca agregue el producto equivocado. Un empaque agrega sus unidades.
    const resolution = resolveScan(products, text, matches);
    if (resolution.kind === 'none') {
      playPosSound('error', sounds);
      toast.error(resolution.invalidPrefix ? 'Cantidad inválida. Escribe, por ejemplo, 3*código' : `Sin resultados para "${prefix.code || text}"`);
      return;
    }
    addResolved(resolution);
  }

  function confirmRut(rut: string) {
    setCustomer({ rut, name: null, resolved: true });
    setEditingCustomer(false);
    focusSearch();
    void lookupPosCustomerAction(rut).then((result) => {
      if (result.success && result.data.name) {
        const name = result.data.name;
        setCustomer((current) => (current.rut === rut ? { ...current, name } : current));
      }
    }).catch(() => undefined);
  }

  function chooseConsumerFinal() {
    setCustomer({ rut: null, name: null, resolved: true });
    setEditingCustomer(false);
    focusSearch();
  }

  function editCustomer() {
    if (cart.length === 0) {
      toast.info('El RUT se pide al escanear el primer producto.');
      return;
    }
    setEditingCustomer(true);
  }

  function handleChangeQuantity(productId: string, delta: number) {
    setCart((previous) => changeQuantity(previous, productId, delta));
    focusSearch();
  }

  function commitQuantity(input: HTMLInputElement, line: CartLine) {
    const typed = Number(input.value.trim().replace(',', '.'));
    if (typed === 0 && input.value.trim() !== '') {
      setCart((previous) => removeLine(previous, line.productId));
    } else {
      const quantity = normalizeQuantity(typed);
      if (quantity === null) {
        input.value = formatQuantity(line.quantity);
        toast.error('Cantidad inválida');
      } else {
        setCart((previous) => setQuantity(previous, line.productId, quantity));
      }
    }
    focusSearch();
  }

  async function clearAll() {
    if (cart.length > 0 && !await confirm('¿Vaciar la venta en curso?')) return;
    resetSale();
    focusSearch();
  }

  function openPayment() {
    if (cart.length === 0 || saving || uncertainCharge || props.shiftClosed) return;
    if (rutStepOpen) {
      playPosSound('error', sounds);
      toast.info('Primero el RUT del cliente: escríbelo o presiona Enter para consumidor final.');
      return;
    }
    setPaymentOpen(true);
  }

  function closePayment() {
    if (saving) return;
    setPaymentOpen(false);
    focusSearch();
  }

  function ticketFor(sale: PosSaleResult): TicketData {
    const rut = customer.rut;
    return {
      companyName: props.companyName,
      companyRut: props.companyRut,
      companyAddress: props.companyAddress,
      folio: sale.folio,
      issuedAt: new Date(sale.issueDate),
      cashierName: props.cashierName,
      customerName: rut ? (customer.name ?? `Cliente ${formatRut(rut)}`) : 'Consumidor Final',
      customerRut: rut ? formatRut(rut) : GENERIC_RUT,
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
    };
  }

  /**
   * Cajón y boleta DESPUÉS del cobro. La venta ya está emitida y cobrada: un
   * cajón desconectado o sin papel solo se informa, jamás deshace ni frena nada.
   */
  async function afterSaleHardware(data: TicketData, cashSale: boolean) {
    const { config, direct } = hardware;
    const openDrawer = cashSale && config.openOnCashSale;
    if (direct) {
      const result = config.printAfterSale
        ? await hardware.printTicket(data, { openDrawer })
        : openDrawer ? await hardware.openDrawer() : ({ ok: true } as const);
      if (!result.ok) {
        playPosSound('error', sounds);
        setHardwareProblem(`La venta ya quedó cobrada y emitida, pero no se pudo ${config.printAfterSale ? 'imprimir la boleta' : 'abrir el cajón'}: ${result.error}`);
      }
    } else if (config.mode === 'system' && config.printAfterSale) {
      setPrintTick((tick) => tick + 1);
    }
  }

  async function handleCharge() {
    if (cart.length === 0 || charging.current || !online || (props.shiftClosed && !uncertain.current)) return;
    charging.current = true;

    const lowStock = cart.filter((line) => line.isTrackable && line.quantity > line.stock);
    if (lowStock.length > 0) {
      const detail = lowStock.map((l) => `${l.sku} (disponible ${formatQuantity(l.stock)})`).join(', ');
      if (!await confirm(`Stock insuficiente en: ${detail}. El sistema rechazará la venta. ¿Intentar de todos modos?`)) {
        charging.current = false;
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod,
        cashReceived: isCash ? received : undefined,
        customerRut: customer.rut ?? undefined,
      };
      const result = await createPosSaleAction(props.shiftId, {
        ...payload,
        idempotencyKey: idempotency.current.keyFor({ shiftId: props.shiftId, ...payload }),
      });

      if (!result.success) {
        uncertain.current = false;
        setUncertainCharge(false);
        playPosSound('error', sounds);
        toast.error(result.error);
        return;
      }

      uncertain.current = false;
      setUncertainCharge(false);
      const sale = result.data;
      idempotency.current.reset();
      const data = ticketFor(sale);
      setTicket(data);
      setCompleted({
        folio: sale.folio,
        total: sale.totalAmount,
        methodLabel: POS_PAYMENT_METHOD_LABELS[paymentMethod],
        isCash,
        received,
        change: isCash ? sale.changeDue : 0,
      });
      setHardwareProblem(null);
      playPosSound('done', sounds);
      resetSale();
      void afterSaleHardware(data, isCash);
      // El stock cambió: se recarga para que la próxima venta valide contra el
      // saldo real y no contra el que se cargó al abrir la caja.
      void refreshProducts(false);
      router.refresh();
      focusSearch();
    } catch {
      // Red caída: el carrito se conserva y el reintento usa la misma clave,
      // así que si la venta alcanzó a registrarse no se duplica.
      uncertain.current = true;
      setUncertainCharge(true);
      setPaymentOpen(false);
      toast.error('No se pudo confirmar el cobro. Reintenta esta misma venta sin modificarla para recuperar el resultado sin duplicarla.');
    } finally {
      charging.current = false;
      setSaving(false);
    }
  }

  // --- Ventas en espera ----------------------------------------------------

  function currentAsHeld(): HeldSale {
    return { id: newHeldId(), heldAt: Date.now(), customerRut: customer.rut, customerName: customer.name, rutResolved: customer.resolved, lines: cart };
  }

  function handleHold() {
    if (cart.length === 0) {
      if (held.length > 0) setHeldOpen(true);
      return;
    }
    const result = holdSale(held, currentAsHeld());
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    heldStore.set(result.list);
    resetSale();
    toast.success('Venta en espera. Atiende al siguiente cliente.');
    focusSearch();
  }

  function resumeHeld(id: string) {
    const { sale, list } = takeHeldSale(held, id);
    if (!sale) return;
    let next = list;
    if (cart.length > 0) {
      const swapped = holdSale(list, currentAsHeld());
      if (!swapped.ok) {
        toast.error(swapped.error);
        return;
      }
      next = swapped.list;
    }
    heldStore.set(next);
    setCart(sale.lines);
    setCustomer({ rut: sale.customerRut, name: sale.customerName, resolved: sale.rutResolved });
    setEditingCustomer(false);
    setCompleted(null);
    setHeldOpen(false);
    // Los precios y el stock pueden haber cambiado mientras esperaba.
    void refreshProducts(false);
    focusSearch();
  }

  function discardHeld(id: string) {
    heldStore.set(takeHeldSale(held, id).list);
  }

  // --- Cajón ---------------------------------------------------------------

  /** Abre el cajón SIN venta: primero queda registrado, después se manda el pulso. */
  async function openDrawerAudited(reason: string): Promise<boolean> {
    setDrawerBusy(true);
    try {
      const audit = await registerDrawerOpenAction(props.shiftId, { reason });
      if (!audit.success) {
        toast.error(audit.error);
        return false;
      }
      if (hardware.direct) {
        const result = await hardware.openDrawer();
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success('Cajón abierto');
      } else {
        // Con la impresora del sistema el cajón solo se abre al imprimir: sale un comprobante de apertura.
        setSlip({ reason, at: new Date() });
        toast.success('Comprobante de apertura enviado a la impresora');
      }
      return true;
    } catch {
      toast.error('No se pudo registrar la apertura del cajón. Revisa la conexión.');
      return false;
    } finally {
      setDrawerBusy(false);
    }
  }

  function handleDrawerButton() {
    if (hardware.config.mode === 'none') {
      toast.info('Primero indica cómo está conectado el cajón.');
      setHardwareOpen(true);
      return;
    }
    setDrawerOpen(true);
  }

  async function confirmDrawerOpen(reason: string) {
    if (await openDrawerAudited(reason)) {
      setDrawerOpen(false);
      focusSearch();
    }
  }

  // --- Atajos de teclado ---------------------------------------------------

  function openHeldList() {
    setHeldOpen(true);
  }

  // Las últimas versiones de los manejadores: el escucha del teclado no se vuelve a montar en cada render.
  const latestActions = useRef<Record<string, () => void>>({});
  useEffect(() => {
    latestActions.current = { F4: editCustomer, F6: handleHold, F7: openHeldList, F8: handleDrawerButton, F9: openPayment };
  });

  useEffect(() => {
    if (!terminalActive || anyDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const action = latestActions.current[event.key];
      if (action) {
        event.preventDefault();
        action();
        return;
      }
      // Un código del lector con el foco fuera del buscador: se redirige para no perderlo.
      const target = event.target as HTMLElement | null;
      const editable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (!editable && !rutStepOpen && event.key.length === 1 && /[\w*]/.test(event.key)) searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [terminalActive, anyDialogOpen, rutStepOpen]);

  const customerLabel = customer.rut
    ? `${customer.name ? `${customer.name} · ` : ''}${customer.rut}`
    : customer.resolved ? 'Consumidor final' : 'Sin definir';
  const hardwareLabel = hardware.config.mode === 'none' ? 'Sin cajón' : hardware.direct ? 'Cajón directo' : 'Impresora del sistema';

  return (
    <div className="space-y-3">
      {!online && <p role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">Sin conexión. Conservamos la venta en esta pantalla; vuelve a conectarte para confirmar el cobro en el ERP.</p>}
      {catalogError && online && <p role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">No se pudo actualizar el catálogo. Presiona "Actualizar catálogo" para continuar.</p>}
      {uncertainCharge && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
        <p>El cobro está pendiente de confirmación. Conservamos la misma venta y su clave: no cierres la app ni registres otra venta hasta recuperar el resultado.</p>
        <Button type="button" disabled={saving || !online} onClick={handleCharge}>{saving ? 'Consultando…' : 'Confirmar el mismo cobro'}</Button>
      </div>}
      <fieldset disabled={saving || props.shiftClosed || uncertainCharge} className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl border border-border bg-card shadow-card p-4">
          <Label htmlFor="pos-search" className="mb-2 flex items-center gap-2">
            <ScanBarcode className="size-4 text-muted-foreground" aria-hidden="true" /> Escanear o buscar producto
          </Label>
          <Input
            id="pos-search"
            ref={searchRef}
            autoFocus={terminalActive}
            autoComplete="off"
            placeholder="Código de barras, SKU o nombre — Enter para agregar"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); }}
            onKeyDown={handleSearchKeyDown}
            className="h-14 text-xl"
            aria-describedby="pos-search-hint"
            aria-controls={matches.length > 0 ? 'pos-search-results' : undefined}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p id="pos-search-hint" className="text-xs text-muted-foreground">
              {loadingProducts ? 'Actualizando catálogo…' : lastRefresh ? `Stock consultado a las ${lastRefresh.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false })}. Para varias unidades escribe 3* y escanea. Enter sin texto = cobrar.` : 'El lector de código de barras agrega el producto al instante.'}
            </p>
            <Button type="button" variant="ghost" size="xs" onClick={() => void refreshProducts()} disabled={loadingProducts || !online}>
              <RefreshCw className={`mr-1 size-3 ${loadingProducts ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar catálogo
            </Button>
          </div>
          {matches.length > 0 && (
            <ul id="pos-search-results" className="mt-2 divide-y divide-border rounded-lg border border-border">
              {matches.map((product, index) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(product, parseQuantityPrefix(query).units)}
                    aria-current={index === activeIndex ? 'true' : undefined}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 text-left text-sm transition-colors last:border-0 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${index === activeIndex ? 'bg-accent' : ''}`}
                  >
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{product.sku}</span> — {product.name}
                    </span>
                    <span className="flex items-center gap-3 text-muted-foreground">
                      <span className={product.isTrackable && product.stock <= 0 ? 'text-destructive' : ''}>
                        Stock {formatQuantity(product.stock)}
                      </span>
                      <span className="font-medium text-foreground">{formatCurrency(product.grossPrice)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Acciones del mostrador">
          <Button type="button" variant="outline" size="sm" onClick={handleHold} disabled={cart.length === 0}>
            <Clock3 className="mr-1.5 size-4" aria-hidden="true" /> Poner en espera <kbd className="ml-2 text-[10px] opacity-60">F6</kbd>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openHeldList}>
            En espera ({held.length}) <kbd className="ml-2 text-[10px] opacity-60">F7</kbd>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDrawerButton}>
            <Unlock className="mr-1.5 size-4" aria-hidden="true" /> Abrir cajón <kbd className="ml-2 text-[10px] opacity-60">F8</kbd>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setHardwareOpen(true)}>
            <Settings2 className="mr-1.5 size-4" aria-hidden="true" /> Cajón e impresora · {hardwareLabel}
          </Button>
        </div>

        {completed && (
          <SaleDone
            sale={completed}
            hardwareProblem={hardwareProblem}
            canOpenDrawer={hardware.direct}
            onOpenDrawer={() => void openDrawerAudited(`Reintento tras la boleta #${completed.folio ?? ''}`.trim())}
            onPrint={() => {
              if (!ticket) return;
              if (hardware.direct) {
                void hardware.printTicket(ticket, { openDrawer: false }).then((result) => { if (!result.ok) toast.error(result.error); });
              } else printBrowserTicket();
            }}
            onNewSale={() => { setCompleted(null); setHardwareProblem(null); focusSearch(); }}
          />
        )}

        {rutStepOpen && (
          <RutStep
            products={products}
            initialRut={editingCustomer ? customer.rut : null}
            editing={editingCustomer}
            onConfirm={confirmRut}
            onConsumerFinal={chooseConsumerFinal}
            onProduct={addResolved}
            onCancel={() => { setEditingCustomer(false); focusSearch(); }}
          />
        )}

        <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full min-w-[560px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-left">Producto</th>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-left">Cantidad</th>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-right">Precio c/IVA</th>
                <th className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase p-3 text-right">Total</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                  <td className="p-12 text-center text-sm text-muted-foreground" colSpan={5}>
                    <Package className="mx-auto mb-2 size-7 text-muted-foreground/60" aria-hidden="true" />
                    Escanea o busca un producto para comenzar la venta
                  </td>
                </tr>
              )}
              {computed.items.map((line) => (
                <tr
                  key={line.productId}
                  id={`pos-line-${line.productId}`}
                  className={`border-t border-border transition-colors hover:bg-muted/50 ${line.productId === lastAdded ? 'bg-accent/60' : ''}`}
                >
                  <td className="p-2">
                    <p className="text-base font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.sku}{line.isExempt ? ' · exento' : ''}</p>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" aria-label={`Quitar una unidad de ${line.name}`} onClick={() => handleChangeQuantity(line.productId, -1)}>
                        −
                      </Button>
                      <input
                        key={`${line.productId}:${line.quantity}`}
                        defaultValue={formatQuantity(line.quantity)}
                        aria-label={`Cantidad de ${line.name}`}
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-8 w-16 rounded-lg border border-input bg-muted text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={(event) => commitQuantity(event.currentTarget, line)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                      />
                      <Button type="button" size="sm" variant="outline" aria-label={`Agregar una unidad de ${line.name}`} onClick={() => handleChangeQuantity(line.productId, 1)}>
                        +
                      </Button>
                    </div>
                    {line.isTrackable && line.quantity > line.stock && (
                      <p className="mt-1 text-xs text-destructive">Sobre stock ({formatQuantity(line.stock)})</p>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.grossPrice)}</td>
                  <td className="p-2 text-right text-base font-semibold tabular-nums">{formatCurrency(line.total)}</td>
                  <td className="p-2">
                    <Button type="button" size="xs" variant="ghost" aria-label={`Quitar ${line.name}`} onClick={() => { setCart((previous) => removeLine(previous, line.productId)); focusSearch(); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
          <p className="text-[11px] font-medium tracking-wide uppercase opacity-70">
            {props.cashRegisterName} · {props.warehouseName}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-sm opacity-80">Total a pagar</span>
            <span className="text-5xl font-semibold tracking-tight tabular-nums" aria-live="polite">{formatCurrency(total)}</span>
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums opacity-70">
            <span>{formatQuantity(units)} {units === 1 ? 'unidad' : 'unidades'}</span>
            <span>Neto {formatCurrency(computed.totals.netAmount)} · IVA {formatCurrency(computed.totals.ivaAmount)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-card">
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Cliente</p>
              <p className="truncate text-sm font-medium" data-testid="pos-customer">{customerLabel}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={editCustomer} disabled={cart.length === 0}>
            Cambiar <kbd className="ml-2 text-[10px] opacity-60">F4</kbd>
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-3 shadow-card">
          <Button type="button" className="h-16 w-full text-xl" disabled={cart.length === 0 || saving || props.shiftClosed} onClick={openPayment}>
            Cobrar {formatCurrency(total)} <kbd className="ml-3 rounded border border-primary-foreground/40 px-1.5 text-[10px]">F9</kbd>
          </Button>
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={clearAll} disabled={cart.length === 0}>
            Cancelar venta
          </Button>
        </div>

        {ticket && !completed && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              if (hardware.direct) void hardware.printTicket(ticket, { openDrawer: false }).then((result) => { if (!result.ok) toast.error(result.error); });
              else printBrowserTicket();
            }}
          >
            <Printer className="mr-2 size-4" /> Reimprimir boleta #{ticket.folio}
          </Button>
        )}
      </div>

      </fieldset>

      <PaymentDialog
        open={paymentOpen}
        total={total}
        itemCount={formatQuantity(units)}
        method={paymentMethod}
        onMethodChange={setPaymentMethod}
        cashReceived={cashReceived}
        onCashChange={setCashReceived}
        saving={saving}
        canCharge={canCharge}
        blockedReason={blockedReason}
        onCharge={() => void handleCharge()}
        onClose={closePayment}
      />
      <HeldSalesDialog
        open={heldOpen}
        held={held}
        currentHasItems={cart.length > 0}
        onResume={resumeHeld}
        onDiscard={discardHeld}
        onClose={() => { setHeldOpen(false); focusSearch(); }}
      />
      <DrawerOpenDialog open={drawerOpen} busy={drawerBusy} onConfirm={(reason) => void confirmDrawerOpen(reason)} onClose={() => { setDrawerOpen(false); focusSearch(); }} />
      <HardwareDialog open={hardwareOpen} onClose={() => { setHardwareOpen(false); focusSearch(); }} />
      {slip ? (
        <div className="pos-ticket hidden print:block">
          <div className="ticket-center">
            <p className="ticket-strong">APERTURA DE CAJÓN</p>
            <p>Sin venta</p>
          </div>
          <div className="ticket-divider" />
          <p>Caja: {props.cashRegisterName}</p>
          <p>Cajero: {props.cashierName}</p>
          <p>Fecha: {slip.at.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
          <p>Motivo: {slip.reason}</p>
        </div>
      ) : ticket && <PosTicket data={ticket} />}
    </div>
  );
}
