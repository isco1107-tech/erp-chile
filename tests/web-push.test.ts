/**
 * Web Push (src/lib/notifications/web-push.ts): la lista de servicios push
 * es lo que impide usar el envío de avisos como SSRF, y el filtro de
 * usuarios es lo que impide que un usuario desactivado o sacado de la
 * empresa siga recibiendo sus avisos.
 */
jest.mock('web-push', () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: jest.fn() },
    pushSubscription: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  },
}));

import webpush from 'web-push';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { buildPushPayload, getVapidConfig, isAllowedPushEndpoint, pushSubscriptionSchema, sendPushToCompany } from '@/lib/notifications/web-push';

describe('isAllowedPushEndpoint', () => {
  it('acepta los servicios push de los navegadores reales', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=x',
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    }
  });

  it('rechaza protocolo, puerto, credenciales u host fuera de la lista (SSRF)', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://169.254.169.254/latest',
      'https://localhost/x',
      'https://evil.com/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.com/x',
      'https://evilpush.apple.com.attacker.io/x',
      // Una sola barra: `new URL` la acepta, pero el url.parse de web-push la
      // lee sin host y conecta a 127.0.0.1.
      'https:/fcm.googleapis.com/x',
      ' https://fcm.googleapis.com/x',
      'https://fcm.googleapis.com\\x',
      'no es url',
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    }
  });
});

describe('pushSubscriptionSchema', () => {
  const valid = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNc_a1b2c3d4-E_F0_1234567890=', auth: 'auth_key_1234567890=' } };

  it('acepta lo que entrega PushSubscription.toJSON()', () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza un endpoint que no es de un servicio push', () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: 'https://evil.com/push/123' }).success).toBe(false);
  });

  it('rechaza llaves fuera de base64url', () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, keys: { p256dh: 'llave!con@caracteres#invalidos$', auth: 'auth_key' } }).success).toBe(false);
  });
});

describe('buildPushPayload', () => {
  it('recorta título a 80 y cuerpo a 180 caracteres terminando en …', () => {
    const payload = buildPushPayload({ title: 'T'.repeat(100), message: 'M'.repeat(200) });
    expect(payload.title).toHaveLength(80);
    expect(payload.title.endsWith('…')).toBe(true);
    expect(payload.body).toHaveLength(180);
    expect(payload.body.endsWith('…')).toBe(true);
  });

  it('mantiene una ruta interna', () => {
    expect(buildPushPayload({ title: 'Aviso', message: 'Detalle', href: '/dashboard/crm?open=1' }).href).toBe('/dashboard/crm?open=1');
  });

  it('cambia por /dashboard cualquier destino externo o vacío', () => {
    for (const href of ['https://evil.com', '//evil.com', '/\\evil.com', null]) {
      expect(buildPushPayload({ title: 'Aviso', message: 'Detalle', href }).href).toBe('/dashboard');
    }
  });
});

describe('getVapidConfig', () => {
  const full: NodeJS.ProcessEnv = { NODE_ENV: 'test', VAPID_PUBLIC_KEY: 'pub_key', VAPID_PRIVATE_KEY: 'priv_key', VAPID_SUBJECT: 'mailto:admin@empresa.com' };

  it('devuelve las tres llaves cuando están', () => {
    expect(getVapidConfig(full)).toEqual({ publicKey: 'pub_key', privateKey: 'priv_key', subject: 'mailto:admin@empresa.com' });
  });

  it('devuelve null si falta cualquiera', () => {
    for (const missing of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
      const env: NodeJS.ProcessEnv = { ...full };
      delete env[missing];
      expect(getVapidConfig(env)).toBeNull();
    }
  });
});

/** Suscripción activada desde una sesión viva, sin cambios de contraseña desde entonces. */
const LIVE = { sessionVersion: 3, session: { revokedAt: null }, user: { sessionVersion: 3 } };

describe('sendPushToCompany', () => {
  const originalEnv = process.env;
  const payload = { title: 'Aviso', body: 'Cuerpo', href: '/dashboard' };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, VAPID_PUBLIC_KEY: 'pub_key_test', VAPID_PRIVATE_KEY: 'priv_key_test', VAPID_SUBJECT: 'mailto:test@empresa.com' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sin VAPID no hace nada ni consulta la base', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });

  it('no envía si la empresa no está operativa', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'SUSPENDED', features: null });
    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('borra las suscripciones que el servicio da por muertas (410) y marca las entregadas', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', features: null });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/s1', p256dh: 'p1', auth: 'a1', ...LIVE },
      { id: 's2', endpoint: 'https://fcm.googleapis.com/fcm/send/s2', p256dh: 'p2', auth: 'a2', ...LIVE },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 410 });

    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 1, removed: 1 });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'c1', id: { in: ['s2'] } } });
    expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({ where: { companyId: 'c1', id: { in: ['s1'] } }, data: { lastSuccessAt: expect.any(Date) } });
  });

  it('una fila guardada con un endpoint no permitido se borra sin hacerle el POST', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', features: null });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([{ id: 's9', endpoint: 'https://169.254.169.254/latest', p256dh: 'p', auth: 'a', ...LIVE }]);

    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 1 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('un error 500 del servicio se reporta y no borra la suscripción', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', features: null });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([{ id: 's1', endpoint: 'https://fcm.googleapis.com/fcm/send/s1', p256dh: 'p1', auth: 'a1', ...LIVE }]);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce({ statusCode: 500 });

    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(captureException).toHaveBeenCalled();
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('las membresías solo cuentan con multiempresa contratado, como en getAuthContext', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValueOnce({ status: 'ACTIVE', features: null });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValueOnce([]);
    await sendPushToCompany('c1', payload);
    expect(prisma.pushSubscription.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'c1', user: { isActive: true, OR: [{ companyId: 'c1' }] } }) }),
    );

    (prisma.company.findFirst as jest.Mock).mockResolvedValueOnce({ status: 'ACTIVE', features: { hasMultiCompany: true } });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValueOnce([]);
    await sendPushToCompany('c1', payload);
    expect(prisma.pushSubscription.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { isActive: true, OR: [{ companyId: 'c1' }, { companyMemberships: { some: { companyId: 'c1' } } }] } }),
      }),
    );
  });

  it('una sesión cerrada o revocada, o una contraseña cambiada, apagan los avisos de ese dispositivo', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', features: null, settings: null });
    (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([
      { id: 'viva', endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'p', auth: 'a', ...LIVE },
      { id: 'cerrada', endpoint: 'https://fcm.googleapis.com/fcm/send/2', p256dh: 'p', auth: 'a', ...LIVE, session: { revokedAt: new Date() } },
      { id: 'clave-cambiada', endpoint: 'https://fcm.googleapis.com/fcm/send/3', p256dh: 'p', auth: 'a', ...LIVE, user: { sessionVersion: 4 } },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue(undefined);

    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 1, removed: 2 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'c1', id: { in: ['cerrada', 'clave-cambiada'] } } });
  });

  it('una empresa con lista de IP permitidas no recibe push', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', features: null, settings: { ipAllowlistEnabled: true } });
    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('nunca lanza, aunque falle la base', async () => {
    (prisma.company.findFirst as jest.Mock).mockRejectedValue(new Error('Error de conexión con la BD'));
    await expect(sendPushToCompany('c1', payload)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(captureException).toHaveBeenCalled();
  });
});
