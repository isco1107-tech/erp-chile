'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, Camera, Check, CheckCheck, ClipboardCheck, CloudOff, History, Loader2, Package, RefreshCw, ScanLine, Search, ShieldCheck, Wifi, X } from 'lucide-react';
import { useWarehouse } from './useWarehouse';
import { CameraScanner } from './CameraScanner';
import { matchWarehouseCode, readLabelText, type LabelReading } from '@/lib/warehouse/labels';
import { projectedQuantity } from '@/lib/warehouse/local';
import { normalizeWarehouseLot, roundQuantity, type WarehouseOperation } from '@/lib/warehouse/contracts';

type Mode = 'IN' | 'OUT' | 'TRANSFER' | 'COUNT' | 'LOOKUP';
const number = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 6 }).format(value);
const date = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL') : 'Sin vencimiento';
const titles: Record<Mode, string> = { IN: 'Entrar mercadería', OUT: 'Sacar mercadería', TRANSFER: 'Mover a otra bodega', COUNT: 'Contar existencias', LOOKUP: 'Consultar existencias' };
const statusNames = { LOCAL: 'En este teléfono', REVIEW: 'Por aprobar', APPLIED: 'Confirmado en Aether', CONFLICT: 'Requiere revisión', REJECTED: 'No aplicado' } as const;
const field = 'min-h-12 w-full rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function WarehouseMobileClient() {
  const { state, loading, busy, locked, online, error, sync, capture, setError } = useWarehouse();
  const [mode, setMode] = useState<Mode | null>(null);
  const [history, setHistory] = useState(false);
  const [warehouse, setWarehouse] = useState('');
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [packagingId, setPackagingId] = useState('');
  const [targetWarehouse, setTargetWarehouse] = useState('');
  const [orderItemId, setOrderItemId] = useState('');
  const [note, setNote] = useState('Consumo interno');
  const [scanner, setScanner] = useState(false);
  const [reading, setReading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const activeWarehouse = state?.warehouses.find((row) => row.id === warehouse)?.id ?? state?.warehouses[0]?.id ?? '';
  const product = state?.products.find((row) => row.id === productId);
  const packaging = product?.packagings.find((row) => row.id === packagingId);
  const factor = packaging?.factor ?? 1;
  const baseQuantity = roundQuantity(Number(quantity.replace(',', '.')) * factor);
  const lots = product?.lots.filter((lot) => lot.warehouseId === activeWarehouse).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')) ?? [];
  const choices = state?.products.filter((row) => !query.trim() || `${row.sku} ${row.name} ${row.barcode ?? ''}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).slice(0, 30) ?? [];
  const receiptChoices = state?.orders.flatMap((order) => order.items.filter((item) => item.productId === productId).map((item) => ({ ...item, orderId: order.id, label: `OC #${order.folio} · ${order.supplier} · faltan ${number(item.remaining)}` }))) ?? [];
  const pending = state?.operations.filter((row) => row.status === 'LOCAL').length ?? 0;
  const review = state?.operations.filter((row) => ['REVIEW', 'CONFLICT'].includes(row.status)).length ?? 0;

  const resetProduct = () => { setProductId(''); setQuantity(''); setLotNumber(''); setExpiryDate(''); setPackagingId(''); setOrderItemId(''); setQuery(''); };
  const applyReading = useCallback((value: LabelReading) => {
    if (value.lotNumber) setLotNumber(value.lotNumber);
    if (value.expiryDate) setExpiryDate(value.expiryDate);
    setNotice(value.warnings.join('. ') || 'Datos leídos. Comprueba el lote y confirma la cantidad real.');
  }, []);
  const scanned = useCallback((code: string) => {
    setScanner(false);
    const match = matchWarehouseCode(state?.products ?? [], code);
    if (!match) { setQuery(code); setNotice('Código no encontrado en el catálogo descargado. Busca el producto o actualiza con conexión.'); return; }
    setProductId(match.product.id); setQuery(''); setQuantity(''); setLotNumber(''); setExpiryDate(''); setOrderItemId('');
    setPackagingId(match.packagingName ? match.product.packagings.find((row) => row.name === match.packagingName && row.factor === match.factor)?.id ?? '' : '');
    applyReading(match.reading);
    if (match.reading.weightKg !== undefined && match.product.unit === 'KG') setQuantity(String(match.reading.weightKg));
  }, [state?.products, applyReading]);
  const prepare = async () => {
    setPreparing(true); setNotice('Preparando lectura de fotos para usar sin señal…');
    try {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
      await Promise.all([import('@zxing/browser'), import('@/lib/warehouse/browser-ocr').then((module) => module.prepareWarehouseOcr())]);
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js');
        const registration = await navigator.serviceWorker.ready;
        const channel = new MessageChannel();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No se completó la preparación sin conexión. Vuelve a intentar.')), 120_000);
          channel.port1.onmessage = (event: MessageEvent<{ ok: boolean }>) => { clearTimeout(timeout); channel.port1.close(); event.data.ok ? resolve() : reject(new Error('No se pudieron descargar los archivos de lectura. Revisa la conexión.')); };
          const assets = [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((element) => element.src).concat([...document.querySelectorAll<HTMLLinkElement>('link[href]')].map((element) => element.href), performance.getEntriesByType('resource').map((entry) => entry.name));
          registration.active?.postMessage({ type: 'WAREHOUSE_PREPARE', assets }, [channel.port2]);
        });
      }
      await navigator.storage?.persist?.(); setPrepared(true); setNotice('Lectura preparada. Puedes trabajar sin señal con los productos descargados.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo preparar la lectura'); }
    finally { setPreparing(false); }
  };
  const recognize = async (file?: File) => {
    if (!file) return;
    setReading(true); setNotice('Leyendo la etiqueta en este dispositivo…');
    try {
      const { recognizeWarehousePhoto } = await import('@/lib/warehouse/browser-ocr');
      const text = await recognizeWarehousePhoto(file);
      const value = readLabelText(text);
      if (!product) {
        const matches = text.split(/\s+/).map((token) => matchWarehouseCode(state?.products ?? [], token)).filter((match) => match !== null);
        const unique = [...new Set(matches.map((match) => match.product.id))];
        if (unique.length === 1) { setProductId(unique[0]); setPackagingId(''); setQuantity(''); }
      }
      applyReading(value);
      if (!value.lotNumber && !value.expiryDate) setNotice('No se distinguieron lote y vencimiento. Acerca la cámara o completa esos campos.');
      if (value.weightKg !== undefined && product?.unit === 'KG') { setPackagingId(''); setQuantity(String(value.weightKg)); }
    } catch { setError('No se pudo leer la foto. Prueba con más luz y la etiqueta enfocada. Para leer sin señal, prepara la lectura antes de salir.'); }
    finally { setReading(false); if (photo.current) photo.current.value = ''; }
  };
  const save = async () => {
    if (!product || !mode || mode === 'LOOKUP' || !state || saving) return;
    setSaving(true);
    try {
      const receipt = receiptChoices.find((row) => row.id === orderItemId);
      const kind: WarehouseOperation['kind'] = mode === 'IN' && receipt ? 'RECEIPT' : mode;
      const stock = product.stocks.find((row) => row.warehouseId === activeWarehouse);
      const lot = lots.find((row) => row.lotNumber === normalizeWarehouseLot(lotNumber));
      const success = await capture({
        kind, productId: product.id, warehouseId: activeWarehouse, quantity: baseQuantity,
        ...(product.tracksLots && lotNumber.trim() ? { lotNumber: lotNumber.trim() } : {}),
        ...(expiryDate && ['IN', 'COUNT'].includes(mode) ? { expiryDate } : {}),
        ...(mode === 'TRANSFER' ? { targetWarehouseId: targetWarehouse } : {}),
        ...(kind === 'RECEIPT' && receipt ? { orderId: receipt.orderId, orderItemId: receipt.id } : {}),
        ...(mode === 'COUNT' ? { baseline: { stockUpdatedAt: stock?.updatedAt ?? null, lotUpdatedAt: lot?.updatedAt ?? null } } : {}),
        note: mode === 'OUT' ? note : mode === 'TRANSFER' ? 'Traslado entre bodegas' : mode === 'COUNT' ? 'Conteo físico por operario' : kind === 'RECEIPT' ? 'Recepción física contra orden de compra' : 'Ingreso sin orden; requiere revisión y valoración',
      });
      if (success) { resetProduct(); setNotice('Guardado en este teléfono. Puedes seguir con el próximo producto.'); }
    } finally { setSaving(false); }
  };

  if (loading && !state) return <div className="flex min-h-[70vh] items-center justify-center gap-3" role="status"><Loader2 className="animate-spin" /> Preparando tu bodega…</div>;
  if (!state || locked) return <div className="mx-auto max-w-md space-y-5 px-5 py-16"><div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Package size={32} /></div><h1 className="text-3xl font-semibold">Tu bodega, a mano</h1><p className="text-muted-foreground">Prepara este teléfono con conexión. Después podrás registrar mercadería aunque pierdas la señal.</p>{error && <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">{error}</p>}<button type="button" onClick={() => void sync()} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw size={20} className={busy ? 'animate-spin' : ''} />{busy ? 'Conectando…' : 'Conectar con Aether'}</button><Link href="/login" className="flex min-h-12 items-center justify-center rounded-xl border border-border">Iniciar sesión</Link><p className="text-xs text-muted-foreground">Los registros pendientes se conservan al vencer tu sesión. Vuelve a ingresar con la misma cuenta para sincronizarlos.</p></div>;

  return <div className="mx-auto min-h-dvh max-w-xl px-4 pb-12 pt-5 sm:px-6">
    <header className="mb-6 space-y-4"><div className="flex items-center justify-between gap-3"><Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold"><Package size={21} className="text-primary" /> AETHER <span className="font-normal text-muted-foreground">/ Bodega</span></Link><button type="button" onClick={() => { setHistory(!history); setMode(null); resetProduct(); }} aria-pressed={history} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm"><History size={18} /> Registros</button></div><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{state.identity.companyName} · {state.identity.userName}</p><h1 data-tutorial="module-header" className="mt-1 text-2xl font-semibold tracking-tight">{history ? 'Tus registros' : mode ? titles[mode] : '¿Qué vas a hacer?'}</h1></div><span className={`mt-1 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${online ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{online ? <Wifi size={13} /> : <CloudOff size={13} />}{online ? 'Con conexión' : 'Sin señal'}</span></div>
      <label className="block text-xs font-medium text-muted-foreground">Bodega de trabajo<select aria-label="Bodega de trabajo" className={`${field} mt-1 text-foreground`} value={activeWarehouse} onChange={(event) => { setWarehouse(event.target.value); resetProduct(); }}>{state.warehouses.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"><p className="text-sm"><strong>{pending}</strong> por sincronizar{review > 0 && <span className="text-muted-foreground"> · {review} por revisar</span>}<span className="mt-0.5 block text-[11px] text-muted-foreground">Actualizado {new Date(state.refreshedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></p><button type="button" disabled={busy} onClick={() => void sync()} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-50" aria-label="Sincronizar y actualizar existencias"><RefreshCw size={17} className={busy ? 'animate-spin' : ''} />{busy ? 'Enviando' : 'Actualizar'}</button></div>
    </header>
    {error && <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{error}</p><button type="button" aria-label="Cerrar mensaje" onClick={() => setError('')}><X size={18} /></button></div>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-border bg-card p-3 text-sm">{notice}</p>}
    {!history && !mode && <><div className="grid grid-cols-2 gap-3">{([
      { mode: 'IN' as const, title: 'Entrar', subtitle: 'Recibir mercadería', Icon: ArrowDownToLine },
      { mode: 'OUT' as const, title: 'Sacar', subtitle: 'Registrar una salida', Icon: ArrowUpFromLine },
      { mode: 'COUNT' as const, title: 'Contar', subtitle: 'Inventario físico', Icon: ClipboardCheck },
      { mode: 'LOOKUP' as const, title: 'Consultar', subtitle: 'Stock y vencimientos', Icon: Search },
    ]).map(({ mode: next, title, subtitle, Icon }) => <button key={next} type="button" disabled={!state.identity.canOperate && next !== 'LOOKUP'} onClick={() => { resetProduct(); setMode(next); setNotice(''); }} className="flex min-h-40 flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"><Icon size={29} className="text-primary" /><span><strong className="block text-xl font-semibold">{title}</strong><span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span></span></button>)}</div><div className="mt-5 rounded-2xl border border-border p-4"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={18} className="text-primary" /> Trabajo sin señal</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Tus registros se guardan en este dispositivo. La web los recibe al sincronizar. Las fotografías se leen aquí y no se suben.</p><button type="button" onClick={() => void prepare()} disabled={preparing || !online} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-50">{preparing ? <Loader2 size={16} className="animate-spin" /> : prepared ? <Check size={16} /> : <Camera size={16} />}{preparing ? 'Preparando…' : prepared ? 'Lectura preparada' : 'Preparar lectura sin señal'}</button></div>{state.identity.canApprove && <Link className="mt-4 flex min-h-12 items-center justify-between rounded-xl border border-border p-3 text-sm" href="/dashboard/inventory/mobile">Revisar registros del equipo <ArrowRight size={16} /></Link>}<p className="mt-5 text-xs text-muted-foreground">Antes de cerrar el turno, comprueba que no queden registros por sincronizar. El stock de otros teléfonos se conoce al actualizar.</p></>}
    {history && <div className="space-y-3">{state.operations.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><History className="mx-auto mb-3 text-muted-foreground" /><p>Aún no hay registros en este teléfono</p></div> : [...state.operations].reverse().map((entry) => <article key={entry.payload.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{state.products.find((row) => row.id === entry.payload.productId)?.name ?? entry.payload.productId}</span>{entry.status === 'APPLIED' && <CheckCheck className="shrink-0 text-success" size={18} />}</div><p className="mt-1 text-xs text-muted-foreground">{entry.payload.kind === 'RECEIPT' ? 'Recepción' : titles[entry.payload.kind]} · {number(entry.payload.quantity)}{entry.payload.lotNumber && ` · Lote ${entry.payload.lotNumber}`}</p><p className={`mt-3 text-xs font-medium ${entry.status === 'APPLIED' ? 'text-success' : entry.status === 'CONFLICT' ? 'text-destructive' : 'text-foreground'}`}>{statusNames[entry.status]}</p>{entry.message !== statusNames[entry.status] && <p className="mt-1 text-xs text-muted-foreground">{entry.message}</p>}<time className="mt-2 block text-[11px] text-muted-foreground">{new Date(entry.payload.capturedAt).toLocaleString('es-CL')}</time></article>)}</div>}
    {!history && mode && <div className="space-y-5"><button type="button" onClick={() => { setMode(null); resetProduct(); }} className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={17} /> Volver</button><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setScanner(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground"><ScanLine size={20} /> Escanear</button><button type="button" disabled={reading} onClick={() => photo.current?.click()} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-card font-medium disabled:opacity-50">{reading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}{reading ? 'Leyendo…' : 'Foto etiqueta'}</button><input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => void recognize(event.target.files?.[0])} /></div>
      {!product ? <div><label className="block text-sm font-medium" htmlFor="warehouse-search">Producto o código</label><input id="warehouse-search" className={`${field} mt-2`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, SKU o código" onKeyDown={(event) => { if (event.key === 'Enter') scanned(query); }} /><div className="mt-3 space-y-2">{choices.map((row) => <button key={row.id} type="button" className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left" onClick={() => { setProductId(row.id); setPackagingId(''); setQuantity(''); setLotNumber(''); setExpiryDate(''); setOrderItemId(''); }}><span><span className="block text-sm font-semibold">{row.name}</span><span className="mt-1 block text-xs text-muted-foreground">{row.sku} · {number(projectedQuantity(state, row.id, activeWarehouse))} {row.unit}</span></span><ArrowRight size={17} className="shrink-0 text-muted-foreground" /></button>)}{choices.length === 0 && <p className="p-4 text-sm text-muted-foreground">No hay coincidencias. Actualiza el catálogo con conexión o busca otro código.</p>}</div></div> : <><div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{product.sku}</p><h2 className="mt-1 text-lg font-semibold">{product.name}</h2></div><button type="button" onClick={resetProduct} className="min-h-11 px-2 text-xs underline">Cambiar</button></div><p className="mt-3 text-sm"><strong>{number(projectedQuantity(state, product.id, activeWarehouse))} {product.unit}</strong><span className="text-muted-foreground"> disponibles en este teléfono</span></p></div>
      {mode === 'LOOKUP' ? <div className="space-y-2">{lots.length === 0 && <p className="text-sm text-muted-foreground">Este producto no tiene lotes registrados en la bodega.</p>}{lots.map((lot) => <div key={lot.lotNumber} className="flex items-center justify-between rounded-xl border border-border p-4 text-sm"><div className="space-y-1"><strong>{lot.lotNumber}</strong><p className="text-xs text-muted-foreground">{date(lot.expiryDate)}</p></div><span>{number(projectedQuantity(state, product.id, activeWarehouse, lot.lotNumber))} {product.unit}</span></div>)}</div> : <>
      {product.tracksLots && <div className="space-y-3"><label className="block text-sm font-medium" htmlFor="warehouse-lot">Lote físico</label><input id="warehouse-lot" className={field} list="warehouse-lots" maxLength={40} value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="Escanea, fotografía o indica el lote" autoComplete="off" /><datalist id="warehouse-lots">{lots.map((lot) => <option key={lot.lotNumber} value={lot.lotNumber}>{number(lot.quantity)} {product.unit} · {date(lot.expiryDate)}</option>)}</datalist>{['IN', 'COUNT'].includes(mode) && <label className="block text-sm font-medium">Vencimiento <span className="font-normal text-muted-foreground">(si aparece en la etiqueta)</span><input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={`${field} mt-2`} /></label>}</div>}
      {mode === 'IN' && <label className="block text-sm font-medium">Origen del ingreso<select className={`${field} mt-2`} value={orderItemId} onChange={(event) => setOrderItemId(event.target.value)}><option value="">Sin orden: solicitar ajuste a supervisión</option>{state.identity.canReceive && receiptChoices.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select>{!orderItemId && <span className="mt-2 block text-xs font-normal text-muted-foreground">El ingreso queda pendiente hasta que supervisión revise el motivo y confirme su costo. Las compras se reciben contra una orden para mantener su trazabilidad.</span>}</label>}
      <div className="grid grid-cols-2 items-end gap-3"><label className="block text-sm font-medium">{mode === 'COUNT' ? 'Cantidad contada' : 'Cantidad'}<input className={`${field} mt-2 text-xl font-semibold`} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={mode === 'COUNT' ? '0' : 'Ej. 3'} /></label><label className="block text-sm font-medium">Presentación<select className={`${field} mt-2`} value={packagingId} onChange={(event) => setPackagingId(event.target.value)}><option value="">{product.unit} · unidad base</option>{product.packagings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
      {quantity && Number.isFinite(baseQuantity) && <p className="text-sm text-muted-foreground">Se registrarán <strong className="text-foreground">{number(baseQuantity)} {product.unit}</strong>{packaging && ` (${number(factor)} por ${packaging.name})`}.</p>}
      {mode === 'OUT' && <label className="block text-sm font-medium">Motivo<select className={`${field} mt-2`} value={note} onChange={(event) => setNote(event.target.value)}><option>Consumo interno</option><option>Merma o daño</option><option>Entrega interna</option></select><span className="mt-2 block text-xs font-normal text-muted-foreground">Salida interna de inventario. Los despachos de ventas se registran desde su documento de venta.</span></label>}
      {mode === 'TRANSFER' && <label className="block text-sm font-medium">Bodega de destino<select className={`${field} mt-2`} value={targetWarehouse} onChange={(event) => setTargetWarehouse(event.target.value)}><option value="">Selecciona el destino</option>{state.warehouses.filter((row) => row.id !== activeWarehouse).map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>}
      {mode === 'COUNT' && <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Registra lo que ves, incluido cero. Supervisión revisará la diferencia. Si hubo otros movimientos, será necesario actualizar y volver a contar.</p>}
      <button type="button" onClick={() => void save()} disabled={saving || !quantity || !Number.isFinite(baseQuantity) || baseQuantity < 0 || (mode !== 'COUNT' && baseQuantity === 0) || (product.tracksLots && !lotNumber.trim()) || (mode === 'TRANSFER' && !targetWarehouse)} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-40">{saving ? <Loader2 size={21} className="animate-spin" /> : <Check size={21} />}{saving ? 'Guardando…' : 'Confirmar y seguir'}</button>
      {mode === 'OUT' && state.warehouses.length > 1 && <button type="button" onClick={() => setMode('TRANSFER')} className="flex min-h-12 w-full items-center justify-center gap-2 text-sm underline">Mover a otra bodega <ArrowRight size={15} /></button>}
      </>}</>}
    </div>}
    {scanner && <CameraScanner onCode={scanned} onClose={() => setScanner(false)} />}
  </div>;
}
