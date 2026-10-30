/**
 * Rutas públicas del landing con atribución (ADR 0015): `/api/public/leads`,
 * `/api/public/module-quote` y `/api/public/marketing/visit`. Fijan que
 * (1) el lead nunca se pierde por una atribución rota, (2) el correo a ventas
 * lleva la referencia y la campaña, y (3) a la Supersuite no viaja ningún
 * dato de la persona.
 */
jest.mock('@/lib/email/mailer', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/supersuite', () => ({ marketingSupersuite: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import { sendEmail } from '@/lib/email/mailer';
import { marketingSupersuite } from '@/lib/supersuite';
import { LEAD_REF_RE } from '@/lib/marketing/supersuite-events';
import { POST as leadPost } from '@/app/api/public/leads/route';
import { POST as quotePost } from '@/app/api/public/module-quote/route';
import { POST as visitPost } from '@/app/api/public/marketing/visit/route';
import { PRICED_MODULES } from '@/lib/pricing/catalog';

const mail = sendEmail as jest.Mock;
const supersuite = marketingSupersuite as jest.Mock;

let ipCounter = 1;
const freshIp = () => `203.0.113.${ipCounter++}`;

function request(path: string, body: unknown, ip = freshIp()) {
  return new Request(`https://aether.cl${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const touch = { source: 'instagram', medium: 'social', campaign: 'pos-cierre', content: 'carrusel-01', landingPath: '/modulos/punto-de-venta', referrerHost: 'l.instagram.com', at: '2026-10-30T15:00:00.000Z' };
const attribution = { first: touch, last: touch };

const person = { name: 'María Pérez Soto', email: 'maria.perez@ejemplo.cl', phone: '+56 9 8765 4321', company: 'Panadería La Espiga', message: 'Tengo dos locales en Temuco' };

/** Ningún dato de la persona en lo que va a la Supersuite. */
function expectNoPersonalData(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const value of Object.values(person)) expect(json).not.toContain(value);
  expect(json).not.toContain('maria');
}

beforeEach(() => {
  jest.clearAllMocks();
  mail.mockResolvedValue({ status: 'sent', provider: 'test' });
});

describe('POST /api/public/leads (solicitud de demo)', () => {
  const lead = { ...person, teamSize: '6 a 20 personas', solutions: ['Ventas e inventario'] };

  it('el correo lleva referencia y campaña; la Supersuite recibe solo la referencia, la campaña y fichas cerradas', async () => {
    const r = await leadPost(request('/api/public/leads', { ...lead, attribution }));
    expect(r.status).toBe(200);
    const email = mail.mock.calls[0][0];
    const ref = /L-[A-Z0-9]{8}/.exec(email.subject)?.[0];
    expect(ref).toMatch(LEAD_REF_RE);
    expect(email.text).toContain('Origen: instagram / social / pos-cierre (pieza carrusel-01)');
    expect(email.text).toContain(`Referencia: ${ref}`);
    expect(email.replyTo).toBe(person.email);

    expect(supersuite).toHaveBeenCalledTimes(1);
    const [accion, datos] = supersuite.mock.calls[0];
    expect(accion).toBe('lead_recibido');
    expect(datos).toMatchObject({ ref, formulario: 'demo', equipo: '6 a 20 personas', areas: ['Ventas e inventario'], toque: { fuente: 'instagram', campana: 'pos-cierre', contenido: 'carrusel-01' } });
    expectNoPersonalData(datos);
  });

  it('una atribución rota o con campos extra se descarta y el lead llega igual', async () => {
    for (const bad of [{ ...attribution, last: { ...touch, source: 'Con Espacios <b>' } }, { ...attribution, email: person.email }, 'texto', 42]) {
      jest.clearAllMocks();
      mail.mockResolvedValue({ status: 'sent', provider: 'test' });
      const r = await leadPost(request('/api/public/leads', { ...lead, attribution: bad }));
      expect(r.status).toBe(200);
      expect(mail.mock.calls[0][0].text).toContain('Sin campaña');
      expect(supersuite.mock.calls[0][1]).toMatchObject({ toque: null });
    }
  });

  it('si el correo no sale, la Supersuite no cuenta un lead que ventas no recibió', async () => {
    mail.mockResolvedValue({ status: 'failed', provider: 'test' });
    const r = await leadPost(request('/api/public/leads', { ...lead, attribution }));
    expect(r.status).toBe(502);
    expect(supersuite).not.toHaveBeenCalled();
  });

  it('el señuelo responde éxito sin avisar a nadie', async () => {
    const r = await leadPost(request('/api/public/leads', { ...lead, website: 'http://spam', attribution }));
    expect(r.status).toBe(200);
    expect(mail).not.toHaveBeenCalled();
    expect(supersuite).not.toHaveBeenCalled();
  });
});

describe('POST /api/public/module-quote (cotización de módulos)', () => {
  it('avisa los ids de módulo del tarifario y la campaña, sin datos de la persona', async () => {
    const ids = PRICED_MODULES.slice(0, 2).map((m) => m.id);
    const r = await quotePost(request('/api/public/module-quote', { ...person, moduleIds: [...ids, 'inventado'], attribution }));
    expect(r.status).toBe(200);
    expect(mail.mock.calls[0][0].text).toContain('Origen: instagram / social / pos-cierre');
    const [accion, datos] = supersuite.mock.calls[0];
    expect(accion).toBe('lead_recibido');
    expect(datos).toMatchObject({ formulario: 'cotizacion-modulos', modulos: ids });
    expect(datos.ref).toMatch(LEAD_REF_RE);
    expectNoPersonalData(datos);
  });
});

describe('POST /api/public/marketing/visit', () => {
  it('una visita con campaña válida llega a la Supersuite y responde 204', async () => {
    const r = await visitPost(request('/api/public/marketing/visit', { attribution }));
    expect(r.status).toBe(204);
    expect(supersuite).toHaveBeenCalledWith('landing_visita', expect.objectContaining({ toque: expect.objectContaining({ fuente: 'instagram', pagina: '/modulos/punto-de-venta' }) }));
  });

  it('sin campaña, con un cuerpo inválido o enorme, no se avisa nada', async () => {
    for (const body of [{}, { attribution: { first: touch } }, 'no-json', `{"attribution":"${'x'.repeat(3000)}"}`]) {
      expect((await visitPost(request('/api/public/marketing/visit', body))).status).toBe(400);
    }
    expect(supersuite).not.toHaveBeenCalled();
  });

  it('una misma conexión tiene tope por hora', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await visitPost(request('/api/public/marketing/visit', { attribution }, ip))).status);
    expect(statuses.slice(0, 30).every((s) => s === 204)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
