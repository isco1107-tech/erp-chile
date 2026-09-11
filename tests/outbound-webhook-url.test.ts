/**
 * Guardia SSRF para las acciones CALL_WEBHOOK del motor de automatizaciones.
 * Sin esto, cualquier usuario con `automation:manage` podría apuntar una
 * regla a la IP de metadata de la nube (169.254.169.254) o a un servicio
 * interno y usar este servidor como oráculo para exfiltrar datos.
 */

import { isSafeOutboundWebhookUrl } from '@/lib/security/outbound-url';

describe('Validación estática de URL de webhook', () => {
  it('acepta una URL https pública normal', () => {
    expect(isSafeOutboundWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc/')).toEqual({ ok: true });
  });

  it('rechaza http:// sin cifrar', () => {
    const result = isSafeOutboundWebhookUrl('http://example.com/webhook');
    expect(result.ok).toBe(false);
  });

  it('rechaza una URL malformada', () => {
    const result = isSafeOutboundWebhookUrl('no-es-una-url');
    expect(result.ok).toBe(false);
  });

  it('rechaza localhost y variantes', () => {
    expect(isSafeOutboundWebhookUrl('https://localhost/webhook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://LOCALHOST/webhook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://algo.internal/webhook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://algo.local/webhook').ok).toBe(false);
  });

  it('rechaza la IP de metadata de la nube', () => {
    expect(isSafeOutboundWebhookUrl('https://169.254.169.254/latest/meta-data').ok).toBe(false);
  });

  it('rechaza rangos privados RFC1918 como IP literal', () => {
    expect(isSafeOutboundWebhookUrl('https://10.0.0.5/hook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://172.16.0.1/hook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://192.168.1.1/hook').ok).toBe(false);
  });

  it('rechaza loopback', () => {
    expect(isSafeOutboundWebhookUrl('https://127.0.0.1/hook').ok).toBe(false);
  });

  it('no confunde un rango 172 fuera de RFC1918 con privado', () => {
    // 172.32.x.x NO es RFC1918 (el rango privado es 172.16.0.0–172.31.255.255)
    expect(isSafeOutboundWebhookUrl('https://172.32.0.1/hook').ok).toBe(true);
  });

  it('rechaza loopback e IPv4-mapeado en IPv6', () => {
    expect(isSafeOutboundWebhookUrl('https://[::1]/hook').ok).toBe(false);
  });

  it('rechaza la IP de metadata de la nube expresada como IPv4-mapeada en IPv6', () => {
    // Regresión real: `new URL()` normaliza `::ffff:169.254.169.254` a la
    // forma de 2 grupos hex (`::ffff:a9fe:a9fe`), nunca a puntos — un
    // primer intento de este guardia comparaba el sufijo tal cual contra
    // "a.b.c.d" y nunca matcheaba nada, dejando pasar la IP de metadata.
    expect(isSafeOutboundWebhookUrl('https://[::ffff:169.254.169.254]/latest/meta-data').ok).toBe(false);
  });

  it('rechaza loopback y un rango RFC1918 expresados como IPv4-mapeados en IPv6', () => {
    expect(isSafeOutboundWebhookUrl('https://[::ffff:127.0.0.1]/hook').ok).toBe(false);
    expect(isSafeOutboundWebhookUrl('https://[::ffff:10.0.0.5]/hook').ok).toBe(false);
  });

  it('rechaza la forma de 2 grupos hexadecimales directamente (sin pasar por la notación con puntos)', () => {
    // 0xa9fe = 169.254 — la forma en la que Node serializa el host real.
    expect(isSafeOutboundWebhookUrl('https://[::ffff:a9fe:a9fe]/hook').ok).toBe(false);
  });

  it('acepta una IP pública real expresada como IPv4-mapeada en IPv6', () => {
    expect(isSafeOutboundWebhookUrl('https://[::ffff:8.8.8.8]/hook').ok).toBe(true);
  });

  it('acepta una IP pública literal', () => {
    expect(isSafeOutboundWebhookUrl('https://8.8.8.8/hook').ok).toBe(true);
  });
});

describe('Validación por DNS al momento de ejecutar', () => {
  const dns = require('dns');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deja pasar un hostname que resuelve a una IP pública', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const { assertResolvesToPublicAddress } = await import('@/lib/security/outbound-url');
    await expect(assertResolvesToPublicAddress('hooks.zapier.com')).resolves.toBeUndefined();
  });

  it('rechaza un hostname que resuelve a una IP privada (DNS rebinding)', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const { assertResolvesToPublicAddress } = await import('@/lib/security/outbound-url');
    await expect(assertResolvesToPublicAddress('rebind.example.com')).rejects.toThrow(/privada o reservada/);
  });

  it('rechaza si CUALQUIERA de las direcciones resueltas es privada', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    const { assertResolvesToPublicAddress } = await import('@/lib/security/outbound-url');
    await expect(assertResolvesToPublicAddress('multi.example.com')).rejects.toThrow();
  });
});
