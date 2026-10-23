import { codeVariants, isValidGtin, looksLikeCode, normalizeScannedCode, plausibleSku, skuForCatalog, skuKey, trustedGtin } from '@/lib/warehouse-mobile/codes';
import { buildMovementNote, isInboundMode, isTransferMode, MODE_DEFINITIONS, MOBILE_MODES, WASTE_REASONS, WASTE_REASON_LABELS, WASTE_REASON_HINTS, reasonRequiresNote, wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { composeProductName, normalizeVisionRead, thinkingFor, toDisplayCase } from '@/lib/warehouse-mobile/vision';
import { decideMatch, parseNetContent, rankCandidates, scoreTextMatch, searchTermsFor, tokenize } from '@/lib/warehouse-mobile/match';
import {
  BUDGET_WINDOW_MS,
  DEFAULT_VISION_BUDGET,
  evaluateVisionBudget,
  visionBudgetFromEnv,
  visionEnabledFromEnv,
  type VisionRunRow,
} from '@/lib/warehouse-mobile/budget';
import { formatAutoSku, nextAutoSku, parseAutoSku } from '@/lib/warehouse-mobile/sku';
import {
  applyOpResult,
  createOutboxEntry,
  failedAttempt,
  nextWakeAt,
  pickDue,
  pruneDone,
  recoverInterrupted,
  retryDelayMs,
  summarizeOutbox,
  DONE_RETENTION_MS,
} from '@/lib/warehouse-mobile/outbox';
import { prefersWarehouseApp } from '@/lib/auth/landing';
import { createProductOpSchema, moveOpSchema, syncOperationSchema, newProductSchema } from '@/modules/warehouse-mobile/schema';
import type { AppliedOpResult } from '@/modules/warehouse-mobile/types';

describe('códigos leídos por cámara o lector', () => {
  it('limpia espacios y caracteres de control que agregan algunos lectores', () => {
    expect(normalizeScannedCode('  7801234567895\r\n')).toBe('7801234567895');
    expect(normalizeScannedCode('AB 12\u0000')).toBe('AB12');
    expect(normalizeScannedCode('x'.repeat(200))).toHaveLength(64);
  });

  it('valida el dígito verificador de EAN-13, UPC-A y EAN-8', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('123')).toBe(false);
    expect(isValidGtin('40063813339AB')).toBe(false);
  });

  it('un UPC-A y su EAN-13 con cero adelante se buscan como el mismo código', () => {
    expect(codeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
    expect(codeVariants('0036000291452')).toEqual(['0036000291452', '036000291452']);
    expect(codeVariants('PRD-000123')).toEqual(['PRD-000123']);
    expect(codeVariants('   ')).toEqual([]);
  });

  it('distingue un código de una frase para decidir cómo buscar', () => {
    expect(looksLikeCode('4006381333931')).toBe(true);
    expect(looksLikeCode('PRD-000123')).toBe(true);
    expect(looksLikeCode('aceite de maravilla')).toBe(false);
    expect(looksLikeCode('ab')).toBe(false);
    expect(looksLikeCode('aceite')).toBe(false);
  });

  it('la IA solo puede aportar un código de barras con dígito verificador válido', () => {
    expect(trustedGtin('4006381333931')).toBe('4006381333931');
    expect(trustedGtin('4006 3813 33931')).toBe('4006381333931');
    expect(trustedGtin('4006381333930')).toBeNull();
    expect(trustedGtin(undefined)).toBeNull();
  });
});

describe('modos de movimiento', () => {
  it('cada modo tiene definición y se traduce a un tipo del kardex', () => {
    for (const mode of MOBILE_MODES) expect(MODE_DEFINITIONS[mode].mode).toBe(mode);
    expect(MODE_DEFINITIONS.RECEIVE.movement).toBe('PURCHASE_IN');
    expect(MODE_DEFINITIONS.WASTE.movement).toBe('ADJUSTMENT_OUT');
    expect(MODE_DEFINITIONS.TRANSFER.movement).toBe('TRANSFER');
    expect(isInboundMode('RETURN')).toBe(true);
    expect(isInboundMode('WASTE')).toBe(false);
    expect(isTransferMode('TRANSFER')).toBe(true);
  });

  it('nunca ofrece salida por venta desde el celular', () => {
    const movements = MOBILE_MODES.map((mode) => MODE_DEFINITIONS[mode].movement as string);
    expect(movements).not.toContain('SALE_OUT');
  });

  it('el texto del kardex dice de dónde vino y por qué', () => {
    expect(buildMovementNote({ mode: 'WASTE', reason: 'EXPIRED', note: 'pasillo 3' })).toBe('App bodega · Salida o merma · Vencido — pasillo 3');
    expect(buildMovementNote({ mode: 'RECEIVE' })).toBe('App bodega · Llegada de mercadería');
  });

  it('avisa la hora de captura solo cuando el envío se retrasó (sin señal)', () => {
    const now = new Date('2026-10-22T15:00:00Z');
    expect(buildMovementNote({ mode: 'RECEIVE', capturedAt: '2026-10-22T14:58:00Z', now })).not.toContain('registrado en bodega');
    expect(buildMovementNote({ mode: 'RECEIVE', capturedAt: '2026-10-22T13:00:00Z', now })).toContain('registrado en bodega el');
    expect(buildMovementNote({ mode: 'RECEIVE', capturedAt: 'no-es-fecha', now })).toBe('App bodega · Llegada de mercadería');
  });

  it('corta el texto libre largo', () => {
    expect(buildMovementNote({ mode: 'SURPLUS', note: 'x'.repeat(1000) }).length).toBeLessThan(400);
  });
});

const EVIDENCE = 'https://cdn.test.example/inventory-evidence/c1/bodega-op.jpg';

describe('contrato de operaciones', () => {
  const base = { clientOpId: 'op-12345678', productId: 'p1', warehouseId: 'w1', quantity: 5 };

  it('acepta una llegada simple y una merma con motivo', () => {
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base }).success).toBe(true);
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'WASTE', reason: 'DAMAGED', evidenceUrl: EVIDENCE, ...base }).success).toBe(true);
  });

  it('una salida sin foto de respaldo se rechaza; un faltante no la necesita', () => {
    const waste = moveOpSchema.safeParse({ kind: 'MOVE', mode: 'WASTE', reason: 'DAMAGED', ...base });
    expect(waste.success).toBe(false);
    expect(waste.error?.issues.map((issue) => issue.message)).toContain('Adjunta una foto del producto');
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'SHORTAGE', ...base }).success).toBe(true);
  });

  it('acepta todos los motivos de salida; "Otro motivo" necesita explicación', () => {
    for (const reason of WASTE_REASONS) {
      const op = { kind: 'MOVE', mode: 'WASTE', reason, evidenceUrl: EVIDENCE, note: 'detalle', ...base };
      expect(moveOpSchema.safeParse(op).success).toBe(true);
    }
    const other = { kind: 'MOVE', mode: 'WASTE', reason: 'OTHER', evidenceUrl: EVIDENCE, ...base };
    expect(moveOpSchema.safeParse(other).success).toBe(false);
    expect(moveOpSchema.safeParse({ ...other, note: 'Se cayó del camión' }).success).toBe(true);
    expect(moveOpSchema.safeParse({ ...other, reason: 'INVENTADO', note: 'x' }).success).toBe(false);
  });

  it('la llegada admite el proveedor, y el alta de un producto nuevo también', () => {
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', supplierId: 'prov-1', ...base }).success).toBe(true);
    const created = createProductOpSchema.safeParse({ kind: 'CREATE_PRODUCT', clientOpId: 'op-87654321', mode: 'RECEIVE', warehouseId: 'w1', quantity: 3, supplierId: 'prov-1', product: { name: 'Fideos Carozzi 400 g' } });
    expect(created.success).toBe(true);
  });

  it('una merma sin motivo y un traslado sin destino se rechazan', () => {
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'WASTE', ...base }).success).toBe(false);
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'TRANSFER', ...base }).success).toBe(false);
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'TRANSFER', targetWarehouseId: 'w1', ...base }).success).toBe(false);
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'TRANSFER', targetWarehouseId: 'w2', ...base }).success).toBe(true);
  });

  it('rechaza cantidades inválidas, con más de 3 decimales o exageradas', () => {
    for (const quantity of [0, -1, 1_000_001, 1.2345, Number.NaN]) {
      expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base, quantity }).success).toBe(false);
    }
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base, quantity: 2.5 }).success).toBe(true);
  });

  it('exige una clave de operación razonable', () => {
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base, clientOpId: 'corta' }).success).toBe(false);
    expect(moveOpSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base, clientOpId: 'con espacios y ñ' }).success).toBe(false);
  });

  it('un producto nuevo trae lo mínimo y completa unidad por defecto', () => {
    const parsed = newProductSchema.parse({ name: 'Aceite de Maravilla Chef 900 ml' });
    expect(parsed.unit).toBe('UN');
    expect(newProductSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(newProductSchema.safeParse({ name: 'Producto', barcode: 'con espacio' }).success).toBe(false);
    expect(newProductSchema.safeParse({ name: 'Producto', sku: 'sku con espacio' }).success).toBe(false);
  });

  it('crear un producto solo se permite como llegada o inventario inicial', () => {
    const create = { kind: 'CREATE_PRODUCT', clientOpId: 'op-12345678', warehouseId: 'w1', quantity: 3, product: { name: 'Producto nuevo' } };
    expect(createProductOpSchema.safeParse({ ...create, mode: 'RECEIVE' }).success).toBe(true);
    expect(createProductOpSchema.safeParse({ ...create, mode: 'SURPLUS' }).success).toBe(true);
    expect(createProductOpSchema.safeParse({ ...create, mode: 'WASTE' }).success).toBe(false);
  });

  it('el esquema unificado distingue las operaciones por su tipo', () => {
    expect(syncOperationSchema.safeParse({ kind: 'OTRA', clientOpId: 'op-12345678' }).success).toBe(false);
    expect(syncOperationSchema.safeParse({ kind: 'MOVE', mode: 'RECEIVE', ...base }).success).toBe(true);
  });
});

describe('lectura de la foto por IA', () => {
  it('descarta lo que no es un producto o no tiene nada legible', () => {
    expect(normalizeVisionRead({ isProduct: false, confidence: 'high', warnings: [] })).toBeNull();
    expect(normalizeVisionRead({ isProduct: true, confidence: 'low', warnings: [] })).toBeNull();
    expect(normalizeVisionRead('basura')).toBeNull();
    expect(normalizeVisionRead(null)).toBeNull();
  });

  it('pasa las etiquetas en MAYÚSCULAS a un nombre legible y respeta el resto', () => {
    expect(toDisplayCase('ACEITE DE MARAVILLA')).toBe('Aceite de Maravilla');
    expect(toDisplayCase('Aceite de Maravilla')).toBe('Aceite de Maravilla');
    expect(toDisplayCase('900 ml')).toBe('900 ml');
  });

  it('limpia el resultado y nunca confía en un código de barras mal leído', () => {
    const read = normalizeVisionRead({
      isProduct: true,
      name: '  ACEITE   DE MARAVILLA ',
      brand: 'CHEF',
      netContent: '900 ml',
      unit: 'LITROS',
      barcode: '7801234567890',
      expiryDate: '2027-03-15',
      lotNumber: 'L2401',
      confidence: 'high',
      warnings: ['etiqueta arrugada'],
    });
    expect(read).toMatchObject({ name: 'Aceite de Maravilla', brand: 'Chef', unit: 'UN', netContent: '900 ml', lotNumber: 'L2401', expiryDate: '2027-03-15', confidence: 'high' });
    // 7801234567890 no tiene dígito verificador válido: se descarta, no se corrige.
    expect(read?.barcode).toBeNull();
  });

  it('acepta un código válido y descarta fechas absurdas', () => {
    const read = normalizeVisionRead({ isProduct: true, name: 'Lápiz', barcode: '4006381333931', expiryDate: '1850-01-01', confidence: 'medium', warnings: [] });
    expect(read?.barcode).toBe('4006381333931');
    expect(read?.expiryDate).toBeNull();
  });

  it('tolera campos nulos y confianza inválida del modelo', () => {
    const read = normalizeVisionRead({ isProduct: true, name: 'Sal', brand: null, confidence: 'altísima', warnings: 'no es lista' });
    expect(read).toMatchObject({ name: 'Sal', brand: null, confidence: 'low', warnings: [] });
  });

  it('arma el nombre sugerido sin repetir marca ni contenido', () => {
    expect(composeProductName({ name: 'Aceite de Maravilla', brand: 'Chef', variant: null, netContent: '900 ml' })).toBe('Aceite de Maravilla Chef 900 ml');
    expect(composeProductName({ name: 'Aceite Chef 900 ml', brand: 'Chef', variant: null, netContent: '900 ml' })).toBe('Aceite Chef 900 ml');
    expect(composeProductName({ name: 'Yogurt', brand: 'Soprole', variant: 'Frutilla', netContent: null })).toBe('Yogurt Frutilla Soprole');
  });
});

describe('contenido neto', () => {
  it('entiende los formatos que se ven en las etiquetas chilenas', () => {
    expect(parseNetContent('900 ml')).toEqual({ amount: 900, kind: 'volume' });
    expect(parseNetContent('0,9 L')).toEqual({ amount: 900, kind: 'volume' });
    expect(parseNetContent('1 kg')).toEqual({ amount: 1000, kind: 'mass' });
    expect(parseNetContent('Arroz 500g')).toEqual({ amount: 500, kind: 'mass' });
    expect(parseNetContent('Bebida 6 x 330 ml')).toEqual({ amount: 1980, kind: 'volume' });
    expect(parseNetContent('Servilletas 100 un')).toEqual({ amount: 100, kind: 'count' });
    expect(parseNetContent('Jugo 1,5 lt')).toEqual({ amount: 1500, kind: 'volume' });
  });

  it('no inventa un contenido donde no lo hay', () => {
    expect(parseNetContent('Aceite de maravilla')).toBeNull();
    expect(parseNetContent(null)).toBeNull();
    expect(parseNetContent('Mesa 120 cm')).toBeNull();
  });
});

describe('cruce de la foto con el catálogo', () => {
  const subject = { name: 'Aceite de Maravilla', brand: 'Chef', variant: null, netContent: '900 ml' };
  const catalog = [
    { id: 'a', name: 'Aceite Maravilla Chef 900 ml', brand: 'Chef' },
    { id: 'b', name: 'Aceite Maravilla Chef 1 L', brand: 'Chef' },
    { id: 'c', name: 'Aceite de Oliva Chef 900 ml', brand: 'Chef' },
    { id: 'd', name: 'Aceite Maravilla Belmont 900 ml', brand: 'Belmont' },
    { id: 'e', name: 'Detergente Omo 3 kg', brand: 'Omo' },
  ];

  it('el mismo producto puntúa casi 1 aunque el nombre difiera en artículos', () => {
    expect(scoreTextMatch(subject, catalog[0]!)).toBeGreaterThanOrEqual(0.95);
  });

  it('otro tamaño del mismo producto NO se acepta como el mismo', () => {
    expect(scoreTextMatch(subject, catalog[1]!)).toBeLessThan(scoreTextMatch(subject, catalog[0]!) - 0.3);
    expect(scoreTextMatch(subject, catalog[1]!)).toBeLessThan(0.82);
  });

  it('otra marca o otro producto puntúa mucho menos', () => {
    expect(scoreTextMatch(subject, catalog[3]!)).toBeLessThan(0.65);
    expect(scoreTextMatch(subject, catalog[2]!)).toBeLessThan(0.7);
    expect(scoreTextMatch(subject, catalog[4]!)).toBe(0);
  });

  it('una coincidencia clara se propone sola; una ambigua pide elegir', () => {
    const clear = decideMatch(rankCandidates(subject, catalog));
    expect(clear.decision).toBe('matched');
    expect(clear.picks[0]?.item.id).toBe('a');

    const ambiguous = decideMatch(rankCandidates({ name: 'Aceite Maravilla', brand: null, variant: null, netContent: null }, catalog.slice(0, 2)));
    expect(ambiguous.decision).toBe('candidates');
    expect(ambiguous.picks.length).toBeGreaterThan(1);
  });

  it('un producto que no se parece a nada se ofrece como nuevo', () => {
    const result = decideMatch(rankCandidates({ name: 'Cuaderno universitario', brand: 'Torre', variant: null, netContent: null }, catalog));
    expect(result.decision).toBe('new');
    expect(result.picks).toEqual([]);
  });

  it('solo la marca leída nunca es un acierto', () => {
    expect(scoreTextMatch({ name: null, brand: 'Chef', variant: null, netContent: null }, catalog[0]!)).toBeLessThan(0.45);
  });

  it('ignora tildes, mayúsculas y plurales', () => {
    const fideos = { name: 'Fideos Espagueti', brand: 'Carozzi', variant: null, netContent: '400 g' };
    expect(scoreTextMatch(fideos, { name: 'FIDEO ESPAGUETI CAROZZI 400G', brand: 'Carozzi' })).toBeGreaterThanOrEqual(0.9);
    expect(tokenize('Azúcar Flor')).toEqual(['azucar', 'flor']);
  });

  it('las palabras para preseleccionar en la base no dependen de las tildes', () => {
    const terms = searchTermsFor({ name: 'Azúcar Flor', brand: 'Iansa', variant: null, netContent: '1 kg' });
    expect(terms).toContain('car');
    expect(terms).toContain('flor');
    expect(terms).toContain('iansa');
    expect(terms).not.toContain('1');
    expect(terms.length).toBeLessThanOrEqual(4);
  });
});

describe('cuota de la IA de fotos', () => {
  const now = 1_000_000_000_000;
  const run = (secondsAgo: number, overrides: Partial<VisionRunRow> = {}): VisionRunRow => ({
    createdAt: now - secondsAgo * 1000,
    status: 'DONE',
    companyId: 'c1',
    userId: 'u1',
    ...overrides,
  });
  const evaluate = (recent: VisionRunRow[], extra: { companyId?: string; userId?: string; companyDailyCount?: number } = {}) =>
    evaluateVisionBudget({ now, recent, companyId: extra.companyId ?? 'c1', userId: extra.userId ?? 'u1', companyDailyCount: extra.companyDailyCount ?? 0 });

  it('deja pasar cuando hay holgura', () => {
    expect(evaluate([])).toEqual({ allowed: true });
    expect(evaluate([run(10), run(20)])).toEqual({ allowed: true });
  });

  it('frena a una persona que fotografía en ráfaga y dice cuándo reintentar', () => {
    const decision = evaluate([run(5), run(15), run(30)]);
    expect(decision).toMatchObject({ allowed: false, scope: 'user' });
    // La más antigua (hace 30 s) sale de la ventana en 30 s.
    expect(decision.allowed === false && decision.retryAfterMs).toBe(30_000);
  });

  it('otra persona de la misma empresa sigue pasando hasta el tope de la empresa', () => {
    const recent = [run(5, { userId: 'u1' }), run(10, { userId: 'u1' }), run(15, { userId: 'u1' })];
    expect(evaluate(recent, { userId: 'u2' })).toEqual({ allowed: true });
    const four = [...recent, run(20, { userId: 'u2' })];
    expect(evaluate(four, { userId: 'u3' })).toMatchObject({ allowed: false, scope: 'company' });
  });

  it('una empresa ruidosa no deja a otra sin cuota mientras queda cupo de la plataforma', () => {
    const noisy = [run(2, { companyId: 'c1', userId: 'a' }), run(4, { companyId: 'c1', userId: 'b' }), run(6, { companyId: 'c1', userId: 'c' }), run(8, { companyId: 'c1', userId: 'd' })];
    expect(evaluate(noisy, { companyId: 'c2', userId: 'z' })).toEqual({ allowed: true });
  });

  it('el tope de la plataforma protege la cuota compartida de Gemini', () => {
    const everyone = Array.from({ length: DEFAULT_VISION_BUDGET.platformPerMinute }, (_, i) => run(5 + i, { companyId: `c${i}`, userId: `u${i}` }));
    expect(evaluate(everyone, { companyId: 'nueva', userId: 'nuevo' })).toMatchObject({ allowed: false, scope: 'platform' });
  });

  it('tras un 429 del proveedor frena a todos hasta terminar el enfriamiento', () => {
    const decision = evaluate([run(10, { status: 'LIMITED', companyId: 'otra', userId: 'x' })], { companyId: 'c9', userId: 'u9' });
    expect(decision).toMatchObject({ allowed: false, scope: 'cooldown' });
    expect(decision.allowed === false && decision.retryAfterMs).toBe(DEFAULT_VISION_BUDGET.cooldownAfterLimitMs - 10_000);
    expect(evaluate([run(60, { status: 'LIMITED' })])).toEqual({ allowed: true });
  });

  it('respeta el tope diario de la empresa', () => {
    expect(evaluate([], { companyDailyCount: DEFAULT_VISION_BUDGET.companyPerDay })).toMatchObject({ allowed: false, scope: 'daily' });
    expect(evaluate([], { companyDailyCount: DEFAULT_VISION_BUDGET.companyPerDay - 1 })).toEqual({ allowed: true });
  });

  it('nunca pide esperar menos de 2 segundos y lo viejo no cuenta', () => {
    const almostFree = [run(59.5), run(1), run(2)];
    const decision = evaluate(almostFree);
    expect(decision.allowed === false && decision.retryAfterMs).toBeGreaterThanOrEqual(2000);
    expect(evaluate([run(BUDGET_WINDOW_MS / 1000 + 1), run(70), run(80)])).toEqual({ allowed: true });
  });

  it('los topes se ajustan por variables de entorno y un valor absurdo cae al predeterminado', () => {
    expect(visionBudgetFromEnv({ WAREHOUSE_VISION_PLATFORM_RPM: '20', WAREHOUSE_VISION_USER_RPM: 'abc' })).toMatchObject({
      platformPerMinute: 20,
      userPerMinute: DEFAULT_VISION_BUDGET.userPerMinute,
    });
    expect(visionBudgetFromEnv({ WAREHOUSE_VISION_COMPANY_RPM: '-5' }).companyPerMinute).toBe(1);
    expect(visionEnabledFromEnv({})).toBe(true);
    expect(visionEnabledFromEnv({ WAREHOUSE_VISION_ENABLED: '0' })).toBe(false);
    expect(visionEnabledFromEnv({ WAREHOUSE_VISION_ENABLED: 'off' })).toBe(false);
  });
});

describe('SKU automático', () => {
  it('formatea con ceros y se puede leer de vuelta', () => {
    expect(formatAutoSku(1)).toBe('PRD-000001');
    expect(formatAutoSku(123456)).toBe('PRD-123456');
    expect(parseAutoSku('PRD-000042')).toBe(42);
    expect(parseAutoSku('ARR-001')).toBeNull();
  });

  it('toma el siguiente libre sin pisar SKU propios de la empresa', () => {
    expect(nextAutoSku([])).toBe('PRD-000001');
    expect(nextAutoSku(['ARR-001', 'PRD-000009', 'PRD-000003', 'x'])).toBe('PRD-000010');
    expect(nextAutoSku(['PRD-000009'], 2)).toBe('PRD-000012');
  });
});

describe('cola de envío del celular', () => {
  const now = 1_000_000;
  const op = (id: string) =>
    ({ kind: 'MOVE', clientOpId: id, mode: 'RECEIVE', productId: 'p1', warehouseId: 'w1', quantity: 2 }) as const;
  const applied = (id: string): AppliedOpResult => ({
    clientOpId: id,
    status: 'APPLIED',
    kind: 'MOVE',
    mode: 'RECEIVE',
    productId: 'p1',
    sku: 'S1',
    name: 'Producto',
    unit: 'UN',
    quantity: 2,
    warehouseId: 'w1',
    newStock: 5,
    createdProduct: false,
    mergedIntoExisting: false,
    replayed: false,
  });

  it('la espera crece al doble hasta un tope y respeta el pedido del servidor', () => {
    const fixed = { random: () => 0.5 };
    expect(retryDelayMs(0, fixed)).toBe(2000);
    expect(retryDelayMs(1, fixed)).toBe(4000);
    expect(retryDelayMs(2, fixed)).toBe(8000);
    expect(retryDelayMs(20, fixed)).toBe(300_000);
    expect(retryDelayMs(0, { ...fixed, hintMs: 30_000 })).toBe(30_000);
  });

  it('varía ±20 % para que muchos celulares no reintenten a la vez', () => {
    expect(retryDelayMs(1, { random: () => 0 })).toBe(3200);
    expect(retryDelayMs(1, { random: () => 0.999 })).toBeLessThanOrEqual(4800);
  });

  it('envía primero lo más antiguo y solo lo que ya toca', () => {
    const a = { ...createOutboxEntry(op('op-aaaaaaaa'), now - 30), nextAttemptAt: now - 10 };
    const b = { ...createOutboxEntry(op('op-bbbbbbbb'), now - 20), nextAttemptAt: now + 5000 };
    const c = { ...createOutboxEntry(op('op-cccccccc'), now - 40), nextAttemptAt: now - 5 };
    expect(pickDue([a, b, c], now, 10).map((e) => e.id)).toEqual(['op-cccccccc', 'op-aaaaaaaa']);
    expect(pickDue([a, b, c], now, 1).map((e) => e.id)).toEqual(['op-cccccccc']);
    expect(nextWakeAt([b])).toBe(now + 5000);
    expect(nextWakeAt([])).toBeNull();
  });

  it('aplicada pasa a hecha; rechazada espera a la persona; reintento vuelve a la cola', () => {
    const entry = createOutboxEntry(op('op-aaaaaaaa'), now);
    expect(applyOpResult(entry, applied('op-aaaaaaaa'), now).status).toBe('done');

    const rejected = applyOpResult(entry, { clientOpId: entry.id, status: 'REJECTED', code: 'INSUFFICIENT_STOCK', message: 'Stock insuficiente' }, now);
    expect(rejected).toMatchObject({ status: 'rejected', lastError: 'Stock insuficiente' });

    const retried = applyOpResult(entry, { clientOpId: entry.id, status: 'RETRY', message: 'Base ocupada' }, now, { random: () => 0.5 });
    expect(retried).toMatchObject({ status: 'queued', attempts: 1, nextAttemptAt: now + 2000 });
  });

  it('un fallo de red no pierde la operación: queda en cola con la misma clave', () => {
    const sending = { ...createOutboxEntry(op('op-aaaaaaaa'), now), status: 'sending' as const };
    const failed = failedAttempt(sending, now, 'Sin conexión', { random: () => 0.5 });
    expect(failed).toMatchObject({ status: 'queued', attempts: 1, id: 'op-aaaaaaaa', lastError: 'Sin conexión' });
    expect(failed.op.clientOpId).toBe('op-aaaaaaaa');
  });

  it('al reabrir la app, lo que quedó enviando vuelve a la cola', () => {
    const sending = { ...createOutboxEntry(op('op-aaaaaaaa'), now), status: 'sending' as const };
    expect(recoverInterrupted([sending], now + 10)[0]).toMatchObject({ status: 'queued', nextAttemptAt: now + 10 });
  });

  it('resume la cola y marca lo estancado', () => {
    const queued = createOutboxEntry(op('op-aaaaaaaa'), now);
    const stalled = { ...createOutboxEntry(op('op-bbbbbbbb'), now), attempts: 3 };
    const rejected = { ...createOutboxEntry(op('op-cccccccc'), now), status: 'rejected' as const };
    const done = { ...createOutboxEntry(op('op-dddddddd'), now), status: 'done' as const };
    expect(summarizeOutbox([queued, stalled, rejected, done])).toEqual({ pending: 2, rejected: 1, done: 1, stalled: 1 });
  });

  it('limpia lo enviado después de un día pero nunca lo pendiente o rechazado', () => {
    const old = now - DONE_RETENTION_MS - 1;
    const oldDone = { ...createOutboxEntry(op('op-aaaaaaaa'), old), status: 'done' as const };
    const oldQueued = createOutboxEntry(op('op-bbbbbbbb'), old);
    const oldRejected = { ...createOutboxEntry(op('op-cccccccc'), old), status: 'rejected' as const };
    expect(pruneDone([oldDone, oldQueued, oldRejected], now).map((e) => e.id)).toEqual(['op-bbbbbbbb', 'op-cccccccc']);
  });
});

describe('a dónde entra el bodeguero al iniciar sesión', () => {
  const phone = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

  it('un bodeguero desde el celular va a la app de bodega', () => {
    expect(prefersWarehouseApp({ role: 'WAREHOUSE', userAgent: phone, hasInventory: true })).toBe(true);
    expect(prefersWarehouseApp({ role: 'WAREHOUSE', userAgent: iphone, hasInventory: true })).toBe(true);
  });

  it('desde un computador, o con otro rol, o sin el módulo de inventario, sigue yendo al panel', () => {
    expect(prefersWarehouseApp({ role: 'WAREHOUSE', userAgent: desktop, hasInventory: true })).toBe(false);
    expect(prefersWarehouseApp({ role: 'OWNER', userAgent: phone, hasInventory: true })).toBe(false);
    expect(prefersWarehouseApp({ role: 'WAREHOUSE', userAgent: phone, hasInventory: false })).toBe(false);
    expect(prefersWarehouseApp({ role: 'WAREHOUSE', userAgent: null, hasInventory: true })).toBe(false);
  });
});


describe('motivos de salida', () => {
  it('cada motivo tiene su nombre y su ayuda, y los códigos viejos siguen existiendo', () => {
    for (const reason of WASTE_REASONS) {
      expect(WASTE_REASON_LABELS[reason]).toBeTruthy();
      expect(WASTE_REASON_HINTS[reason]).toBeTruthy();
    }
    // Un celular sin señal puede tener guardada una operación con estos códigos: no se quitan.
    for (const legacy of ['EXPIRED', 'DAMAGED', 'LOST', 'INTERNAL_USE', 'OTHER']) expect(WASTE_REASONS).toContain(legacy);
    expect(WASTE_REASONS).toEqual(expect.arrayContaining(['TASTING', 'SHRINKAGE', 'DONATION', 'SUPPLIER_RETURN']));
  });

  it('el motivo se traduce a su nombre; un código desconocido no inventa nada', () => {
    expect(wasteReasonLabel('TASTING')).toBe('Degustación o muestra');
    expect(wasteReasonLabel('DAMAGED')).toBe('Mal estado o dañado');
    expect(wasteReasonLabel('NO_EXISTE')).toBeNull();
    expect(wasteReasonLabel(null)).toBeNull();
  });

  it('solo "Otro motivo" obliga a explicar', () => {
    expect(reasonRequiresNote('OTHER')).toBe(true);
    expect(reasonRequiresNote('EXPIRED')).toBe(false);
    expect(reasonRequiresNote(null)).toBe(false);
  });

  it('la salida pide foto, la llegada pide proveedor, y el traslado ninguna de las dos', () => {
    expect(MODE_DEFINITIONS.WASTE.requiresEvidence).toBe(true);
    expect(MODE_DEFINITIONS.RECEIVE.supplier).toBe('required');
    expect(MODE_DEFINITIONS.SURPLUS.supplier).toBe('optional');
    expect(MODE_DEFINITIONS.TRANSFER).toMatchObject({ supplier: 'none', requiresEvidence: false });
  });
});

describe('SKU leído en la etiqueta', () => {
  it('limpia el rótulo y se queda con el código', () => {
    expect(plausibleSku('SKU: CH-0900')).toBe('CH-0900');
    expect(plausibleSku('Cód. AB123')).toBe('AB123');
    expect(plausibleSku('Art. 4521/B')).toBe('4521/B');
    expect(plausibleSku('  REF-77a  ')).toBe('REF-77a');
    // Un código impreso con espacio se acepta; al guardarlo como SKU del catálogo se une con guion.
    expect(plausibleSku('Cód.: ACE 900')).toBe('ACE 900');
    expect(skuForCatalog('ACE 900')).toBe('ACE-900');
  });

  it('descarta lo que no parece un código', () => {
    expect(plausibleSku(null)).toBeNull();
    expect(plausibleSku('')).toBeNull();
    expect(plausibleSku('AB')).toBeNull(); // muy corto
    expect(plausibleSku('ACEITE')).toBeNull(); // una palabra, sin dígitos
    expect(plausibleSku('A B C D 1')).toBeNull(); // demasiados espacios: es una frase, no un código
    expect(plausibleSku('Caja de 12 unidades en bandeja')).toBeNull();
    expect(plausibleSku('AB#123')).toBeNull(); // símbolos que el catálogo no admite
    expect(plausibleSku('A'.repeat(41) + '1')).toBeNull(); // demasiado largo
  });

  it('compara sin mayúsculas ni separadores', () => {
    expect(skuKey('ab-123')).toBe('AB123');
    expect(skuKey('AB 123')).toBe('AB123');
    expect(skuKey('AB.123/')).toBe('AB123');
  });

  it('la lectura de la IA trae el SKU limpio', () => {
    const read = normalizeVisionRead({ isProduct: true, sku: 'SKU: CH-0900', name: 'ACEITE DE MARAVILLA', brand: 'CHEF', confidence: 'high' });
    expect(read).toMatchObject({ sku: 'CH-0900', name: 'Aceite de Maravilla', brand: 'Chef', barcode: null });
  });

  it('un "SKU" que en realidad es un código de barras válido se trata como código de barras', () => {
    const read = normalizeVisionRead({ isProduct: true, sku: '4006381333931', name: 'Marcador', confidence: 'medium' });
    expect(read).toMatchObject({ sku: null, barcode: '4006381333931' });
  });

  it('solo con un SKU legible ya hay algo que buscar', () => {
    expect(normalizeVisionRead({ isProduct: true, sku: 'CH-0900', confidence: 'low' })).toMatchObject({ sku: 'CH-0900', name: null });
    expect(normalizeVisionRead({ isProduct: true, sku: 'xx', confidence: 'low' })).toBeNull();
  });
});

describe('razonamiento de la IA al leer una etiqueta', () => {
  it('Gemini 3 y 2.5 flash piensan lo mínimo por defecto', () => {
    expect(thinkingFor('gemini-3.6-flash')).toEqual({ kind: 'level', level: 'minimal' });
    expect(thinkingFor('gemini-3-pro-preview')).toEqual({ kind: 'level', level: 'minimal' });
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ kind: 'budget', tokens: 0 });
  });

  it('se puede cambiar o dejar el comportamiento del modelo', () => {
    expect(thinkingFor('gemini-3.6-flash', 'low')).toEqual({ kind: 'level', level: 'low' });
    expect(thinkingFor('gemini-3.6-flash', ' HIGH ')).toEqual({ kind: 'level', level: 'high' });
    expect(thinkingFor('gemini-3.6-flash', 'default')).toBeNull();
    expect(thinkingFor('gemini-3.6-flash', 'cualquier-cosa')).toEqual({ kind: 'level', level: 'minimal' });
  });

  it('un modelo que no se reconoce no recibe ningún ajuste (una opción desconocida daría error)', () => {
    expect(thinkingFor('otro-modelo-1')).toBeNull();
    expect(thinkingFor('gemini-2.5-pro')).toBeNull();
  });
});
