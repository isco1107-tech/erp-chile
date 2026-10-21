process.env.TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || 'clave-de-prueba-para-tests';

import {
  describeProviderForUi,
  getTerminalProvider,
  getWebhookSecret,
  listTerminalProviders,
  maskStoredConfig,
  prepareConfigForStorage,
  registerTerminalProvider,
  resolveProviderConfig,
  secretFieldKeys,
} from '@/lib/payments/terminals/registry';
import { UnknownTerminalProviderError } from '@/lib/payments/terminals/types';

const config = {
  webhookSecret: 'secreto-de-prueba-0123456789',
  idPath: 'data.id',
  amountPath: 'data.amount',
  statusPath: 'data.status',
};

describe('registro de terminales', () => {
  it('registra los seis proveedores previstos con ids estables', () => {
    expect(listTerminalProviders().map((p) => p.id).sort()).toEqual(['generic-webhook', 'getnet', 'manual', 'mercadopago', 'sumup', 'transbank-pos']);
  });

  it('proveedor desconocido lanza error tipado y no se puede duplicar un id', () => {
    expect(() => getTerminalProvider('nope')).toThrow(UnknownTerminalProviderError);
    expect(() => registerTerminalProvider(getTerminalProvider('manual'))).toThrow(/duplicado/);
  });

  it('los descriptores de la UI cubren exactamente las claves del esquema Zod', () => {
    for (const provider of listTerminalProviders()) {
      const shape = (provider.configSchema as unknown as { shape: Record<string, unknown> }).shape;
      expect(provider.fields.map((f) => f.key).sort()).toEqual(Object.keys(shape).sort());
    }
  });

  it('el secreto del webhook está marcado como secret', () => {
    expect(secretFieldKeys(getTerminalProvider('generic-webhook'))).toEqual(['webhookSecret']);
    expect(describeProviderForUi('generic-webhook').fields.find((f) => f.key === 'webhookSecret')?.kind).toBe('secret');
  });

  it('los esqueletos se marcan pendientes y no ofrecen capacidades inventadas', () => {
    for (const id of ['transbank-pos', 'getnet', 'sumup', 'mercadopago']) {
      expect(describeProviderForUi(id)).toMatchObject({ status: 'pending-adapter', capabilities: [], fields: [] });
    }
  });
});

describe('configuración por empresa y cifrado de secretos', () => {
  it('separa el secreto, lo cifra y lo recupera', () => {
    const stored = prepareConfigForStorage('generic-webhook', config);
    expect(stored.publicConfig).not.toHaveProperty('webhookSecret');
    expect(stored.encryptedSecrets.webhookSecret).not.toContain(config.webhookSecret);
    expect(JSON.stringify(stored)).not.toContain(config.webhookSecret);
    expect(getWebhookSecret(stored)).toBe(config.webhookSecret);
    expect(resolveProviderConfig(stored)).toMatchObject({ idPath: 'data.id', webhookSecret: config.webhookSecret, toleranceSeconds: 300 });
  });

  it('editar con el secreto en blanco conserva el anterior', () => {
    const first = prepareConfigForStorage('generic-webhook', config);
    const edited = prepareConfigForStorage('generic-webhook', { ...config, webhookSecret: '', amountPath: 'data.total' }, first);
    expect(edited.encryptedSecrets.webhookSecret).toBe(first.encryptedSecrets.webhookSecret);
    expect(edited.publicConfig.amountPath).toBe('data.total');
    expect(getWebhookSecret(edited)).toBe(config.webhookSecret);
  });

  it('sin secreto previo, el blanco es un error de validación', () => {
    expect(() => prepareConfigForStorage('generic-webhook', { ...config, webhookSecret: '' })).toThrow();
  });

  it('configuración inválida no se guarda', () => {
    expect(() => prepareConfigForStorage('generic-webhook', { ...config, amountPath: 'a..b' })).toThrow();
  });

  it('la vista para la pantalla nunca trae el secreto', () => {
    const view = maskStoredConfig(prepareConfigForStorage('generic-webhook', config));
    expect(JSON.stringify(view)).not.toContain(config.webhookSecret);
    expect(view.secretsSet).toEqual({ webhookSecret: true });
  });

  it('un valor guardado alterado no descifra (GCM)', () => {
    const stored = prepareConfigForStorage('generic-webhook', config);
    const [iv, tag, data] = stored.encryptedSecrets.webhookSecret.split('.');
    const tampered = { ...stored, encryptedSecrets: { webhookSecret: [iv, tag, Buffer.from('xx').toString('base64') + data].join('.') } };
    expect(() => getWebhookSecret(tampered)).toThrow();
  });

  it('manual no necesita configuración ni secretos', () => {
    const stored = prepareConfigForStorage('manual', {});
    expect(stored).toEqual({ providerId: 'manual', publicConfig: {}, encryptedSecrets: {} });
    expect(getWebhookSecret(stored)).toBeNull();
  });
});
