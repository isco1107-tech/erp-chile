import crypto from 'crypto';
import { genericWebhookProvider } from '@/lib/payments/terminals/providers/generic-webhook';
import { parseJsonPath, readJsonPath } from '@/lib/payments/terminals/json-path';
import { AdapterPendingError, TerminalOperationUnsupportedError } from '@/lib/payments/terminals/types';
import { getTerminalProvider } from '@/lib/payments/terminals/registry';

const SECRET = 'secreto-de-prueba-0123456789';
const NOW = new Date('2026-10-21T15:00:00.000Z');

const baseConfig = {
  webhookSecret: SECRET,
  idPath: 'data.id',
  amountPath: 'data.amount',
  statusPath: 'data.status',
  methodPath: 'data.method',
  last4Path: 'data.card.last4',
  authCodePath: 'data.auth',
  referencePath: 'data.order',
  occurredAtPath: 'data.paid_at',
};

const body = JSON.stringify({
  data: {
    id: 'tx-1',
    amount: 15990,
    status: 'APPROVED',
    method: 'Debito',
    auth: 'A12345',
    order: 'order-9',
    paid_at: '2026-10-21T14:59:30.000Z',
    card: { last4: '4242', pan: '4111111111111111', cvv: '123' },
    apiToken: 'no-debe-salir',
  },
});

function sign(payload: string, secret = SECRET, encoding: 'hex' | 'base64' = 'hex') {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest(encoding);
}

function parse(config: Record<string, unknown>, rawBody: string, headers: Record<string, string>, secret: string | null = SECRET, now = NOW) {
  return genericWebhookProvider.parseWebhook({ rawBody, headers, secret, config, now });
}

describe('webhook genérico: firma', () => {
  it('acepta una firma HMAC válida y normaliza el pago', () => {
    const result = parse(baseConfig, body, { 'X-Signature': sign(body) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payment).toMatchObject({
      providerId: 'generic-webhook',
      externalId: 'tx-1',
      amountClp: 15990,
      currency: 'CLP',
      status: 'APPROVED',
      method: 'DEBIT',
      last4: '4242',
      authCode: 'A12345',
      reference: 'order-9',
    });
    expect(result.payment.occurredAt.toISOString()).toBe('2026-10-21T14:59:30.000Z');
    expect(result.eventId).toBe('tx-1:APPROVED');
  });

  it('el raw guardado no lleva PAN, CVV ni tokens', () => {
    const result = parse(baseConfig, body, { 'x-signature': sign(body) });
    if (!result.ok) throw new Error('debía ser válido');
    const serialized = JSON.stringify(result.payment.raw);
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('"123"');
    expect(serialized).not.toContain('no-debe-salir');
    expect(serialized).toContain('4242');
  });

  it('rechaza una firma inválida, ausente o con otro secreto', () => {
    expect(parse(baseConfig, body, { 'x-signature': 'f'.repeat(64) })).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
    expect(parse(baseConfig, body, {})).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
    expect(parse(baseConfig, body, { 'x-signature': sign(body, 'otro-secreto-distinto-123') })).toMatchObject({
      ok: false,
      reason: 'INVALID_SIGNATURE',
    });
  });

  it('rechaza si el cuerpo fue alterado después de firmar (monto cambiado)', () => {
    const tampered = body.replace('15990', '1');
    expect(parse(baseConfig, tampered, { 'x-signature': sign(body) })).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('nunca acepta sin secreto, aunque la firma venga vacía o calculada con ""', () => {
    expect(parse(baseConfig, body, { 'x-signature': sign(body, '') }, null)).toMatchObject({ ok: false, reason: 'MISSING_SECRET' });
    expect(parse(baseConfig, body, { 'x-signature': sign(body, '') }, '')).toMatchObject({ ok: false, reason: 'MISSING_SECRET' });
  });

  it('soporta base64 y prefijo "sha256="', () => {
    const config = { ...baseConfig, signatureEncoding: 'base64', signaturePrefix: 'sha256=' };
    expect(parse(config, body, { 'x-signature': `sha256=${sign(body, SECRET, 'base64')}` }).ok).toBe(true);
    expect(parse(config, body, { 'x-signature': sign(body, SECRET, 'base64') })).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('modo token fijo compara en tiempo constante con el secreto', () => {
    const config = { ...baseConfig, authMode: 'static-token', signatureHeader: 'x-api-token' };
    expect(parse(config, body, { 'x-api-token': SECRET }).ok).toBe(true);
    expect(parse(config, body, { 'x-api-token': `${SECRET}x` })).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('acepta cabeceras como Headers nativo', () => {
    const headers = new Headers({ 'X-Signature': sign(body) });
    expect(genericWebhookProvider.parseWebhook({ rawBody: body, headers, secret: SECRET, config: baseConfig, now: NOW }).ok).toBe(true);
  });
});

describe('webhook genérico: replay con fecha firmada', () => {
  const config = { ...baseConfig, timestampHeader: 'x-timestamp', toleranceSeconds: 300 };
  const signedAt = (date: Date) => {
    const ts = String(Math.floor(date.getTime() / 1000));
    return { 'x-timestamp': ts, 'x-signature': sign(`${ts}.${body}`) };
  };

  it('acepta un aviso dentro de la ventana', () => {
    expect(parse(config, body, signedAt(new Date(NOW.getTime() - 60_000))).ok).toBe(true);
  });

  it('rechaza un aviso auténtico pero viejo (replay)', () => {
    expect(parse(config, body, signedAt(new Date(NOW.getTime() - 10 * 60_000)))).toMatchObject({ ok: false, reason: 'STALE_TIMESTAMP' });
  });

  it('rechaza una fecha del futuro fuera de ventana', () => {
    expect(parse(config, body, signedAt(new Date(NOW.getTime() + 10 * 60_000)))).toMatchObject({ ok: false, reason: 'STALE_TIMESTAMP' });
  });

  it('no sirve cambiar la fecha de un aviso viejo: la firma la cubre', () => {
    const old = signedAt(new Date(NOW.getTime() - 3_600_000));
    const forged = { ...old, 'x-timestamp': String(Math.floor(NOW.getTime() / 1000)) };
    expect(parse(config, body, forged)).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('exige la cabecera de fecha si está configurada', () => {
    expect(parse(config, body, { 'x-signature': sign(body) })).toMatchObject({ ok: false, reason: 'INVALID_SIGNATURE' });
  });

  it('la repetición exacta dentro de la ventana produce el mismo eventId (la idempotencia la cierra claimWebhookEvent)', () => {
    const headers = signedAt(NOW);
    const first = parse(config, body, headers);
    const second = parse(config, body, headers);
    if (!first.ok || !second.ok) throw new Error('debían ser válidos');
    expect(first.eventId).toBe(second.eventId);
    expect(first.payment.externalId).toBe(second.payment.externalId);
  });
});

describe('webhook genérico: configuración JSON-path mal puesta', () => {
  const auth = (rawBody: string) => ({ 'x-signature': sign(rawBody) });

  it('la configuración con ruta inválida ni siquiera se acepta', () => {
    expect(() => genericWebhookProvider.parseConfig({ ...baseConfig, amountPath: 'data..amount' })).toThrow();
    expect(() => genericWebhookProvider.parseConfig({ ...baseConfig, idPath: '__proto__.x' })).toThrow();
    expect(() => genericWebhookProvider.parseConfig({ ...baseConfig, statusPath: 'a b' })).toThrow();
    expect(() => genericWebhookProvider.parseConfig({ ...baseConfig, webhookSecret: 'corto' })).toThrow();
  });

  it('ruta que no existe en el cuerpo: MALFORMED, nunca un pago en 0', () => {
    const config = { ...baseConfig, amountPath: 'data.total' };
    expect(parse(config, body, auth(body))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it('estado sin asignar a ninguna categoría no se interpreta como aprobado', () => {
    const raw = JSON.stringify({ data: { id: 'x', amount: 1000, status: 'EXTRAÑO' } });
    const result = parse({ ...baseConfig, occurredAtPath: undefined }, raw, auth(raw));
    expect(result).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it.each([
    ['monto con decimales', { amount: 1000.5 }],
    ['monto negativo', { amount: -500 }],
    ['monto cero', { amount: 0 }],
    ['monto texto', { amount: 'mil' }],
    ['monto con separador de miles ambiguo', { amount: '1.000' }],
    ['monto en notación científica', { amount: '1e6' }],
  ])('rechaza %s', (_label, patch) => {
    const raw = JSON.stringify({ data: { id: 'x', status: 'approved', ...patch } });
    expect(parse({ ...baseConfig, occurredAtPath: undefined }, raw, auth(raw))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it('divisor: centavos a CLP entero, y rechaza si no queda entero', () => {
    const config = { ...baseConfig, amountDivisor: 100, occurredAtPath: undefined };
    const ok = JSON.stringify({ data: { id: 'x', amount: 599000, status: 'approved' } });
    const result = parse(config, ok, auth(ok));
    expect(result.ok && result.payment.amountClp).toBe(5990);
    const bad = JSON.stringify({ data: { id: 'x', amount: 599050, status: 'approved' } });
    expect(parse(config, bad, auth(bad))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it('moneda distinta de CLP se rechaza cuando currencyPath está configurado', () => {
    const config = { ...baseConfig, currencyPath: 'data.currency', occurredAtPath: undefined };
    const raw = JSON.stringify({ data: { id: 'x', amount: 1000, status: 'approved', currency: 'USD' } });
    expect(parse(config, raw, auth(raw))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it('cuerpo que no es JSON, o JSON que no es objeto, es MALFORMED (tras autenticar)', () => {
    expect(parse(baseConfig, 'no-json', auth('no-json'))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
    expect(parse(baseConfig, '[1,2]', auth('[1,2]'))).toMatchObject({ ok: false, reason: 'MALFORMED_PAYLOAD' });
  });

  it('mapea estados de rechazo, anulación, devolución y pendiente', () => {
    const cases: Array<[string, string]> = [
      ['declined', 'REJECTED'],
      ['voided', 'CANCELLED'],
      ['refunded', 'REFUNDED'],
      ['processing', 'PENDING'],
    ];
    for (const [provided, expected] of cases) {
      const raw = JSON.stringify({ data: { id: 'x', amount: 1000, status: provided } });
      const result = parse({ ...baseConfig, occurredAtPath: undefined }, raw, auth(raw));
      expect(result.ok && result.payment.status).toBe(expected);
    }
  });

  it('un estado APPROVED y uno REFUNDED del mismo pago son eventos distintos', () => {
    const a = JSON.stringify({ data: { id: 'x', amount: 1000, status: 'approved' } });
    const r = JSON.stringify({ data: { id: 'x', amount: 1000, status: 'refunded' } });
    const config = { ...baseConfig, occurredAtPath: undefined };
    const first = parse(config, a, auth(a));
    const second = parse(config, r, auth(r));
    if (!first.ok || !second.ok) throw new Error('debían ser válidos');
    expect(first.eventId).not.toBe(second.eventId);
  });
});

describe('json-path', () => {
  it('lee rutas anidadas e índices', () => {
    const doc = { a: { b: [{ c: 5 }, { c: 7 }] } };
    expect(readJsonPath(doc, 'a.b[1].c')).toEqual({ found: true, value: 7 });
    expect(readJsonPath(doc, '$.a.b[0].c')).toEqual({ found: true, value: 5 });
    expect(readJsonPath(doc, 'a.b[2].c')).toEqual({ found: false });
    expect(readJsonPath(doc, 'a.x')).toEqual({ found: false });
  });

  it('no atraviesa el prototipo', () => {
    expect(parseJsonPath('__proto__.polluted')).toBeNull();
    expect(parseJsonPath('a.constructor.name')).toBeNull();
    expect(readJsonPath({}, 'toString')).toEqual({ found: false });
  });

  it('rechaza sintaxis fuera de lo soportado', () => {
    for (const bad of ['', '$', 'a..b', 'a[*]', 'a[-1]', 'a;b', 'a.b()', '.']) expect(parseJsonPath(bad)).toBeNull();
  });
});

describe('otros proveedores', () => {
  it('createCharge del webhook genérico no inventa un id y exige monto entero', async () => {
    const config = genericWebhookProvider.parseConfig(baseConfig);
    await expect(genericWebhookProvider.createCharge(config, { amountClp: 5000, reference: 'o1' })).resolves.toMatchObject({
      externalId: null,
      status: 'PENDING',
    });
    await expect(genericWebhookProvider.createCharge(config, { amountClp: 50.5, reference: 'o1' })).rejects.toThrow();
  });

  it('fetchCharge no soportado lo dice claro', async () => {
    const config = genericWebhookProvider.parseConfig(baseConfig);
    await expect(genericWebhookProvider.fetchCharge(config, 'tx')).rejects.toBeInstanceOf(TerminalOperationUnsupportedError);
  });

  it('manual no recibe avisos', () => {
    const manual = getTerminalProvider('manual');
    expect(manual.parseWebhook({ rawBody: '{}', headers: {}, secret: 's', config: {} })).toMatchObject({ ok: false, reason: 'UNSUPPORTED' });
  });

  it.each(['transbank-pos', 'getnet', 'sumup', 'mercadopago'])('%s es un esqueleto que falla con mensaje claro', async (id) => {
    const provider = getTerminalProvider(id);
    expect(provider.status).toBe('pending-adapter');
    await expect(provider.createCharge({}, { amountClp: 1000, reference: 'r' })).rejects.toThrow('adaptador pendiente: requiere credenciales y documentación del proveedor');
    await expect(provider.fetchCharge({}, 'x')).rejects.toBeInstanceOf(AdapterPendingError);
    expect(() => provider.parseWebhook({ rawBody: '{}', headers: {}, secret: 's', config: {} })).toThrow(AdapterPendingError);
  });
});
