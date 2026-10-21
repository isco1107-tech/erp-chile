'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Delete,
  Eye,
  FileText,
  Hash,
  PauseCircle,
  PlayCircle,
  Printer,
  Scale,
  ScanBarcode,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { createIdempotencyTracker } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-provider';
import { CameraScanner } from '@/components/inventory/mobile/CameraScanner';
import PosTicket, { type TicketData } from './PosTicket';
import {
  createPosSaleAction,
  getPosFolioAvailabilityAction,
  listPosProductsAction,
  lookupPosCustomerAction,
} from '@/modules/pos/actions/pos.actions';
import type { PosPriceTier, PosProduct } from '@/modules/pos/services/pos.service';
import type { FolioAvailability } from '@/modules/dte/services/caf.service';
import {
  POS_DTE_SHORT_LABELS,
  POS_DTE_TYPES,
  POS_PAYMENT_METHODS,
  POS_PAYMENT_METHOD_LABELS,
  type PosDteType,
  type PosPaymentMethod,
} from '@/modules/pos/schema';
import {
  computeCashRoundingDiff,
  matchScaleBarcodeToProduct,
  parseScaleBarcode,
  parseScannerInput,
  roundCashChile,
} from '@/modules/pos/calc';
import { computeDocument } from '@/modules/sales/calc';
import { resolveUnitPrice } from '@/modules/sales/pricing';
import { calculateTotal, formatCurrency } from '@/lib/chile/tax';
import { formatRut, validateRut } from '@/lib/chile/rut';

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  baseNetPrice: number;
  baseGrossPrice: number;
  priceTiers: PosPriceTier[];
  quantity: number;
  discountPercent: number;
  stock: number;
  isTrackable: boolean;
  isExempt: boolean;
  nextExpiryDate: string | null;
}

interface HeldCart {
  id: string;
  label: string;
  createdAt: string;
  cart: CartLine[];
  customerRut: string;
  customerName: string;
  dteType: PosDteType;
}

interface LastScannedBanner {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unitGrossPrice: number;
  lineGrossTotal: number;
  badge?: string;
}

interface Props {
  shiftId: string;
  warehouseId: string;
  warehouseName: string;
  cashRegisterName: string;
  cashierName: string;
  companyName: string;
  companyRut: string;
  companyGiro?: string | null;
  companyAddress: string | null;
  onSaleCompleted?: () => void;
}

const KEYPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '000'];
const QUICK_CASH = [1000, 2000, 5000, 10000, 20000];

function isWeighableUnit(unit: string): boolean {
  const normalized = unit.trim().toUpperCase();
  return normalized === 'KG' || normalized === 'KILO' || normalized === 'LT' || normalized === 'LITRO' || normalized === 'GR';
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

function isExpiredOrSoon(isoDate: string | null): { status: 'expired' | 'soon' | 'ok'; label: string } {
  if (!isoDate) return { status: 'ok', label: '' };
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate < today) return { status: 'expired', label: `Vencido (${isoDate})` };
  const diffDays = Math.ceil((new Date(`${isoDate}T12:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (diffDays <= 7) return { status: 'soon', label: `Vence en ${diffDays}d (${isoDate})` };
  return { status: 'ok', label: `Vence ${isoDate}` };
}

export default function PosTerminal(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [folios, setFolios] = useState<FolioAvailability[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState('');
  const [activeMultiplier, setActiveMultiplier] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showCatalogGrid, setShowCatalogGrid] = useState(true);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastScanned, setLastScanned] = useState<LastScannedBanner | null>(null);

  const [dteType, setDteType] = useState<PosDteType>('BOLETA_39');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');

  // Datos del receptor (Boleta nominativa o Factura 33 / 34)
  const [customerRut, setCustomerRut] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerGiro, setCustomerGiro] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerComuna, setCustomerComuna] = useState('');
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);

  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [autoPrint, setAutoPrint] = useState<boolean>(true);

  // Modales operativos de supermercado
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [priceCheckQuery, setPriceCheckQuery] = useState('');
  const [priceCheckProduct, setPriceCheckProduct] = useState<PosProduct | null>(null);

  // Modal de balanza / pesaje manual (por gramos, kilos o monto en pesos "$1.500 de pan")
  const [scaleModalProduct, setScaleModalProduct] = useState<PosProduct | null>(null);
  const [scaleMode, setScaleMode] = useState<'WEIGHT_GRAMS' | 'WEIGHT_KG' | 'AMOUNT_CLP'>('WEIGHT_GRAMS');
  const [scaleInput, setScaleInput] = useState('');

  // Ventas en espera (Hold / Recall)
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const idempotency = useRef(createIdempotencyTracker());
  const heldStorageKey = `aether_pos_held_${props.shiftId}`;

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const refreshCatalogAndFolios = useCallback(() => {
    Promise.all([
      listPosProductsAction(props.warehouseId),
      getPosFolioAvailabilityAction(),
    ]).then(([prodRes, folioRes]) => {
      if (prodRes.success) setProducts(prodRes.data);
      else toast.error(prodRes.error);
      if (folioRes.success) setFolios(folioRes.data);
      setLoadingProducts(false);
    });
  }, [props.warehouseId]);

  useEffect(() => {
    refreshCatalogAndFolios();
    focusSearch();
  }, [refreshCatalogAndFolios, focusSearch]);

  // Cargar ventas en espera y preferencia de auto-impresión desde localStorage
  useEffect(() => {
    try {
      const rawHeld = window.localStorage.getItem(heldStorageKey);
      if (rawHeld) {
        const parsed = JSON.parse(rawHeld) as HeldCart[];
        if (Array.isArray(parsed)) setHeldCarts(parsed);
      }
      const savedAutoPrint = window.localStorage.getItem('aether_pos_autoprint');
      if (savedAutoPrint !== null) setAutoPrint(savedAutoPrint === '1');
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }, [heldStorageKey]);

  function saveHeldCarts(next: HeldCart[]) {
    setHeldCarts(next);
    try {
      window.localStorage.setItem(heldStorageKey, JSON.stringify(next));
    } catch {
      // Ignorar errores de cuota
    }
  }

  function toggleAutoPrint() {
    setAutoPrint((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('aether_pos_autoprint', next ? '1' : '0');
      } catch {
        // Ignorar
      }
      return next;
    });
  }

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const p of products) {
      if (p.categoryName) names.add(p.categoryName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const gridProducts = useMemo(() => {
    if (selectedCategory === 'WEIGHABLE') {
      return products.filter((p) => isWeighableUnit(p.unit)).slice(0, 24);
    }
    if (selectedCategory === 'WHOLESALE') {
      return products.filter((p) => p.priceTiers.length > 0).slice(0, 24);
    }
    if (selectedCategory !== 'ALL') {
      return products.filter((p) => p.categoryName === selectedCategory).slice(0, 24);
    }
    return products.slice(0, 24);
  }, [products, selectedCategory]);

  const matches = useMemo(() => {
    const parsed = parseScannerInput(query);
    const q = parsed.code.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase() === q ||
          p.brand?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, products]);

  // Recalcular precios por tramo mayorista según la cantidad actual de cada línea
  const computed = useMemo(() => {
    const docLines = cart.map((line) => {
      const effectiveNetPrice = resolveUnitPrice(line.baseNetPrice, line.priceTiers, line.quantity);
      const activeTier = line.priceTiers
        .filter((t) => t.minQuantity <= line.quantity)
        .sort((a, b) => b.minQuantity - a.minQuantity)[0];
      return {
        ...line,
        unitPrice: effectiveNetPrice,
        effectiveGrossUnitPrice: line.isExempt ? effectiveNetPrice : calculateTotal(effectiveNetPrice),
        activeTierMinQty: activeTier?.minQuantity ?? null,
      };
    });
    return computeDocument(docLines);
  }, [cart]);

  const total = computed.totals.totalAmount;
  const isCash = paymentMethod === 'EFECTIVO';
  const cashRoundedTotal = isCash ? roundCashChile(total) : total;
  const cashRoundingDiff = isCash ? computeCashRoundingDiff(total) : 0;
  const received = Number(cashReceived) || 0;
  const change = received - cashRoundedTotal;
  const isFactura = dteType === 'FACTURA_33' || dteType === 'FACTURA_EXENTA_34';
  const isExemptDte = dteType === 'BOLETA_EXENTA_41' || dteType === 'FACTURA_EXENTA_34';
  const hasTaxableItemsInExemptDte = isExemptDte && computed.totals.netAmount > 0;

  const canCharge =
    cart.length > 0 &&
    !saving &&
    !hasTaxableItemsInExemptDte &&
    (!isCash || received >= cashRoundedTotal) &&
    (!isFactura || (customerRut.trim().length > 0 && validateRut(customerRut.trim())));

  const currentDteFolios = useMemo(
    () => folios.find((f) => f.dteType === dteType) ?? null,
    [folios, dteType]
  );

  const addProduct = useCallback(
    (product: PosProduct, rawUnits?: number, badge?: string) => {
      const units = rawUnits ?? activeMultiplier ?? 1;
      const roundedUnits = Math.round(units * 1000) / 1000;
      if (roundedUnits <= 0) return;

      setCart((prev) => {
        const existing = prev.find((line) => line.productId === product.id);
        const nextQty = existing ? Math.round((existing.quantity + roundedUnits) * 1000) / 1000 : roundedUnits;
        const effectiveNet = resolveUnitPrice(product.netPrice, product.priceTiers, nextQty);
        const unitGross = product.isExempt ? effectiveNet : calculateTotal(effectiveNet);

        setLastScanned({
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          quantity: roundedUnits,
          unitGrossPrice: unitGross,
          lineGrossTotal: Math.round(unitGross * nextQty),
          badge,
        });

        if (existing) {
          return prev.map((line) =>
            line.productId === product.id ? { ...line, quantity: nextQty } : line
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            baseNetPrice: product.netPrice,
            baseGrossPrice: product.grossPrice,
            priceTiers: product.priceTiers,
            quantity: roundedUnits,
            discountPercent: 0,
            stock: product.stock,
            isTrackable: product.isTrackable,
            isExempt: product.isExempt,
            nextExpiryDate: product.nextExpiryDate,
          },
        ];
      });

      setActiveMultiplier(null);
      setQuery('');
      focusSearch();
    },
    [activeMultiplier, focusSearch]
  );

  /**
   * Procesa un código escaneado o escrito (EAN-13 estándar, empaque/caja,
   * etiqueta de balanza EAN-13 prefijo 20-29, o multiplicador `N*codigo`).
   */
  const processScannedOrTypedInput = useCallback(
    (rawInput: string) => {
      const parsed = parseScannerInput(rawInput);

      // Solo multiplicador ej. "12*" + Enter: fija multiplicador para el próximo escaneo
      if (parsed.multiplier !== null && !parsed.code) {
        setActiveMultiplier(parsed.multiplier);
        setQuery('');
        toast.info(`Multiplicador activo: × ${formatQty(parsed.multiplier)}`);
        focusSearch();
        return;
      }

      const code = parsed.code.trim();
      if (!code) return;
      const lower = code.toLowerCase();
      const mult = parsed.multiplier ?? activeMultiplier ?? 1;

      // 1. Etiqueta de balanza de supermercado (EAN-13 prefijos 20..29)
      const scaleReading = parseScaleBarcode(code);
      if (scaleReading) {
        const matchedProduct = matchScaleBarcodeToProduct(scaleReading, products);
        if (matchedProduct) {
          if (scaleReading.mode === 'WEIGHT' && scaleReading.weightKg !== null) {
            const totalKg = Math.round(scaleReading.weightKg * mult * 1000) / 1000;
            addProduct(matchedProduct, totalKg, `Balanza ${formatQty(totalKg)} kg`);
            toast.success(`Balanza: ${formatQty(totalKg)} kg × ${matchedProduct.name}`);
            return;
          }
          if (scaleReading.mode === 'PRICE' && scaleReading.totalPriceClp !== null) {
            const targetClp = scaleReading.totalPriceClp * mult;
            const computedQty =
              matchedProduct.grossPrice > 0
                ? Math.max(0.001, Math.round((targetClp / matchedProduct.grossPrice) * 1000) / 1000)
                : 1;
            addProduct(matchedProduct, computedQty, `Balanza ${formatCurrency(targetClp)}`);
            toast.success(`Balanza: ${formatCurrency(targetClp)} (${formatQty(computedQty)} ${matchedProduct.unit}) — ${matchedProduct.name}`);
            return;
          }
        }
      }

      // 2. Código de barras de empaque (Display, Caja, Sixpack)
      for (const product of products) {
        const pack = product.packagings.find((pkg) => pkg.barcode.toLowerCase() === lower);
        if (pack) {
          const totalUnits = pack.factor * mult;
          addProduct(product, totalUnits, `${pack.name} (×${pack.factor})`);
          toast.success(`${pack.name}: ${totalUnits} × ${product.name}`);
          return;
        }
      }

      // 3. Código de barras exacto o SKU exacto o primera coincidencia
      const exact =
        products.find((p) => p.barcode?.toLowerCase() === lower) ??
        products.find((p) => p.sku.toLowerCase() === lower);
      const chosen = exact ?? matches[0];
      if (!chosen) {
        toast.error(`Sin resultados para "${code}"`);
        return;
      }
      addProduct(chosen, mult, mult !== 1 ? `× ${formatQty(mult)}` : undefined);
    },
    [activeMultiplier, addProduct, focusSearch, matches, products]
  );

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    processScannedOrTypedInput(query);
  }

  function handleTileClick(product: PosProduct) {
    if (isWeighableUnit(product.unit) && activeMultiplier === null) {
      setScaleModalProduct(product);
      setScaleMode('WEIGHT_GRAMS');
      setScaleInput('');
      return;
    }
    addProduct(product);
  }

  function confirmScaleModal() {
    if (!scaleModalProduct) return;
    const rawVal = Number(scaleInput.replace(',', '.'));
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      toast.error('Ingresa un peso o monto mayor a cero');
      return;
    }

    let qty = 1;
    let badge = '';
    if (scaleMode === 'WEIGHT_GRAMS') {
      qty = Math.round((rawVal / 1000) * 1000) / 1000;
      badge = `${Math.round(rawVal)} g`;
    } else if (scaleMode === 'WEIGHT_KG') {
      qty = Math.round(rawVal * 1000) / 1000;
      badge = `${formatQty(qty)} ${scaleModalProduct.unit}`;
    } else {
      // Monto en CLP (ej. "$1.500 de pan")
      if (scaleModalProduct.grossPrice <= 0) {
        toast.error('El producto no tiene precio unitario configurado');
        return;
      }
      qty = Math.max(0.001, Math.round((rawVal / scaleModalProduct.grossPrice) * 1000) / 1000);
      badge = `${formatCurrency(Math.round(rawVal))} (${formatQty(qty)} ${scaleModalProduct.unit})`;
    }

    addProduct(scaleModalProduct, qty, badge);
    setScaleModalProduct(null);
    setScaleInput('');
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          const step = isWeighableUnit(line.unit) && !Number.isInteger(line.quantity) ? 0.1 : 1;
          const next = Math.round((line.quantity + delta * step) * 1000) / 1000;
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0)
    );
    focusSearch();
  }

  function setLineQuantity(productId: string, rawValue: string) {
    const num = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return;
    const rounded = Math.round(num * 1000) / 1000;
    setCart((prev) =>
      prev.map((line) => (line.productId === productId ? { ...line, quantity: rounded } : line))
    );
  }

  function setLineDiscount(productId: string, rawValue: string) {
    const num = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(num)) return;
    const clamped = Math.max(0, Math.min(100, Math.round(num * 10) / 10));
    setCart((prev) =>
      prev.map((line) => (line.productId === productId ? { ...line, discountPercent: clamped } : line))
    );
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
    if (cart.length > 0 && !(await confirm('¿Vaciar la venta en curso?'))) return;
    setCart([]);
    setLastScanned(null);
    setCashReceived('');
    setCustomerRut('');
    setCustomerName('');
    setCustomerGiro('');
    setCustomerAddress('');
    setCustomerComuna('');
    setActiveMultiplier(null);
    setQuery('');
    focusSearch();
  }

  function holdCurrentSale() {
    if (cart.length === 0) {
      setShowHeldModal(true);
      return;
    }
    const newHeld: HeldCart = {
      id: `${Date.now()}`,
      label: customerName || (customerRut ? `Cliente ${customerRut}` : `Venta #${heldCarts.length + 1} (${cart.length} ítems)`),
      createdAt: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      cart,
      customerRut,
      customerName,
      dteType,
    };
    saveHeldCarts([newHeld, ...heldCarts]);
    setCart([]);
    setLastScanned(null);
    setCashReceived('');
    setCustomerRut('');
    setCustomerName('');
    setCustomerGiro('');
    setCustomerAddress('');
    setCustomerComuna('');
    toast.success('Venta dejada en espera (F4 para recuperar)');
    focusSearch();
  }

  function recallHeldSale(held: HeldCart) {
    if (cart.length > 0) {
      toast.error('Termina o pon en espera la venta actual antes de recuperar otra');
      return;
    }
    setCart(held.cart);
    setCustomerRut(held.customerRut);
    setCustomerName(held.customerName);
    setDteType(held.dteType);
    saveHeldCarts(heldCarts.filter((h) => h.id !== held.id));
    setShowHeldModal(false);
    toast.success(`Venta recuperada: ${held.label}`);
    focusSearch();
  }

  function deleteHeldSale(id: string) {
    saveHeldCarts(heldCarts.filter((h) => h.id !== id));
  }

  async function handleRutLookup(rawRut: string) {
    const trimmed = rawRut.trim();
    if (!trimmed) return;
    if (!validateRut(trimmed)) {
      toast.error('RUT inválido (dígito verificador no coincide)');
      return;
    }
    const formatted = formatRut(trimmed);
    setCustomerRut(formatted);
    setLookingUpCustomer(true);
    try {
      const res = await lookupPosCustomerAction(formatted);
      if (res.success && res.data) {
        setCustomerName(res.data.razonSocial);
        setCustomerGiro(res.data.giro ?? '');
        setCustomerAddress(res.data.address ?? '');
        setCustomerComuna(res.data.comuna ?? '');
        toast.success(`Cliente: ${res.data.razonSocial}`);
      }
    } finally {
      setLookingUpCustomer(false);
    }
  }

  function printTicket() {
    document.documentElement.classList.add('pos-printing');
    window.print();
    document.documentElement.classList.remove('pos-printing');
  }

  const handleCharge = useCallback(async () => {
    if (cart.length === 0 || saving) return;

    const rut = customerRut.trim();
    if (rut && !validateRut(rut)) {
      toast.error('El RUT del cliente no es válido');
      return;
    }
    if (isFactura && !rut) {
      toast.error('Para emitir Factura debes ingresar el RUT de la empresa receptora');
      return;
    }
    if (hasTaxableItemsInExemptDte) {
      toast.error('Un documento exento no puede llevar productos afectos a IVA');
      return;
    }

    const lowStock = cart.filter((line) => line.isTrackable && line.quantity > line.stock);
    if (lowStock.length > 0) {
      const detail = lowStock.map((l) => `${l.sku} (disp. ${formatQty(l.stock)})`).join(', ');
      if (
        !(await confirm(
          `Stock insuficiente en: ${detail}. Si la empresa no permite stock negativo la venta se rechazará. ¿Intentar emitir?`
        ))
      ) {
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        dteType,
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          discountPercent: line.discountPercent > 0 ? line.discountPercent : undefined,
        })),
        paymentMethod,
        cashReceived: isCash ? received : undefined,
        customerRut: rut || undefined,
        customerName: customerName.trim() || undefined,
        customerGiro: customerGiro.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerComuna: customerComuna.trim() || undefined,
      };
      const result = await createPosSaleAction(props.shiftId, {
        ...payload,
        idempotencyKey: idempotency.current.keyFor({ shiftId: props.shiftId, ...payload }),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const sale = result.data;
      idempotency.current.reset();

      const unitByProduct = new Map(cart.map((c) => [c.productId, c.unit]));
      const nextTicket: TicketData = {
        dteType: sale.dteType,
        companyName: props.companyName,
        companyRut: props.companyRut,
        companyGiro: props.companyGiro,
        companyAddress: props.companyAddress,
        folio: sale.folio,
        issuedAt: new Date(sale.issueDate),
        cashRegisterName: props.cashRegisterName,
        cashierName: props.cashierName,
        customerName:
          sale.contact?.razonSocial ||
          customerName.trim() ||
          (rut ? `Cliente ${formatRut(rut)}` : 'Consumidor Final'),
        customerRut: sale.contact?.rut || (rut ? formatRut(rut) : '66.666.666-6'),
        customerGiro: sale.contact?.giro || customerGiro.trim() || null,
        customerAddress: sale.contact?.address || customerAddress.trim() || null,
        customerComuna: sale.contact?.comuna || customerComuna.trim() || null,
        lines: sale.items.map((item) => ({
          description: item.description,
          sku: item.sku,
          quantity: item.quantity,
          unit: item.productId ? unitByProduct.get(item.productId) : 'UN',
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          total: item.total,
          discountPercent: item.discountPercent,
          isExempt: item.isExempt,
        })),
        netAmount: sale.netAmount,
        exemptAmount: sale.exemptAmount,
        ivaAmount: sale.ivaAmount,
        totalAmount: sale.totalAmount,
        paymentMethodLabel: POS_PAYMENT_METHOD_LABELS[paymentMethod],
        cashRoundedTotal: isCash ? (sale.cashRoundedTotal ?? cashRoundedTotal) : undefined,
        cashRoundingDiff: isCash ? (sale.cashRoundingDiff ?? cashRoundingDiff) : undefined,
        cashReceived: isCash ? received : undefined,
        changeDue: isCash ? sale.changeDue : undefined,
        timbrePdf417: sale.timbrePdf417 ?? null,
      };

      setTicket(nextTicket);

      const dteLabel = POS_DTE_SHORT_LABELS[dteType] ?? 'Boleta';
      toast.success(
        isCash && sale.changeDue > 0
          ? `${dteLabel} #${sale.folio} — Vuelto ${formatCurrency(sale.changeDue)}`
          : `${dteLabel} #${sale.folio} emitida`
      );

      setCart([]);
      setLastScanned(null);
      setCashReceived('');
      setCustomerRut('');
      setCustomerName('');
      setCustomerGiro('');
      setCustomerAddress('');
      setCustomerComuna('');
      setActiveMultiplier(null);
      setQuery('');

      if (autoPrint) {
        setTimeout(() => {
          printTicket();
        }, 120);
      }

      refreshCatalogAndFolios();
      props.onSaleCompleted?.();
      router.refresh();
      focusSearch();
    } catch {
      toast.error(
        'No se pudo contactar al servidor. Revisa la conexión y vuelve a cobrar: la venta no se duplicará.'
      );
    } finally {
      setSaving(false);
    }
  }, [
    autoPrint,
    cart,
    cashRoundedTotal,
    cashRoundingDiff,
    confirm,
    customerAddress,
    customerComuna,
    customerGiro,
    customerName,
    customerRut,
    dteType,
    focusSearch,
    hasTaxableItemsInExemptDte,
    isCash,
    isFactura,
    paymentMethod,
    props,
    received,
    refreshCatalogAndFolios,
    router,
    saving,
  ]);

  // Atajos de teclado de caja de supermercado (F2, F4, F6, F7, F8, F9, F10)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        focusSearch();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) holdCurrentSale();
        else setShowHeldModal((v) => !v);
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveMultiplier((prev) => (prev === null ? 2 : prev >= 12 ? null : prev + 1));
        focusSearch();
      } else if (e.key === 'F7') {
        e.preventDefault();
        setPriceCheckOpen((v) => !v);
        setPriceCheckQuery('');
        setPriceCheckProduct(null);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setDteType((prev) => {
          const idx = POS_DTE_TYPES.indexOf(prev);
          return POS_DTE_TYPES[(idx + 1) % POS_DTE_TYPES.length]!;
        });
      } else if (e.key === 'F9') {
        e.preventDefault();
        setPaymentMethod((prev) => {
          const idx = POS_PAYMENT_METHODS.indexOf(prev);
          return POS_PAYMENT_METHODS[(idx + 1) % POS_PAYMENT_METHODS.length]!;
        });
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (canCharge) void handleCharge();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handlePriceCheckSearch(raw: string) {
    const clean = raw.trim().toLowerCase();
    if (!clean) return;
    const scaleReading = parseScaleBarcode(raw);
    if (scaleReading) {
      const matched = matchScaleBarcodeToProduct(scaleReading, products);
      if (matched) {
        setPriceCheckProduct(matched);
        return;
      }
    }
    const found =
      products.find((p) => p.barcode?.toLowerCase() === clean) ??
      products.find((p) => p.sku.toLowerCase() === clean) ??
      products.find((p) => p.name.toLowerCase().includes(clean));
    setPriceCheckProduct(found ?? null);
    if (!found) toast.error(`No se encontró "${raw}"`);
  }

  const totalItemsCount = useMemo(
    () => cart.reduce((sum, l) => sum + (Number.isInteger(l.quantity) ? l.quantity : 1), 0),
    [cart]
  );

  return (
    <div className="space-y-3">
      {/* Visor Superior de Supermercado (Último producto escaneado + Total en gigante) */}
      <div className="grid gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card lg:grid-cols-[1fr_auto] print:hidden">
        <div className="flex min-w-0 flex-col justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-wide uppercase opacity-75">
            <span>{props.cashRegisterName}</span>
            <span>·</span>
            <span>Bodega: {props.warehouseName}</span>
            <span>·</span>
            <span>Cajero: {props.cashierName}</span>
            {currentDteFolios ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
                <CheckCircle2 className="size-3" /> CAF SII: {currentDteFolios.remaining} folios disp.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                Folio interno (sin CAF para {POS_DTE_SHORT_LABELS[dteType]})
              </span>
            )}
          </div>

          {lastScanned ? (
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                  {lastScanned.name}
                </p>
                <p className="text-xs opacity-80">
                  SKU {lastScanned.sku} · {formatQty(lastScanned.quantity)} {lastScanned.unit} ×{' '}
                  {formatCurrency(lastScanned.unitGrossPrice)}
                  {lastScanned.badge ? ` (${lastScanned.badge})` : ''}
                </p>
              </div>
              <span className="text-2xl font-bold tabular-nums">
                {formatCurrency(lastScanned.lineGrossTotal)}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm opacity-80">
              Listo para escanear código de barras EAN-13, etiqueta de balanza (prefijo 20–29) o digitar PLU…
            </p>
          )}
        </div>

        <div className="flex flex-col items-end justify-center border-t border-white/15 pt-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <span className="text-xs uppercase opacity-75">
            {POS_DTE_SHORT_LABELS[dteType]} · {cart.length} {cart.length === 1 ? 'línea' : 'líneas'} ({totalItemsCount} unid.)
          </span>
          <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl" aria-live="polite">
            {formatCurrency(isCash ? cashRoundedTotal : total)}
          </span>
          <div className="mt-0.5 flex gap-3 text-[11px] tabular-nums opacity-75">
            <span>Neto {formatCurrency(computed.totals.netAmount)}</span>
            {computed.totals.exemptAmount > 0 && (
              <span>Exento {formatCurrency(computed.totals.exemptAmount)}</span>
            )}
            <span>IVA {formatCurrency(computed.totals.ivaAmount)}</span>
          </div>
        </div>
      </div>

      {/* Barra de Teclas Rápidas de Caja */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-card print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" size="xs" variant="outline" onClick={focusSearch}>
            <kbd className="mr-1 rounded bg-muted px-1 font-mono text-[10px]">F2</kbd> Escanear
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => setShowHeldModal(true)}>
            <PauseCircle className="mr-1 size-3.5" />
            <kbd className="mr-1 rounded bg-muted px-1 font-mono text-[10px]">F4</kbd>
            En espera ({heldCarts.length})
          </Button>
          <Button
            type="button"
            size="xs"
            variant={activeMultiplier !== null ? 'default' : 'outline'}
            onClick={() => {
              const next = activeMultiplier === null ? 2 : activeMultiplier >= 6 ? null : activeMultiplier + 1;
              setActiveMultiplier(next);
              focusSearch();
            }}
          >
            <Hash className="mr-1 size-3.5" />
            <kbd className="mr-1 rounded bg-muted px-1 font-mono text-[10px] text-foreground">F6</kbd>
            {activeMultiplier !== null ? `Multiplicador ×${activeMultiplier}` : 'Multiplicar (N*)'}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setPriceCheckOpen(true);
              setPriceCheckQuery('');
              setPriceCheckProduct(null);
            }}
          >
            <Search className="mr-1 size-3.5" />
            <kbd className="mr-1 rounded bg-muted px-1 font-mono text-[10px]">F7</kbd> Consultar precio
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setShowCatalogGrid((v) => !v)}
          >
            <Sparkles className="mr-1 size-3.5" /> {showCatalogGrid ? 'Ocultar botonera PLU' : 'Mostrar botonera PLU'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={toggleAutoPrint}
              className="size-3.5 rounded border-input accent-primary"
            />
            Auto-imprimir 80mm
          </label>
        </div>
      </div>

      {/* Cuerpo Principal: Izquierda (Escáner + Carrito + Botonera PLU) | Derecha (Documento + Pago + Cobro) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px] print:hidden">
        <div className="space-y-3">
          {/* Barra Lectora de Código de Barras y Balanza */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label htmlFor="pos-search" className="flex items-center gap-2">
                <ScanBarcode className="size-4 text-muted-foreground" aria-hidden="true" />
                Escanear código de barras, balanza (20–29) o buscar producto
              </Label>
              {activeMultiplier !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                  Multiplicador activo: × {formatQty(activeMultiplier)}
                  <button
                    type="button"
                    onClick={() => setActiveMultiplier(null)}
                    className="ml-1 hover:opacity-70"
                    aria-label="Quitar multiplicador"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                id="pos-search"
                ref={searchRef}
                autoFocus
                autoComplete="off"
                placeholder='Código de barras, SKU, nombre o "6*codigo" — Enter para agregar'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-12 flex-1 text-lg"
                aria-describedby="pos-search-hint"
              />
              <Button
                type="button"
                variant="outline"
                className="h-12 px-3"
                title="Escanear con cámara"
                onClick={() => setShowCameraScanner(true)}
              >
                <Camera className="size-5" />
              </Button>
            </div>

            <p id="pos-search-hint" className="mt-1.5 text-xs text-muted-foreground">
              {loadingProducts
                ? 'Cargando catálogo de la bodega…'
                : `Soporta lector láser USB/Bluetooth, empaques por mayor, etiquetas de balanza (EAN-13 20–29) y multiplicador rápido (ej. 12* + Enter).`}
            </p>

            {matches.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                {matches.map((product) => (
                  <li
                    key={product.id}
                    className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                    onClick={() => handleTileClick(product)}
                  >
                    <div className="min-w-0">
                      <span className="font-semibold">{product.sku}</span> —{' '}
                      <span className="font-medium">{product.name}</span>
                      {product.isExempt && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Exento
                        </span>
                      )}
                      {isWeighableUnit(product.unit) && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                          <Scale className="size-2.5" /> {product.unit}
                        </span>
                      )}
                      {product.priceTiers.length > 0 && (
                        <span className="ml-1.5 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                          Mayorista desde {product.priceTiers[0]!.minQuantity}
                        </span>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                      <span className={product.isTrackable && product.stock <= 0 ? 'text-destructive font-medium' : 'text-xs'}>
                        Stock {formatQty(product.stock)} {product.unit}
                      </span>
                      <span className="text-base font-bold text-foreground tabular-nums">
                        {formatCurrency(product.grossPrice)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tabla del Carrito de Supermercado */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
            <table className="w-full min-w-[600px] table-auto text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Producto
                  </th>
                  <th className="p-3 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Cantidad / Peso
                  </th>
                  <th className="p-3 text-right text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Dcto %
                  </th>
                  <th className="p-3 text-right text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    P. Unit.
                  </th>
                  <th className="p-3 text-right text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Total Línea
                  </th>
                  <th className="w-10 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td className="p-10 text-center text-sm text-muted-foreground" colSpan={6}>
                      <ScanBarcode className="mx-auto mb-2 size-7 text-muted-foreground/60" aria-hidden="true" />
                      Pistolea un código de barras o toca un producto rápido para iniciar la venta
                    </td>
                  </tr>
                )}
                {computed.items.map((line) => {
                  const expiry = isExpiredOrSoon(line.nextExpiryDate);
                  return (
                    <tr key={line.productId} className="border-t border-border transition-colors hover:bg-muted/40">
                      <td className="p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">{line.name}</span>
                          {line.isExempt && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Exento
                            </span>
                          )}
                          {line.activeTierMinQty !== null && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
                              <Tag className="size-2.5" /> Mayorista ≥{line.activeTierMinQty}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{line.sku}</span>
                          <span>· Neto {formatCurrency(line.unitPrice)}</span>
                          {expiry.status !== 'ok' && (
                            <span
                              className={`inline-flex items-center gap-0.5 font-medium ${
                                expiry.status === 'expired' ? 'text-destructive' : 'text-amber-600'
                              }`}
                            >
                              <AlertTriangle className="size-3" /> {expiry.label}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => changeQuantity(line.productId, -1)}
                          >
                            −
                          </Button>
                          <input
                            type="number"
                            min={0.001}
                            step={isWeighableUnit(line.unit) ? 0.005 : 1}
                            value={line.quantity}
                            onChange={(e) => setLineQuantity(line.productId, e.target.value)}
                            aria-label={`Cantidad de ${line.name}`}
                            className="h-7 w-16 rounded-md border border-input bg-background px-1.5 text-center text-sm font-medium tabular-nums"
                          />
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => changeQuantity(line.productId, 1)}
                          >
                            +
                          </Button>
                          {isWeighableUnit(line.unit) && (
                            <span className="text-xs text-muted-foreground">{line.unit}</span>
                          )}
                        </div>
                        {line.isTrackable && line.quantity > line.stock && (
                          <p className="mt-1 text-xs text-destructive">
                            Sobre stock ({formatQty(line.stock)} disp.)
                          </p>
                        )}
                      </td>

                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={line.discountPercent || ''}
                          placeholder="0"
                          onChange={(e) => setLineDiscount(line.productId, e.target.value)}
                          aria-label={`Descuento % de ${line.name}`}
                          className="h-7 w-14 rounded-md border border-input bg-background px-1.5 text-right text-xs tabular-nums"
                        />
                      </td>

                      <td className="p-2.5 text-right tabular-nums">
                        <span className="font-medium">{formatCurrency(line.effectiveGrossUnitPrice)}</span>
                        {line.activeTierMinQty !== null && (
                          <span className="block text-[10px] text-muted-foreground line-through">
                            {formatCurrency(line.baseGrossPrice)}
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 text-right text-base font-bold tabular-nums">
                        {formatCurrency(line.total)}
                      </td>

                      <td className="p-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label={`Quitar ${line.name}`}
                          onClick={() => removeLine(line.productId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Botonera Rápida PLU por Categorías y Pesables (Panadería, Verdulería, Bolsas, Mayoristas) */}
          {showCatalogGrid && products.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Acceso Rápido PLU / Productos sin código
                </span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['ALL', 'Todos'],
                      ['WEIGHABLE', 'Pesables / Granel'],
                      ['WHOLESALE', 'Mayoristas'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedCategory(key)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        selectedCategory === key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        selectedCategory === cat
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {gridProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleTileClick(product)}
                    className="flex flex-col justify-between rounded-xl border border-border bg-background p-2.5 text-left transition-all hover:border-primary/40 hover:bg-accent"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {product.sku}
                        </span>
                        {isWeighableUnit(product.unit) && (
                          <span className="rounded bg-accent px-1 py-0.5 text-[9px] font-semibold text-accent-foreground">
                            {product.unit}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-foreground">
                        {product.name}
                      </p>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {product.isTrackable ? `${formatQty(product.stock)} ${product.unit}` : 'Servicio'}
                      </span>
                      <span className="text-sm font-bold text-foreground tabular-nums">
                        {formatCurrency(product.grossPrice)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Documento Tributario + Cliente + Medio de Pago + Cobro */}
        <div className="space-y-3">
          {/* Selector de Documento Tributario (Boleta 39, Exenta 41, Factura 33, Factura Exenta 34) */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <FileText className="size-4 text-muted-foreground" /> Documento SII (F8)
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {POS_DTE_SHORT_LABELS[dteType]}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {POS_DTE_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={dteType === type ? 'default' : 'outline'}
                  onClick={() => {
                    setDteType(type);
                    focusSearch();
                  }}
                >
                  {POS_DTE_SHORT_LABELS[type]}
                </Button>
              ))}
            </div>
            {hasTaxableItemsInExemptDte && (
              <p className="mt-2 rounded-lg border border-danger/30 bg-danger-soft p-2 text-xs text-danger">
                El carrito contiene productos afectos a IVA. Cambia a Boleta (39) o Factura (33), o quita los ítems afectos.
              </p>
            )}
          </div>

          {/* Medio de Pago */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <Label>Medio de pago (F9)</Label>
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

          {/* Efectivo y Ley de Redondeo N° 20.956 */}
          {isCash && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cash-received">Efectivo recibido</Label>
                <span className="text-lg font-semibold tabular-nums">{formatCurrency(received)}</span>
              </div>

              {cashRoundingDiff !== 0 && total > 0 && (
                <div className="mt-1.5 flex items-center justify-between rounded-lg bg-muted/70 px-2.5 py-1 text-xs">
                  <span className="text-muted-foreground">
                    Ley 20.956 ({cashRoundingDiff > 0 ? `+${cashRoundingDiff}` : cashRoundingDiff}):
                  </span>
                  <span className="font-semibold text-foreground">
                    Cobrar {formatCurrency(cashRoundedTotal)}
                  </span>
                </div>
              )}

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
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setCashReceived(String(cashRoundedTotal))}
                >
                  Exacto
                </Button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1">
                {KEYPAD.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    className="h-11 text-lg"
                    onClick={() => pressKey(key)}
                  >
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
                  change < 0
                    ? 'border-danger/25 bg-danger-soft text-danger'
                    : 'border-success/25 bg-success-soft text-success'
                }`}
              >
                <span className="text-sm font-medium">{change < 0 ? 'Falta' : 'Vuelto'}</span>
                <span className="text-2xl font-bold tabular-nums" aria-live="polite">
                  {formatCurrency(Math.abs(change))}
                </span>
              </div>
            </div>
          )}

          {/* Receptor / RUT del Cliente (Opcional en Boleta, Obligatorio en Factura) */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="customer-rut" className="flex items-center gap-1.5">
                <UserCheck className="size-4 text-muted-foreground" />
                {isFactura ? 'RUT receptor (obligatorio Factura)' : 'RUT del cliente (opcional)'}
              </Label>
              {lookingUpCustomer && (
                <span className="text-[11px] text-muted-foreground">Buscando ficha…</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <Input
                id="customer-rut"
                placeholder={isFactura ? 'Ej: 76.543.210-3' : 'Sin RUT: boleta a consumidor final'}
                value={customerRut}
                onChange={(e) => setCustomerRut(e.target.value)}
                onBlur={(e) => void handleRutLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleRutLookup(customerRut);
                  }
                }}
              />
            </div>

            {(isFactura || customerName) && (
              <div className="space-y-2 pt-1">
                <div>
                  <Label htmlFor="customer-name" className="text-xs">
                    Razón Social / Nombre
                  </Label>
                  <Input
                    id="customer-name"
                    placeholder="Nombre o Razón Social"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                {isFactura && (
                  <>
                    <div>
                      <Label htmlFor="customer-giro" className="text-xs">
                        Giro comercial
                      </Label>
                      <Input
                        id="customer-giro"
                        placeholder="Ej: Supermercado, Comercializadora"
                        value={customerGiro}
                        onChange={(e) => setCustomerGiro(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="customer-address" className="text-xs">
                          Dirección
                        </Label>
                        <Input
                          id="customer-address"
                          placeholder="Calle y número"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="customer-comuna" className="text-xs">
                          Comuna
                        </Label>
                        <Input
                          id="customer-comuna"
                          placeholder="Ej: Providencia"
                          value={customerComuna}
                          onChange={(e) => setCustomerComuna(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Botones de Acción Principal */}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={clearAll} disabled={cart.length === 0}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={holdCurrentSale}
              disabled={cart.length === 0}
              title="Poner venta en espera (F4)"
            >
              <PauseCircle className="size-4" />
            </Button>
            <Button
              type="button"
              className="h-12 flex-1 text-base font-semibold"
              disabled={!canCharge}
              onClick={() => void handleCharge()}
            >
              {saving
                ? 'Emitiendo…'
                : `Cobrar ${formatCurrency(isCash ? cashRoundedTotal : total)}`}
            </Button>
          </div>

          {ticket && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={printTicket}>
                <Printer className="mr-2 size-4" /> Reimprimir #{ticket.folio}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTicketPreview(true)}
                title="Ver ticket 80mm con timbre SII"
              >
                <Eye className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Balanza / Pesaje Manual (Gramos, Kilos o Monto en CLP "$1.500 de pan") */}
      {scaleModalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Pesaje de producto"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Scale className="size-5 text-primary" /> {scaleModalProduct.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Precio: {formatCurrency(scaleModalProduct.grossPrice)} / {scaleModalProduct.unit}
                </p>
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setScaleModalProduct(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['WEIGHT_GRAMS', 'En gramos (g)'],
                  ['WEIGHT_KG', `En ${scaleModalProduct.unit}`],
                  ['AMOUNT_CLP', 'Por monto ($)'],
                ] as const
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={scaleMode === mode ? 'default' : 'outline'}
                  onClick={() => {
                    setScaleMode(mode);
                    setScaleInput('');
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div>
              <Label htmlFor="scale-input">
                {scaleMode === 'WEIGHT_GRAMS'
                  ? 'Gramos en la balanza (ej. 450)'
                  : scaleMode === 'WEIGHT_KG'
                    ? `Cantidad en ${scaleModalProduct.unit} (ej. 0,45)`
                    : 'Monto solicitado en pesos (ej. $1.500 de pan)'}
              </Label>
              <Input
                id="scale-input"
                autoFocus
                type="number"
                min={0.001}
                step="any"
                value={scaleInput}
                onChange={(e) => setScaleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmScaleModal();
                  }
                }}
                className="mt-1 h-12 text-lg"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {scaleMode === 'AMOUNT_CLP'
                ? [500, 1000, 1500, 2000, 3000].map((clp) => (
                    <Button
                      key={clp}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setScaleInput(String(clp))}
                    >
                      {formatCurrency(clp)}
                    </Button>
                  ))
                : [250, 500, 750, 1000, 1500].map((grams) => (
                    <Button
                      key={grams}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setScaleMode('WEIGHT_GRAMS');
                        setScaleInput(String(grams));
                      }}
                    >
                      {grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`}
                    </Button>
                  ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setScaleModalProduct(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmScaleModal}>
                Agregar a la venta
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Verificador de Precios de Supermercado (F7) */}
      {priceCheckOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Verificador de precios"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Search className="size-5 text-primary" /> Verificador de Precios (F7)
              </h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => setPriceCheckOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Pistolea el código de barras o escribe SKU / nombre…"
                value={priceCheckQuery}
                onChange={(e) => setPriceCheckQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePriceCheckSearch(priceCheckQuery);
                  }
                }}
              />
              <Button type="button" onClick={() => handlePriceCheckSearch(priceCheckQuery)}>
                Consultar
              </Button>
            </div>

            {priceCheckProduct && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">
                      SKU {priceCheckProduct.sku}
                      {priceCheckProduct.barcode ? ` · EAN ${priceCheckProduct.barcode}` : ''}
                    </p>
                    <h4 className="text-xl font-bold text-foreground">{priceCheckProduct.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {priceCheckProduct.categoryName ?? 'Sin categoría'} · Unidad: {priceCheckProduct.unit} ·{' '}
                      {priceCheckProduct.isExempt ? 'Exento de IVA' : 'Afecto a IVA (19%)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Precio Público</span>
                    <p className="text-3xl font-bold text-foreground tabular-nums">
                      {formatCurrency(priceCheckProduct.grossPrice)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Neto: {formatCurrency(priceCheckProduct.netPrice)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                  <span>
                    Stock en {props.warehouseName}:{' '}
                    <strong>
                      {formatQty(priceCheckProduct.stock)} {priceCheckProduct.unit}
                    </strong>
                  </span>
                  {priceCheckProduct.nextExpiryDate && (
                    <span>Próximo vencimiento FEFO: {priceCheckProduct.nextExpiryDate}</span>
                  )}
                </div>

                {priceCheckProduct.priceTiers.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-success">Precios Mayoristas por Volumen:</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {priceCheckProduct.priceTiers.map((tier) => (
                        <span
                          key={tier.minQuantity}
                          className="rounded-lg bg-success-soft px-2.5 py-1 text-xs font-medium text-success"
                        >
                          Desde {tier.minQuantity} {priceCheckProduct.unit}: {formatCurrency(tier.grossPrice)} c/u
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      addProduct(priceCheckProduct);
                      setPriceCheckOpen(false);
                    }}
                  >
                    Agregar a la venta actual
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Ventas en Espera (F4) */}
      {showHeldModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Ventas en espera"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <PauseCircle className="size-5 text-primary" /> Ventas en Espera ({heldCarts.length})
              </h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => setShowHeldModal(false)}>
                <X className="size-4" />
              </Button>
            </div>

            {heldCarts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay ventas estacionadas en esta caja.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {heldCarts.map((held) => (
                  <li key={held.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium">{held.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Hora: {held.createdAt} · {held.cart.length} productos
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button type="button" size="xs" onClick={() => recallHeldSale(held)}>
                        <PlayCircle className="mr-1 size-3.5" /> Recuperar
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => deleteHeldSale(held.id)}
                        aria-label="Descartar venta en espera"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Modal: Vista Previa del Ticket Térmico 80mm con Timbre SII */}
      {showTicketPreview && ticket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa de boleta térmica"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Vista previa Ticket 80mm (#{ticket.folio})</h3>
              <Button type="button" size="xs" variant="ghost" onClick={() => setShowTicketPreview(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <PosTicket data={ticket} preview />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowTicketPreview(false)}>
                Cerrar
              </Button>
              <Button type="button" onClick={printTicket}>
                <Printer className="mr-2 size-4" /> Imprimir 80mm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Escáner de cámara para tablets / notebooks sin pistola láser */}
      {showCameraScanner && (
        <CameraScanner
          onCode={(code: string) => {
            setShowCameraScanner(false);
            processScannedOrTypedInput(code);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* Ticket oculto para @media print */}
      {ticket && <PosTicket data={ticket} />}
    </div>
  );
}
