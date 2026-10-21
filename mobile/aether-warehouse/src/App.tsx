import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import { WarehouseClient, WarehouseConnectionError, projectedQuantity } from '../../../src/lib/warehouse/local';
import { normalizeWarehouseLot, roundQuantity, type WarehouseLocalState, type WarehouseOperation } from '../../../src/lib/warehouse/contracts';
import { matchWarehouseCode, readLabelText } from '../../../src/lib/warehouse/labels';
import { createNativeStore } from './storage';
import { nativeTransport } from './transport';
import NativeWarehouse from '../modules/aether-warehouse';

const colors = { ink: '#12161f', gold: '#dbc076', paper: '#f7f7f4', card: '#ffffff', line: '#e2e3de', muted: '#636970', danger: '#a52b36', success: '#216446' };
type Mode = 'IN' | 'OUT' | 'TRANSFER' | 'COUNT' | 'LOOKUP';
const titles: Record<Mode, string> = { IN: 'Entrar mercadería', OUT: 'Sacar mercadería', TRANSFER: 'Trasladar mercadería', COUNT: 'Contar existencias', LOOKUP: 'Consultar existencias' };
const labels = { LOCAL: 'Guardado en este teléfono', REVIEW: 'Pendiente de aprobación', CONFLICT: 'Requiere revisión', APPLIED: 'Confirmado en Aether', REJECTED: 'No aplicado' };
const format = (quantity: number) => quantity.toLocaleString('es-CL', { maximumFractionDigits: 6 });
function Action({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && { opacity: 0.45 }]}><Text style={[styles.buttonText, secondary && { color: colors.ink }]}>{title}</Text></Pressable>;
}
function WarehouseApp() {
  const [state, setState] = useState<WarehouseLocalState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(true);
  const [login, setLogin] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [history, setHistory] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [factor, setFactor] = useState(1);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [receiptItemId, setReceiptItemId] = useState('');
  const [reason, setReason] = useState('Consumo interno');
  const [cameraMode, setCameraMode] = useState<'SCAN' | 'PHOTO' | null>(null);
  const [reading, setReading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const client = useRef<WarehouseClient | null>(null);
  const camera = useRef<CameraView>(null);
  const syncing = useRef(false);
  const origin = typeof Constants.expoConfig?.extra?.platformUrl === 'string' ? Constants.expoConfig.extra.platformUrl : '';
  const validOrigin = /^https:\/\/[^/]+$/.test(origin);
  const sync = useCallback(async (fullRefresh = true) => {
    if (!client.current || syncing.current) return;
    syncing.current = true; setBusy(true);
    try { setState(await client.current.synchronize(fullRefresh)); setError(''); setLogin(false); }
    catch (problem) {
      if (problem instanceof WarehouseConnectionError && [401, 403].includes(problem.status)) { setState(null); setLogin(true); }
      setError(problem instanceof Error ? problem.message : 'No se pudo conectar con Aether');
    } finally { syncing.current = false; setBusy(false); setLoading(false); }
  }, []);
  useEffect(() => {
    let disposed = false;
    void createNativeStore().then(async (store) => {
      if (disposed) return;
      client.current = new WarehouseClient(store, nativeTransport, () => Crypto.randomUUID());
      try { const local = await client.current.current(); if (!disposed) setState(local); }
      catch (problem) { if (!disposed) setError(problem instanceof Error ? problem.message : 'Vuelve a iniciar sesión'); }
      const network = await Network.getNetworkStateAsync();
      if (!disposed) { setOnline(Boolean(network.isConnected)); setLoading(false); if (network.isConnected && validOrigin) void sync(); }
    }).catch((problem: unknown) => { if (!disposed) { setError(problem instanceof Error ? problem.message : 'No se pudo abrir el almacenamiento local'); setLoading(false); } });
    const network = Network.addNetworkStateListener((value) => { setOnline(Boolean(value.isConnected)); if (value.isConnected && client.current && validOrigin) void sync(false); });
    const app = AppState.addEventListener('change', (value) => {
      if (value !== 'active') return;
      void client.current?.current().then((local) => { if (!disposed) setState(local); }).catch((problem: unknown) => { setState(null); setError(problem instanceof Error ? problem.message : 'Vuelve a iniciar sesión'); });
      if (validOrigin) void sync(false);
    });
    const interval = setInterval(() => { void client.current?.current().then((local) => { if (local?.operations.some((row) => row.status === 'LOCAL') && AppState.currentState === 'active' && validOrigin) void sync(false); }).catch(() => { setState(null); setError('La sesión local venció. Conecta con Aether; tus registros están guardados.'); }); }, 60_000);
    return () => { disposed = true; network.remove(); app.remove(); clearInterval(interval); };
  }, [sync, validOrigin]);
  const warehouse = state?.warehouses.find((row) => row.id === warehouseId) ?? state?.warehouses[0];
  const product = state?.products.find((row) => row.id === productId);
  const lots = product?.lots.filter((row) => row.warehouseId === warehouse?.id).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')) ?? [];
  const receiptItems = state?.orders.flatMap((order) => order.items.filter((row) => row.productId === productId).map((row) => ({ ...row, orderId: order.id, label: `OC #${order.folio} · ${order.supplier} · faltan ${format(row.remaining)}` }))) ?? [];
  const reset = () => { setProductId(''); setQuantity(''); setLotNumber(''); setExpiryDate(''); setFactor(1); setQuery(''); setReceiptItemId(''); };
  const changeUser = async () => {
    if (!online || busy) { setError('Necesitas conexión y terminar la sincronización para cambiar de cuenta. Tus pendientes se conservarán.'); return; }
    setBusy(true);
    try {
      await client.current?.lock();
      await nativeTransport.request('/api/auth/signout', {});
      setState(null); setLogin(true);
    } catch (problem) { setState(null); setError(problem instanceof Error ? problem.message : 'Conecta con Aether para volver a iniciar sesión'); }
    finally { setBusy(false); }
  };
  const code = (raw: string) => {
    setCameraMode(null);
    const match = matchWarehouseCode(state?.products ?? [], raw);
    if (!match) { setQuery(raw); setNotice('Código no encontrado. Busca el producto o actualiza el catálogo.'); return; }
    reset(); setProductId(match.product.id); setFactor(match.factor);
    setLotNumber(match.reading.lotNumber ?? ''); setExpiryDate(match.reading.expiryDate ?? '');
    if (match.reading.weightKg !== undefined && match.product.unit === 'KG') { setFactor(1); setQuantity(String(match.reading.weightKg)); }
    setNotice('Código reconocido. Confirma el lote y la cantidad real.');
  };
  const openCamera = async (next: 'SCAN' | 'PHOTO') => {
    if (!permission?.granted && !(await requestPermission()).granted) { setError('Permite el acceso a la cámara en los ajustes del teléfono'); return; }
    setCameraMode(next);
  };
  const photo = async () => {
    if (!camera.current || reading) return;
    setReading(true);
    let uri: string | undefined;
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      if (!picture) throw new Error('No se pudo tomar la fotografía');
      uri = picture.uri;
      const text = await NativeWarehouse.recognize(uri);
      const result = readLabelText(text);
      if (!product) {
        const matches = text.split(/\s+/).map((token) => matchWarehouseCode(state?.products ?? [], token)).filter((match) => match !== null);
        const ids = [...new Set(matches.map((match) => match.product.id))];
        if (ids.length === 1) { setProductId(ids[0]); setFactor(1); }
      }
      if (result.lotNumber) setLotNumber(result.lotNumber);
      if (result.expiryDate) setExpiryDate(result.expiryDate);
      if (product?.unit === 'KG' && result.weightKg !== undefined) { setFactor(1); setQuantity(String(result.weightKg)); }
      setNotice(result.lotNumber || result.expiryDate ? 'Etiqueta leída en el teléfono. Revisa los datos antes de confirmar.' : 'Acerca la etiqueta o completa los datos que no se distinguieron.');
      setCameraMode(null);
    } catch { setError('No se pudo leer la etiqueta. Mejora la luz, enfoca o completa los datos manualmente.'); }
    finally { if (uri) { try { new File(uri).delete(); } catch { /* Foto temporal; no se sube ni forma parte de la cola. */ } } setReading(false); }
  };
  const save = async () => {
    if (!client.current || !state || !product || !warehouse || !mode || mode === 'LOOKUP' || saving) return;
    setSaving(true);
    try {
      const receipt = receiptItems.find((row) => row.id === receiptItemId);
      const stock = product.stocks.find((row) => row.warehouseId === warehouse.id);
      const lot = lots.find((row) => row.lotNumber === normalizeWarehouseLot(lotNumber));
      const kind: WarehouseOperation['kind'] = mode === 'IN' && receipt ? 'RECEIPT' : mode;
      const input: Omit<WarehouseOperation, 'id' | 'deviceId' | 'capturedAt' | 'protocol'> = {
        kind, warehouseId: warehouse.id, productId: product.id, quantity: roundQuantity(Number(quantity.replace(',', '.')) * factor),
        ...(product.tracksLots && lotNumber.trim() ? { lotNumber: lotNumber.trim() } : {}),
        ...(expiryDate && ['IN', 'COUNT'].includes(mode) ? { expiryDate } : {}),
        ...(mode === 'TRANSFER' ? { targetWarehouseId } : {}),
        ...(kind === 'RECEIPT' && receipt ? { orderId: receipt.orderId, orderItemId: receipt.id } : {}),
        ...(mode === 'COUNT' ? { baseline: { stockUpdatedAt: stock?.updatedAt ?? null, lotUpdatedAt: lot?.updatedAt ?? null } } : {}),
        note: mode === 'OUT' ? reason : mode === 'COUNT' ? 'Conteo físico del operario' : mode === 'TRANSFER' ? 'Traslado entre bodegas' : kind === 'RECEIPT' ? 'Recepción contra orden de compra' : 'Ingreso sin orden; requiere revisión y valoración',
      };
      setState(await client.current.capture(input)); reset(); setNotice('Guardado en este teléfono. Continúa con el próximo producto.'); setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar. Mantén los datos y vuelve a intentar.'); }
    finally { setSaving(false); }
    if (online) void sync(false);
  };
  if (login && validOrigin) return <SafeAreaView style={styles.page}><View style={styles.header}><Text style={styles.title}>Iniciar sesión en Aether</Text><Action title="Cerrar" secondary onPress={() => setLogin(false)} /></View><WebView source={{ uri: `${origin}/login` }} sharedCookiesEnabled thirdPartyCookiesEnabled javaScriptEnabled domStorageEnabled originWhitelist={['https://*']} onShouldStartLoadWithRequest={(request) => {
    if (!request.isTopFrame) return request.url.startsWith(origin + '/') || request.url.startsWith('https://challenges.cloudflare.com/');
    if (!request.url.startsWith(origin + '/')) return false;
    const url = new URL(request.url);
    if (url.pathname === '/dashboard' || url.pathname === '/bodega') { setLogin(false); setTimeout(() => void sync(), 300); return false; }
    return true;
  }} /></SafeAreaView>;
  if (cameraMode) return <SafeAreaView style={styles.page}><View style={styles.header}><Text style={styles.title}>{cameraMode === 'SCAN' ? 'Escanear código' : 'Fotografiar etiqueta'}</Text><Action title="Cerrar cámara" secondary disabled={reading} onPress={() => setCameraMode(null)} /></View><CameraView ref={camera} style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'datamatrix', 'qr'] }} onBarcodeScanned={cameraMode === 'SCAN' ? (event) => code(event.data) : undefined} /><View style={styles.header}><Text style={styles.muted}>{cameraMode === 'SCAN' ? 'Centra un solo código. Se detendrá al reconocerlo.' : 'Acerca la etiqueta y comprueba que se vea enfocada. La foto no se sube.'}</Text>{cameraMode === 'PHOTO' && <Action title={reading ? 'Leyendo en el teléfono…' : 'Leer etiqueta'} disabled={reading} onPress={() => void photo()} />}</View></SafeAreaView>;
  if (loading) return <SafeAreaView style={[styles.page, styles.center]}><ActivityIndicator size="large" color={colors.ink} /><Text style={styles.muted}>Preparando tu bodega…</Text></SafeAreaView>;
  if (!state) return <SafeAreaView style={styles.page}><View style={styles.header}><Text style={styles.brand}>AETHER / BODEGA</Text><Text style={styles.hero}>Tu bodega, a mano</Text><Text style={styles.muted}>Prepara este teléfono con conexión. Después podrás trabajar aunque pierdas señal.</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{!validOrigin ? <Text style={styles.error}>La compilación necesita EXPO_PUBLIC_AETHER_URL con el dominio HTTPS de tu plataforma.</Text> : <><Action title="Iniciar sesión" onPress={() => setLogin(true)} /><Action title={busy ? 'Conectando…' : 'Conectar con Aether'} disabled={busy} secondary onPress={() => void sync()} /></>}<Text style={styles.small}>Los pendientes se conservan al vencer tu sesión. Inicia sesión con la misma cuenta para enviarlos.</Text></View></SafeAreaView>;

  const pending = state.operations.filter((row) => row.status === 'LOCAL').length;
  const visibleProducts = state.products.filter((row) => `${row.name} ${row.sku} ${row.barcode ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.row}><Text style={styles.brand}>AETHER / BODEGA</Text><Text style={styles.small}>{online ? '● Con conexión' : '○ Sin señal'}</Text></View><Text style={styles.small}>{state.identity.companyName} · {state.identity.userName}</Text><Text style={styles.hero}>{history ? 'Tus registros' : mode ? titles[mode] : '¿Qué vas a hacer?'}</Text><Text style={styles.label}>Bodega de trabajo</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{state.warehouses.map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityState={{ selected: row.id === warehouse?.id }} onPress={() => { setWarehouseId(row.id); reset(); }} style={[styles.chip, row.id === warehouse?.id && styles.selected]}><Text>{row.name}</Text></Pressable>)}</ScrollView><View style={styles.card}><Text style={styles.label}>{pending} por sincronizar</Text><Text style={styles.small}>Actualizado {new Date(state.refreshedAt).toLocaleString('es-CL')}</Text><Action title={busy ? 'Sincronizando…' : 'Actualizar y sincronizar'} secondary disabled={busy || !online} onPress={() => void sync()} /></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    <View style={styles.row}><Action title={mode || history ? '← Volver' : 'Ver registros'} secondary onPress={() => { if (mode || history) { setMode(null); setHistory(false); reset(); } else setHistory(true); }} /><Action title="Cuenta" secondary disabled={busy} onPress={() => Alert.alert(state.identity.userName, 'Al cambiar de cuenta se conservaran los registros pendientes de este usuario.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Cambiar usuario', onPress: () => { void changeUser(); } }])} /></View>
    {!mode && !history && <><View style={styles.grid}>{(['IN', 'OUT', 'COUNT', 'LOOKUP'] as const).map((next) => <Pressable accessibilityRole="button" key={next} disabled={!state.identity.canOperate && next !== 'LOOKUP'} onPress={() => { reset(); setNotice(''); setMode(next); }} style={styles.tile}><Text style={styles.tileIcon}>{next === 'IN' ? '↓' : next === 'OUT' ? '↑' : next === 'COUNT' ? '✓' : '⌕'}</Text><Text style={styles.title}>{next === 'IN' ? 'Entrar' : next === 'OUT' ? 'Sacar' : next === 'COUNT' ? 'Contar' : 'Consultar'}</Text><Text style={styles.small}>{titles[next]}</Text></Pressable>)}</View><Text style={styles.muted}>Lectura de etiquetas y almacenamiento cifrado incluidos. Las fotos se procesan en este teléfono y se eliminan después de leerlas.</Text><Text style={styles.small}>Al cerrar el turno comprueba que no queden pendientes. Los movimientos de otros teléfonos se conocen al actualizar.</Text></>}
    {history && (state.operations.length ? [...state.operations].reverse().map((entry) => <View style={styles.card} key={entry.payload.id}><Text style={styles.title}>{state.products.find((row) => row.id === entry.payload.productId)?.name ?? entry.payload.productId}</Text><Text>{format(entry.payload.quantity)} · {entry.payload.kind}{entry.payload.lotNumber ? ` · lote ${entry.payload.lotNumber}` : ''}</Text><Text style={{ color: entry.status === 'APPLIED' ? colors.success : colors.ink, fontWeight: '600' }}>{labels[entry.status]}</Text><Text style={styles.small}>{entry.message}</Text><Text style={styles.small}>{new Date(entry.payload.capturedAt).toLocaleString('es-CL')}</Text></View>) : <Text style={styles.muted}>Aún no hay registros en este teléfono.</Text>)}
    {mode && <><View style={styles.row}><Action title="Escanear código" onPress={() => void openCamera('SCAN')} /><Action title="Foto etiqueta" secondary onPress={() => void openCamera('PHOTO')} /></View>{!product ? <><TextInput accessibilityLabel="Buscar producto o código" style={styles.input} value={query} onChangeText={setQuery} onSubmitEditing={() => code(query)} placeholder="Producto, SKU o código" />{visibleProducts.map((row) => <Pressable accessibilityRole="button" style={styles.card} key={row.id} onPress={() => { reset(); setProductId(row.id); }}><Text style={styles.title}>{row.name}</Text><Text style={styles.small}>{row.sku} · {format(projectedQuantity(state, row.id, warehouse?.id ?? ''))} {row.unit}</Text></Pressable>)}{visibleProducts.length === 0 && <Text style={styles.muted}>No hay coincidencias en el catálogo descargado.</Text>}</> : <><View style={styles.card}><Text style={styles.small}>{product.sku}</Text><Text style={styles.title}>{product.name}</Text><Text>{format(projectedQuantity(state, product.id, warehouse?.id ?? ''))} {product.unit} disponibles en este teléfono</Text><Action title="Cambiar producto" secondary onPress={reset} /></View>{mode === 'LOOKUP' ? lots.map((lot) => <View key={lot.lotNumber} style={styles.card}><Text style={styles.label}>Lote {lot.lotNumber}</Text><Text>{format(projectedQuantity(state, product.id, warehouse?.id ?? '', lot.lotNumber))} {product.unit}</Text><Text style={styles.small}>Vence: {lot.expiryDate?.slice(0, 10) ?? 'Sin fecha'}</Text></View>) : <>
    {product.tracksLots && <><Text style={styles.label}>Lote físico</Text><TextInput accessibilityLabel="Lote físico" style={styles.input} value={lotNumber} onChangeText={setLotNumber} maxLength={40} autoCapitalize="characters" placeholder="Escanea, fotografía o indica el lote" />{lots.length > 0 && <ScrollView horizontal contentContainerStyle={styles.chips}>{lots.map((lot) => <Pressable accessibilityRole="button" style={[styles.chip, lotNumber === lot.lotNumber && styles.selected]} key={lot.lotNumber} onPress={() => { setLotNumber(lot.lotNumber); setExpiryDate(lot.expiryDate?.slice(0, 10) ?? ''); }}><Text>{lot.lotNumber} · {format(lot.quantity)}</Text></Pressable>)}</ScrollView>}{['IN', 'COUNT'].includes(mode) && <><Text style={styles.label}>Vencimiento, si aparece en la etiqueta</Text><TextInput accessibilityLabel="Vencimiento en formato año mes día" style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="AAAA-MM-DD" autoCapitalize="none" maxLength={10} /></>}</>}
    {mode === 'IN' && <><Text style={styles.label}>Origen del ingreso</Text><Action title={receiptItemId ? 'Recibir sin orden: requiere aprobación' : 'Sin orden: se enviará a revisión'} secondary onPress={() => setReceiptItemId('')} />{state.identity.canReceive && receiptItems.map((item) => <Pressable accessibilityRole="button" key={item.id} style={[styles.chip, item.id === receiptItemId && styles.selected]} onPress={() => setReceiptItemId(item.id)}><Text>{item.label}</Text></Pressable>)}</>}
    <Text style={styles.label}>{mode === 'COUNT' ? 'Cantidad contada, incluido cero' : 'Cantidad'}</Text><TextInput accessibilityLabel="Cantidad" style={[styles.input, { fontSize: 24, fontWeight: '600' }]} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" /><ScrollView horizontal contentContainerStyle={styles.chips}><Pressable accessibilityRole="button" style={[styles.chip, factor === 1 && styles.selected]} onPress={() => setFactor(1)}><Text>{product.unit} · base</Text></Pressable>{product.packagings.map((packaging) => <Pressable accessibilityRole="button" style={[styles.chip, factor === packaging.factor && styles.selected]} key={packaging.id} onPress={() => setFactor(packaging.factor)}><Text>{packaging.name} · x{format(packaging.factor)}</Text></Pressable>)}</ScrollView><Text style={styles.small}>Se registrarán {format(roundQuantity(Number(quantity.replace(',', '.')) * factor) || 0)} {product.unit}.</Text>
    {mode === 'OUT' && <><Text style={styles.label}>Motivo de salida interna</Text>{['Consumo interno', 'Merma o daño', 'Entrega interna'].map((item) => <Pressable accessibilityRole="button" key={item} style={[styles.chip, reason === item && styles.selected]} onPress={() => setReason(item)}><Text>{item}</Text></Pressable>)}<Text style={styles.small}>Los despachos de ventas se registran desde su documento de venta.</Text>{state.warehouses.length > 1 && <Action title="Mover a otra bodega →" secondary onPress={() => setMode('TRANSFER')} />}</>}
    {mode === 'TRANSFER' && <><Text style={styles.label}>Bodega de destino</Text>{state.warehouses.filter((row) => row.id !== warehouse?.id).map((row) => <Pressable accessibilityRole="button" style={[styles.chip, targetWarehouseId === row.id && styles.selected]} key={row.id} onPress={() => setTargetWarehouseId(row.id)}><Text>{row.name}</Text></Pressable>)}</>}
    {mode === 'COUNT' && <Text style={styles.notice}>El conteo será revisado antes de ajustar. Si hubo movimientos desde la actualización, será necesario volver a contar.</Text>}<Action title={saving ? 'Guardando…' : 'Confirmar y seguir'} disabled={saving || !quantity || (product.tracksLots && !lotNumber.trim()) || (mode === 'TRANSFER' && !targetWarehouseId)} onPress={() => void save()} /></>}</>}</>}
  </ScrollView></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><WarehouseApp /></SafeAreaProvider>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper }, content: { padding: 20, gap: 14, paddingBottom: 48, maxWidth: 650, width: '100%', alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 20 }, header: { padding: 20, gap: 14 }, brand: { fontWeight: '800', letterSpacing: 2, color: colors.ink, fontSize: 13 },
  hero: { fontSize: 29, fontWeight: '700', color: colors.ink, marginVertical: 5 }, title: { fontSize: 18, fontWeight: '600', color: colors.ink }, label: { fontWeight: '600', fontSize: 14, color: colors.ink },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  button: { minHeight: 52, backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }, buttonText: { color: colors.gold, fontWeight: '600', fontSize: 14, textAlign: 'center' },
  card: { padding: 16, gap: 9, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 16 }, input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, backgroundColor: colors.card, color: colors.ink, fontSize: 16 },
  chips: { gap: 8 }, chip: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 12, justifyContent: 'center', backgroundColor: colors.card }, selected: { borderColor: colors.ink, backgroundColor: colors.gold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, tile: { width: '47%', minHeight: 165, padding: 17, borderColor: colors.line, borderWidth: 1, borderRadius: 18, backgroundColor: colors.card, gap: 12 }, tileIcon: { fontSize: 34, color: colors.ink },
  error: { color: colors.danger, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, padding: 14, borderRadius: 12, lineHeight: 21 }, notice: { backgroundColor: colors.card, padding: 14, borderRadius: 12, color: colors.ink, lineHeight: 21 },
});
