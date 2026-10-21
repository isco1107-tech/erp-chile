/**
 * Formularios de los sitios web y su destino en el ERP.
 *
 * Reglas que protegen:
 *  - las respuestas se validan contra el formulario PUBLICADO (nunca contra lo
 *    que diga el navegador) y la empresa sale del sitio, nunca del cuerpo;
 *  - todo envío queda en la bandeja del sitio; además llega a su destino
 *    (CRM, academia, tareas) solo si el módulo está contratado;
 *  - lo que el destino exige (ficha de la academia) se revisa ANTES de guardar;
 *  - un problema del destino no pierde el envío;
 *  - llevar un mensaje a mano a otro módulo no lo duplica con un doble clic;
 *  - al sitio público no viaja el rol interno de cada pregunta.
 *
 * Prisma: se espía el cliente real (DATABASE_URL falsa); cualquier consulta
 * sin simular lanza "Consulta no prevista".
 */

jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));

import { renderToStaticMarkup } from 'react-dom/server';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { blockSchema, blockTexts, createBlock, isBlockEmpty, type BlockOf, type WebSiteBlock } from '@/lib/web-sites/blocks';
import {
  answersText,
  CONTACT_FORM_FIELDS,
  destinationAccess,
  destinationHref,
  FORM_PRESETS,
  formFieldSchema,
  formProblems,
  layoutFields,
  needsConsentCheckbox,
  normalizeFormFields,
  presetFields,
  publicFormFields,
  roleValues,
  routeTargetsFor,
  stepChunks,
  validateFormAnswers,
  type FormField,
} from '@/lib/web-sites/forms';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { documentFromBlocks, parseSiteDocument, type SiteDocument } from '@/lib/web-sites/site';
import { blockForm, findPublishedForm, siteForms } from '@/lib/web-sites/site-forms';
import { isSampleText } from '@/lib/web-sites/templates';
import { DEFAULT_THEME } from '@/lib/web-sites/theme';
import { planRoute, routeExistingMessage, submitPublicForm } from '@/modules/web-sites/services/web-site-forms.service';

type Row = Record<string, unknown>;

const field = (patch: Partial<FormField> & Pick<FormField, 'id' | 'kind'>): FormField => formFieldSchema.parse({ label: patch.id, ...patch });

const formBlock = (patch: Partial<BlockOf<'form'>> = {}): BlockOf<'form'> => blockSchema.parse({ ...createBlock('form'), heading: 'Cotiza', ...patch, type: 'form' }) as BlockOf<'form'>;

// ---------------------------------------------------------------------------
// Lógica pura
// ---------------------------------------------------------------------------

describe('preguntas y roles', () => {
  it('un rol solo vale en un tipo compatible y una sola vez; ids repetidos se descartan', () => {
    const fields = normalizeFormFields([
      field({ id: 'a', kind: 'text', role: 'email' }), // incompatible: un correo sale de un campo de correo
      field({ id: 'b', kind: 'email', role: 'email' }),
      field({ id: 'c', kind: 'email', role: 'email' }), // repetido: el rol queda en el primero
      field({ id: 'b', kind: 'text' }), // id repetido
      field({ id: 'd', kind: 'select', options: ['  Uno ', 'Uno', '', 'Dos'] }),
      field({ id: 'e', kind: 'text', options: ['no corresponde'] }),
    ]);
    expect(fields.map((f) => [f.id, f.role])).toEqual([
      ['a', ''],
      ['b', 'email'],
      ['c', ''],
      ['d', ''],
      ['e', ''],
    ]);
    expect(fields.find((f) => f.id === 'd')?.options).toEqual(['Uno', 'Dos']);
    expect(fields.find((f) => f.id === 'e')?.options).toEqual([]);
  });

  it('un dato guardado dañado no rompe la sección: los valores desconocidos caen al de fábrica', () => {
    const block = blockSchema.parse({ id: 'f', type: 'form', destination: 'banco', purpose: 'x', consent: 'quizás', dealType: 'NADA', fields: [{ id: 'n', kind: 'raro', role: 'contraseña', required: 'sí' }] }) as BlockOf<'form'>;
    expect(block).toMatchObject({ destination: 'inbox', purpose: 'contact', consent: 'notice', dealType: 'OTHER', variant: 'card' });
    expect(block.fields[0]).toMatchObject({ id: 'n', kind: 'text', role: '', required: false });
  });

  it('las plantillas traen preguntas coherentes y cumplen lo que exige su destino', () => {
    for (const preset of FORM_PRESETS) {
      const fields = presetFields(preset);
      expect(fields.length).toBeGreaterThan(0);
      const problems = formProblems({ fields, destination: preset.destination, consent: 'checkbox' });
      // Solo pueden quedar las opciones de ejemplo ("Servicio 1"), que la lista "qué falta" pide cambiar.
      expect(problems.filter((problem) => problem.blocking)).toEqual([]);
    }
  });

  it('dos preguntas cortas seguidas comparten fila; el paso a paso no separa una fila', () => {
    const fields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!);
    const layout = layoutFields(fields);
    expect(layout.find((entry) => entry.field.role === 'name')?.span).toBe('full');
    expect(layout.filter((entry) => entry.span === 'half').length % 2).toBe(0);
    const steps = stepChunks(fields);
    expect(steps.flat()).toEqual(fields);
    for (const step of steps) expect(step.length).toBeLessThanOrEqual(4);
  });

  it('al sitio público no viaja el rol interno de cada pregunta, sí la pista de autocompletado', () => {
    const fields = publicFormFields(presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!));
    for (const item of fields) expect(item).not.toHaveProperty('role');
    expect(fields.find((item) => item.kind === 'date')?.autoComplete).toBe('bday');
  });
});

describe('validación de respuestas (la misma regla en el servidor)', () => {
  const fields = normalizeFormFields([
    field({ id: 'nombre', kind: 'text', label: 'Nombre', required: true, role: 'name' }),
    field({ id: 'correo', kind: 'email', label: 'Correo', required: true, role: 'email' }),
    field({ id: 'rut', kind: 'rut', label: 'RUT', role: 'rut' }),
    field({ id: 'fecha', kind: 'date', label: 'Fecha' }),
    field({ id: 'monto', kind: 'number', label: 'Presupuesto', role: 'amount' }),
    field({ id: 'servicio', kind: 'select', label: 'Servicio', required: true, options: ['Corte', 'Color'] }),
    field({ id: 'acepto', kind: 'checkbox', label: 'Autorizo fotos', required: true }),
    field({ id: 'detalle', kind: 'longtext', label: 'Detalle', role: 'message' }),
  ]);
  const ok = { nombre: '  Ana   Pérez ', correo: 'ANA@Correo.CL', rut: '12345678-5', fecha: '2026-10-09', monto: '$1.500.000', servicio: 'Color', acepto: true, detalle: 'Línea 1\r\nLínea 2\n\n\n\nLínea 3' };

  it('normaliza: espacios, correo en minúsculas, RUT con puntos, montos sin puntos ni signo, saltos de línea', () => {
    const result = validateFormAnswers(fields, { ...ok, extra: 'se ignora', companyId: 'otra' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.answers.map((answer) => [answer.id, answer.value]));
    expect(byId).toEqual({ nombre: 'Ana Pérez', correo: 'ana@correo.cl', rut: '12.345.678-5', fecha: '2026-10-09', monto: '1500000', servicio: 'Color', acepto: 'Sí', detalle: 'Línea 1\nLínea 2\n\nLínea 3' });
    expect(result.answers.map((answer) => answer.id)).not.toContain('extra');
    expect(roleValues(result.answers)).toMatchObject({ name: 'Ana Pérez', email: 'ana@correo.cl', rut: '12.345.678-5', amount: '1500000' });
  });

  it.each([
    ['falta una obligatoria', { ...ok, nombre: '' }, 'nombre', /Completa «Nombre»/],
    ['correo inválido', { ...ok, correo: 'no-es-correo' }, 'correo', /correo/],
    ['RUT con dígito verificador malo', { ...ok, rut: '12345678-9' }, 'rut', /RUT/],
    ['fecha imposible', { ...ok, fecha: '2026-02-31' }, 'fecha', /fecha válida/],
    ['monto con letras', { ...ok, monto: 'mucho' }, 'monto', /número entero/],
    ['opción que no está en la lista', { ...ok, servicio: '<script>' }, 'servicio', /opción de la lista/],
    ['casilla obligatoria sin marcar', { ...ok, acepto: false }, 'acepto', /Marca «Autorizo fotos»/],
    ['texto largo excesivo', { ...ok, detalle: 'x'.repeat(3001) }, 'detalle', /hasta 3000/],
  ])('%s: error con la pregunta exacta', (_label, input, fieldId, message) => {
    const result = validateFormAnswers(fields, input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldId).toBe(fieldId);
    expect(result.error).toMatch(message);
  });

  it('un cuerpo que no es un objeto se trata como vacío (y falla por lo obligatorio)', () => {
    expect(validateFormAnswers(fields, 'hola').ok).toBe(false);
    expect(validateFormAnswers(fields, null).ok).toBe(false);
  });

  it('el resumen omite lo vacío y las casillas sin marcar', () => {
    const result = validateFormAnswers(fields, { ...ok, rut: '', acepto: true });
    if (!result.ok) throw new Error(result.error);
    const text = answersText(result.answers);
    expect(text).toContain('Servicio: Color');
    expect(text).not.toContain('RUT');
  });
});

describe('destinos: qué exige cada uno', () => {
  const contact = normalizeFormFields(CONTACT_FORM_FIELDS);

  it('sin un correo o teléfono obligatorio para responder, no se publica', () => {
    const fields = [field({ id: 'n', kind: 'text', label: 'Nombre', required: true, role: 'name' })];
    expect(formProblems({ fields, destination: 'inbox', consent: 'notice' }).some((problem) => problem.blocking && /correo o un teléfono/.test(problem.message))).toBe(true);
  });

  it('la academia exige nombre, RUT, fecha de nacimiento y teléfono obligatorios, y fuerza la casilla de privacidad', () => {
    const problems = formProblems({ fields: contact, destination: 'academy', consent: 'notice' });
    const blocking = problems.filter((problem) => problem.blocking).map((problem) => problem.message).join(' | ');
    expect(blocking).toMatch(/RUT/);
    expect(blocking).toMatch(/Fecha de nacimiento/);
    expect(needsConsentCheckbox({ consent: 'notice', destination: 'academy' })).toBe(true);
    expect(needsConsentCheckbox({ consent: 'notice', destination: 'crm' })).toBe(false);
  });

  it('sin el módulo del destino se avisa (sin bloquear): quedará solo en la bandeja', () => {
    const problems = formProblems({ fields: contact, destination: 'crm', consent: 'notice' }, { hasSalesPipeline: false });
    expect(problems).toEqual([expect.objectContaining({ blocking: false, message: expect.stringMatching(/solo en la bandeja/) })]);
    expect(formProblems({ fields: contact, destination: 'crm', consent: 'notice' }, { hasSalesPipeline: true })).toEqual([]);
  });

  it('acceso por empresa y usuario: el módulo decide si existe, el permiso si se puede publicar o enviar a mano', () => {
    const access = destinationAccess({ hasSalesPipeline: true, hasAcademy: false, hasTeamTasks: true }, ['crm:read', 'tasks:write']);
    expect(access).toEqual({
      inbox: { enabled: true, allowed: true },
      crm: { enabled: true, allowed: false },
      academy: { enabled: false, allowed: false },
      tasks: { enabled: true, allowed: false },
    });
    expect(routeTargetsFor({ hasSalesPipeline: true, hasAcademy: false, hasTeamTasks: true }, ['crm:write', 'academy:write', 'tasks:write'])).toEqual(['crm', 'tasks']);
    expect(destinationHref('crm', 'op 1')).toBe('/dashboard/crm?open=op%201');
    expect(destinationHref('crm', null)).toBeNull();
  });

  it('planRoute: con el módulo apagado, va a la bandeja con la explicación', () => {
    const result = planRoute('crm', { hasSalesPipeline: false }, { siteName: 'S', form: { title: 'F', purpose: 'quote', dealType: 'OTHER', tag: '' }, answers: [] });
    expect(result).toEqual({ ok: true, plan: { kind: 'inbox', note: expect.stringMatching(/no está activo/) } });
  });

  it('planRoute: la ficha de la academia valida edad y apoderado ANTES de guardar', () => {
    const fields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!);
    const id = (role: string) => fields.find((item) => item.role === role)!.id;
    const minor = validateFormAnswers(fields, { [id('name')]: 'Sofía Rojas', [id('rut')]: '12.345.678-5', [id('birthDate')]: '2015-03-01', [id('phone')]: '+56 9 1234 5678' });
    if (!minor.ok) throw new Error(minor.error);
    const planned = planRoute('academy', { hasAcademy: true }, { siteName: 'S', form: { title: 'Inscripción', purpose: 'enrollment', dealType: 'OTHER', tag: '' }, answers: minor.answers });
    expect(planned).toEqual({ ok: false, error: expect.stringMatching(/apoderado/) });
  });
});

describe('formularios del sitio', () => {
  const hero = { ...createBlock('hero'), title: 'Hola' } as WebSiteBlock;
  const contact = { ...createBlock('contact'), id: 'contacto', showForm: true, destination: 'academy' } as WebSiteBlock;
  const quote = formBlock({ id: 'cotiza', destination: 'crm' });
  const hidden = formBlock({ id: 'oculto', hidden: true });

  it('un bloque «Contacto» nunca envía a la academia (no pide RUT ni fecha de nacimiento)', () => {
    expect(blockForm(contact)).toMatchObject({ source: 'contact', destination: 'inbox', fields: CONTACT_FORM_FIELDS });
    expect(blockForm({ ...contact, showForm: false } as WebSiteBlock)).toBeNull();
  });

  it('solo valen los formularios publicados y visibles; sin id, el de contacto (navegadores con la página de antes)', () => {
    const doc = parseSiteDocument({ pages: [{ id: 'home', title: 'Inicio', blocks: [hero, contact, quote, hidden] }, { id: 'p2', title: 'Oculta', slug: 'oculta', hidden: true, blocks: [formBlock({ id: 'en-oculta' })] }] });
    expect(siteForms(doc).map((form) => [form.blockId, form.hidden])).toEqual([
      ['contacto', false],
      ['cotiza', false],
      ['oculto', true],
      ['en-oculta', true],
    ]);
    expect(findPublishedForm(doc, 'cotiza')?.blockId).toBe('cotiza');
    expect(findPublishedForm(doc, 'oculto')).toBeNull();
    expect(findPublishedForm(doc, 'en-oculta')).toBeNull();
    expect(findPublishedForm(doc, 'no-existe')).toBeNull();
    expect(findPublishedForm(doc, null)?.blockId).toBe('contacto');
  });

  it('la lista "qué falta" bloquea un formulario incompleto y avisa si el destino no está en el plan', () => {
    const broken = formBlock({ id: 'roto', fields: [field({ id: 'n', kind: 'text', label: 'Nombre' })] });
    const report = evaluateReadiness({ kind: 'LANDING', mode: 'GUIDED', document: documentFromBlocks([hero, broken, quote]), features: { hasSalesPipeline: false } });
    const forms = report.items.find((entry) => entry.id === 'forms');
    expect(forms).toMatchObject({ ok: false, required: true });
    expect(forms?.hint).toMatch(/«Cotiza»|«Cotiza/);
    expect(report.items.find((entry) => entry.id === 'forms-destination')).toMatchObject({ ok: false, required: false });
    // Un formulario cuenta como forma de contacto.
    expect(report.items.find((entry) => entry.id === 'contact')?.ok).toBe(true);
  });

  it('la sección de muestra no se publica tal cual: sus textos y opciones de ejemplo se reconocen, las preguntas no', () => {
    const block = sampleBlock('form');
    const texts = blockTexts(block);
    expect(texts.filter(isSampleText).length).toBeGreaterThan(0);
    expect(texts).toContain('Servicio 1');
    expect(texts).not.toContain('Nombre');
    expect(isBlockEmpty(block)).toBe(false);
    expect(isBlockEmpty(formBlock({ fields: [] }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lo que se pinta
// ---------------------------------------------------------------------------

describe('sección «Formulario» en el sitio', () => {
  const render = (blocks: WebSiteBlock[], mode: 'public' | 'preview' = 'public') =>
    renderToStaticMarkup(<SiteRenderer name="Mi sitio" logoUrl={null} theme={DEFAULT_THEME} blocks={blocks} slug="mi-sitio" mode={mode} />);

  it('pinta cada diseño con sus preguntas, el botón y el aviso, sin filtrar el rol interno', () => {
    const fields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!);
    for (const variant of ['card', 'split', 'minimal', 'photo', 'steps'] as const) {
      const html = render([formBlock({ fields, destination: 'academy', variant, highlights: ['Respuesta en 24 horas'] })]);
      expect(html).toContain('Fecha de nacimiento');
      expect(html).toContain('Leí y acepto el');
      expect(html).toContain('Respuesta en 24 horas');
      expect(html).toContain('autoComplete="bday"');
      expect(html).not.toMatch(/guardianName|photoConsent|birthDate/);
    }
  });

  it('el diseño por pasos muestra el avance y solo el primer paso a la vista', () => {
    const fields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!);
    const html = render([formBlock({ fields, destination: 'academy', variant: 'steps' })]);
    expect(html).toContain('Paso 1 de');
    expect(html).toContain('Siguiente');
    expect(html.match(/hidden=""/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('en la vista previa del editor no se puede enviar', () => {
    const html = render([formBlock({ fields: presetFields(FORM_PRESETS[0]!) })], 'preview');
    expect(html).toContain('Vista previa: el formulario funciona solo en el sitio publicado.');
  });
});

// ---------------------------------------------------------------------------
// Servicio: envío público y enrutamiento
// ---------------------------------------------------------------------------

type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: unknown[]) => unknown>;

const MODEL_METHODS = {
  webSiteMessage: ['create', 'updateMany', 'findFirst'],
  companyFeatures: ['findUnique'],
  opportunity: ['findFirst', 'create'],
  crmActivity: ['create'],
  crmPerson: ['create'],
  teamTask: ['create'],
  academyStudent: ['findFirst'],
  academyApplication: ['findFirst', 'create'],
  academyGroup: ['findFirst'],
} as const;

function installDb(): Record<keyof typeof MODEL_METHODS, Mocks> {
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
  // La transacción del CRM corre el callback con el mismo cliente espiado.
  jest.spyOn(prisma, '$transaction').mockImplementation(((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)) as never);
  return db as Record<keyof typeof MODEL_METHODS, Mocks>;
}

const COMPANY = 'empresa-sitio';
const argsOf = (mock: jest.Mock, call = 0) => mock.mock.calls[call]![0] as { where: Row; data: Row };

function siteWith(blocks: WebSiteBlock[]): { id: string; companyId: string; name: string; document: SiteDocument } {
  return { id: 'site-1', companyId: COMPANY, name: 'Solar Sur', document: documentFromBlocks(blocks) };
}

describe('submitPublicForm', () => {
  let db: ReturnType<typeof installDb>;
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    db = installDb();
    db.webSiteMessage.create.mockResolvedValue({ id: 'msg-1' });
    db.webSiteMessage.updateMany.mockResolvedValue({ count: 1 });
  });
  afterAll(() => jest.restoreAllMocks());

  const quoteFields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'quote')!);
  const id = (fields: FormField[], role: string) => fields.find((item) => item.role === role)!.id;
  const quoteAnswers = {
    [id(quoteFields, 'name')]: 'Ana Pérez',
    [id(quoteFields, 'email')]: 'ana@correo.cl',
    [id(quoteFields, 'phone')]: '+56 9 1234 5678',
    [id(quoteFields, 'group')]: 'Servicio 2',
    [id(quoteFields, 'amount')]: '1.200.000',
    [id(quoteFields, 'message')]: 'Necesito 12 paneles',
  };

  it('bandeja: guarda las respuestas sin consultar el plan, con la empresa DEL SITIO', async () => {
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, destination: 'inbox', purpose: 'quote', inboxTag: 'Temporada 2027' })]);
    const result = await submitPublicForm(site, { formId: 'cotiza', answers: { ...quoteAnswers, companyId: 'otra' } });

    expect(result).toMatchObject({ ok: true, messageId: 'msg-1', routed: null, name: 'Ana Pérez' });
    expect(db.companyFeatures.findUnique).not.toHaveBeenCalled();
    const { data } = argsOf(db.webSiteMessage.create);
    expect(data).toMatchObject({ companyId: COMPANY, siteId: 'site-1', formId: 'cotiza', purpose: 'quote', destination: 'inbox', tag: 'Temporada 2027', email: 'ana@correo.cl', message: 'Necesito 12 paneles' });
    expect(JSON.stringify(data)).not.toContain('otra');
  });

  it('formulario inexistente u oculto: 404 sin tocar la base', async () => {
    const site = siteWith([formBlock({ id: 'oculto', fields: quoteFields, hidden: true })]);
    await expect(submitPublicForm(site, { formId: 'oculto', answers: quoteAnswers })).resolves.toEqual({ ok: false, status: 404, error: expect.any(String) });
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
  });

  it('respuesta inválida: 400 con la pregunta, sin guardar', async () => {
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields })]);
    const result = await submitPublicForm(site, { formId: 'cotiza', answers: { ...quoteAnswers, [id(quoteFields, 'email')]: 'malo' } });
    expect(result).toMatchObject({ ok: false, status: 400, fieldId: id(quoteFields, 'email') });
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
  });

  it('casilla de privacidad exigida y no marcada: 400', async () => {
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, consent: 'checkbox' })]);
    await expect(submitPublicForm(site, { formId: 'cotiza', answers: quoteAnswers })).resolves.toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/aviso de privacidad/) });
    expect(db.webSiteMessage.create).not.toHaveBeenCalled();
  });

  it('CRM con el módulo: crea persona, oportunidad «Prospecto» y recordatorio con la empresa del sitio, y enlaza el mensaje', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasSalesPipeline: true });
    db.opportunity.findFirst.mockResolvedValue(null);
    db.crmPerson.create.mockResolvedValue({ id: 'persona-1' });
    db.opportunity.create.mockResolvedValue({ id: 'op-1', title: 'Cotización: Ana Pérez' });
    db.crmActivity.create.mockResolvedValue({ id: 'act-1' });
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, destination: 'crm', purpose: 'quote', dealType: 'EVENT_PRODUCTION', inboxTag: 'Web 2027' })]);

    const result = await submitPublicForm(site, { formId: 'cotiza', answers: quoteAnswers });

    expect(result).toMatchObject({ ok: true, routed: { kind: 'crm', id: 'op-1', note: null } });
    expect(argsOf(db.companyFeatures.findUnique).where).toEqual({ companyId: COMPANY });
    expect(argsOf(db.opportunity.create).data).toMatchObject({
      companyId: COMPANY,
      title: 'Cotización: Ana Pérez',
      prospectEmail: 'ana@correo.cl',
      amount: 1_200_000,
      stage: 'LEAD',
      source: 'Sitio web',
      dealType: 'EVENT_PRODUCTION',
      tags: ['Web', 'Web 2027'],
      personId: 'persona-1',
    });
    expect(argsOf(db.crmPerson.create).data).toMatchObject({ companyId: COMPANY, fullName: 'Ana Pérez' });
    expect(argsOf(db.crmActivity.create).data).toMatchObject({ companyId: COMPANY, opportunityId: 'op-1', type: 'EMAIL' });
    // La búsqueda de duplicados es de ESTA empresa.
    expect(argsOf(db.opportunity.findFirst).where).toMatchObject({ companyId: COMPANY, source: 'Sitio web' });
    expect(argsOf(db.webSiteMessage.updateMany)).toMatchObject({ where: { id: 'msg-1', companyId: COMPANY }, data: { routedKind: 'crm', routedId: 'op-1' } });
  });

  it('CRM: la misma persona el mismo día suma una nota a su oportunidad, no abre otra', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasSalesPipeline: true });
    db.opportunity.findFirst.mockResolvedValue({ id: 'op-vieja', title: 'Cotización: Ana' });
    db.crmActivity.create.mockResolvedValue({ id: 'nota' });
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, destination: 'crm' })]);

    const result = await submitPublicForm(site, { formId: 'cotiza', answers: quoteAnswers });

    expect(result).toMatchObject({ ok: true, routed: { kind: 'crm', id: 'op-vieja', note: expect.stringMatching(/se sumó como nota/) } });
    expect(db.opportunity.create).not.toHaveBeenCalled();
    expect(argsOf(db.crmActivity.create).data).toMatchObject({ companyId: COMPANY, opportunityId: 'op-vieja', type: 'NOTE' });
  });

  it('CRM sin el módulo contratado: queda solo en la bandeja, con la explicación', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasSalesPipeline: false });
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, destination: 'crm' })]);

    const result = await submitPublicForm(site, { formId: 'cotiza', answers: quoteAnswers });

    expect(result).toMatchObject({ ok: true, routed: null });
    expect(argsOf(db.webSiteMessage.create).data.routeNote).toMatch(/no está activo/);
    expect(db.opportunity.create).not.toHaveBeenCalled();
  });

  it('si el destino falla, el envío ya quedó en la bandeja: se reporta y se anota, sin perderlo', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasSalesPipeline: true });
    db.opportunity.findFirst.mockRejectedValue(new Error('timeout'));
    const site = siteWith([formBlock({ id: 'cotiza', fields: quoteFields, destination: 'crm' })]);

    const result = await submitPublicForm(site, { formId: 'cotiza', answers: quoteAnswers });

    expect(result).toMatchObject({ ok: true, messageId: 'msg-1', routed: null });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ companyId: COMPANY }));
    expect(argsOf(db.webSiteMessage.updateMany).data.routeNote).toMatch(/quedó solo en la bandeja/);
  });

  it('academia: crea la inscripción pendiente con el grupo elegido de ESTA empresa', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasAcademy: true });
    db.academyStudent.findFirst.mockResolvedValue(null);
    db.academyApplication.findFirst.mockResolvedValue(null);
    db.academyApplication.create.mockResolvedValue({ id: 'insc-1' });
    db.academyGroup.findFirst.mockResolvedValueOnce({ id: 'grupo-1' }).mockResolvedValueOnce({ id: 'grupo-1' });
    const fields = presetFields(FORM_PRESETS.find((preset) => preset.id === 'academy')!).map((item) => (item.role === 'group' ? { ...item, options: ['Aún no lo sé', 'Pasarela Inicial'] } : item));
    const pick = (role: string) => fields.find((item) => item.role === role)!.id;
    const site = siteWith([formBlock({ id: 'insc', fields, destination: 'academy', purpose: 'enrollment' })]);

    const result = await submitPublicForm(site, {
      formId: 'insc',
      acceptPrivacy: true,
      answers: { [pick('name')]: 'Valentina Soto', [pick('rut')]: '12.345.678-5', [pick('birthDate')]: '1999-05-04', [pick('phone')]: '+56 9 8765 4321', [pick('group')]: 'Pasarela Inicial', [pick('photoConsent')]: true },
    });

    expect(result).toMatchObject({ ok: true, routed: { kind: 'academy', id: 'insc-1' } });
    expect(argsOf(db.academyGroup.findFirst).where).toMatchObject({ companyId: COMPANY, isActive: true, name: { equals: 'Pasarela Inicial', mode: 'insensitive' } });
    expect(argsOf(db.academyApplication.create).data).toMatchObject({ companyId: COMPANY, fullName: 'Valentina Soto', rut: '12.345.678-5', photoConsent: true, preferredGroupId: 'grupo-1' });
  });

  it('tareas: crea una tarea sin responsable, con plazo mañana y las respuestas en la descripción', async () => {
    db.companyFeatures.findUnique.mockResolvedValue({ hasTeamTasks: true });
    db.teamTask.create.mockResolvedValue({ id: 'tarea-1' });
    const site = siteWith([formBlock({ id: 'reclamo', heading: 'Reclamos', fields: quoteFields, destination: 'tasks' })]);

    const result = await submitPublicForm(site, { formId: 'reclamo', answers: quoteAnswers });

    expect(result).toMatchObject({ ok: true, routed: { kind: 'tasks', id: 'tarea-1' } });
    const { data } = argsOf(db.teamTask.create);
    expect(data).toMatchObject({ companyId: COMPANY, title: 'Responder a Ana Pérez: Reclamos', assigneeId: null, createdById: null, priority: 'NORMAL' });
    expect(String(data.description)).toContain('Necesito 12 paneles');
    expect((data.dueDate as Date).getUTCHours()).toBe(12);
  });

  it('cuerpo antiguo (sin formId): va al formulario de contacto del sitio', async () => {
    const site = siteWith([{ ...createBlock('contact'), id: 'contacto', showForm: true } as WebSiteBlock]);
    const result = await submitPublicForm(site, { answers: { name: 'Ana', email: 'a@b.cl', phone: '', message: 'Hola, quiero cotizar' } });
    expect(result).toMatchObject({ ok: true });
    expect(argsOf(db.webSiteMessage.create).data).toMatchObject({ formId: 'contacto', purpose: 'contact', phone: null, message: 'Hola, quiero cotizar' });
  });
});

describe('routeExistingMessage: llevar un mensaje de la bandeja a otro módulo', () => {
  let db: ReturnType<typeof installDb>;
  beforeEach(() => {
    jest.restoreAllMocks();
    db = installDb();
  });
  afterAll(() => jest.restoreAllMocks());

  const legacy = { id: 'msg-1', companyId: COMPANY, siteId: 'site-1', name: 'Ana', email: 'a@b.cl', phone: null, message: 'Quiero una cotización', formId: null, formTitle: null, purpose: null, destination: null, tag: null, answers: null, routedKind: null, routedId: null, routedAt: null, routeNote: null, readAt: null, archivedAt: null, createdAt: new Date(), site: { name: 'Solar Sur' } };
  const actor = { companyId: COMPANY, userId: 'user-1', features: { hasTeamTasks: true, hasSalesPipeline: true } };

  it('reserva el mensaje antes de crear (un doble clic no duplica) y la tarea queda a nombre de quien la envía', async () => {
    db.webSiteMessage.findFirst.mockResolvedValue(legacy);
    db.webSiteMessage.updateMany.mockResolvedValue({ count: 1 });
    db.teamTask.create.mockResolvedValue({ id: 'tarea-9' });

    const result = await routeExistingMessage(actor, 'msg-1', 'tasks');

    expect(result).toMatchObject({ kind: 'tasks', id: 'tarea-9', href: '/dashboard/tasks?vista=equipo' });
    expect(argsOf(db.webSiteMessage.findFirst).where).toEqual({ id: 'msg-1', companyId: COMPANY });
    expect(argsOf(db.webSiteMessage.updateMany, 0).where).toMatchObject({ id: 'msg-1', companyId: COMPANY, routedId: null });
    expect(argsOf(db.teamTask.create).data).toMatchObject({ companyId: COMPANY, assigneeId: 'user-1', createdById: 'user-1' });
  });

  it('si otra persona lo envió recién, no crea nada', async () => {
    db.webSiteMessage.findFirst.mockResolvedValue(legacy);
    db.webSiteMessage.updateMany.mockResolvedValue({ count: 0 });
    await expect(routeExistingMessage(actor, 'msg-1', 'tasks')).rejects.toThrow(/Otra persona/);
    expect(db.teamTask.create).not.toHaveBeenCalled();
  });

  it('un mensaje ya registrado no se vuelve a enviar; uno de otra empresa no existe', async () => {
    db.webSiteMessage.findFirst.mockResolvedValueOnce({ ...legacy, routedKind: 'crm', routedId: 'op-1' }).mockResolvedValueOnce(null);
    await expect(routeExistingMessage(actor, 'msg-1', 'tasks')).rejects.toThrow(/ya está registrado/);
    await expect(routeExistingMessage(actor, 'msg-de-otra', 'tasks')).rejects.toThrow('Mensaje no encontrado');
  });

  it('a la academia le faltan datos de la ficha: error claro, sin reservar', async () => {
    db.webSiteMessage.findFirst.mockResolvedValue(legacy);
    await expect(routeExistingMessage({ ...actor, features: { hasAcademy: true } }, 'msg-1', 'academy')).rejects.toThrow(/nombre, RUT, fecha de nacimiento y teléfono/);
    expect(db.webSiteMessage.updateMany).not.toHaveBeenCalled();
  });

  it('si la creación falla, devuelve la reserva', async () => {
    db.webSiteMessage.findFirst.mockResolvedValue(legacy);
    db.webSiteMessage.updateMany.mockResolvedValue({ count: 1 });
    db.teamTask.create.mockRejectedValue(new Error('caída'));
    await expect(routeExistingMessage(actor, 'msg-1', 'tasks')).rejects.toThrow('caída');
    const release = argsOf(db.webSiteMessage.updateMany, 1);
    expect(release.where).toMatchObject({ id: 'msg-1', companyId: COMPANY });
    expect(release.data).toEqual({ routedAt: null, routedKind: null });
  });
});

describe('plantillas de página con formulario', () => {
  it('«Cotizar», «Inscripción» y «Reservas» traen un formulario completo para su destino, que sin el módulo parte en la bandeja', async () => {
    const { PAGE_TEMPLATES } = await import('@/lib/web-sites/page-templates');
    const { adaptFormDestinations } = await import('@/components/web-sites/pages-logic');
    const { templateBlocks } = await import('@/lib/web-sites/templates');
    for (const id of ['quote', 'enrollment', 'booking']) {
      const template = PAGE_TEMPLATES.find((entry) => entry.id === id)!;
      const blocks = templateBlocks(template.blocks);
      const form = blocks.find((block): block is BlockOf<'form'> => block.type === 'form')!;
      expect(form).toBeDefined();
      expect(formProblems(form).filter((problem) => problem.blocking)).toEqual([]);
      // Sus textos y opciones de ejemplo se reconocen: no se publica tal cual.
      expect(blockTexts(form).some(isSampleText)).toBe(true);
      const adapted = adaptFormDestinations(blocks, (destination) => destination === 'inbox');
      expect(adapted.find((block) => block.type === 'form')).toMatchObject({ destination: 'inbox' });
    }
  });
});

describe('asistente de diseño con IA y estudio visual', () => {
  it('la IA no cambia a qué parte del ERP tributa un formulario; uno nuevo parte en la bandeja', async () => {
    const { keepFormRouting } = await import('@/lib/web-sites/ai-designer');
    const current = [formBlock({ id: 'cotiza', destination: 'crm', dealType: 'MEDIA', inboxTag: 'Web', consent: 'checkbox' })];
    const proposed = [
      formBlock({ id: 'cotiza', destination: 'tasks', dealType: 'OTHER', inboxTag: 'IA', consent: 'notice', heading: 'Nuevo título' }),
      formBlock({ id: 'nuevo', destination: 'academy', inboxTag: 'IA' }),
    ];
    const kept = keepFormRouting(proposed, current) as BlockOf<'form'>[];
    expect(kept[0]).toMatchObject({ heading: 'Nuevo título', destination: 'crm', dealType: 'MEDIA', inboxTag: 'Web', consent: 'checkbox' });
    expect(kept[1]).toMatchObject({ destination: 'inbox', inboxTag: '' });
  });

  it('el estudio visual de la academia y los certámenes no admite formularios a medida', async () => {
    const { creativeSiteSchema } = await import('@/lib/web-sites/creative');
    const result = creativeSiteSchema.safeParse({ blocks: [formBlock({ id: 'f' })] });
    expect(result.success).toBe(false);
  });
});

describe('mapa del sitio y robots.txt', () => {
  it('lista solo las páginas publicadas, con direcciones absolutas y XML escapado', async () => {
    const { pageUrl, robotsTxt, sitePaths, sitemapXml } = await import('@/lib/web-sites/sitemap');
    const doc = parseSiteDocument({
      pages: [
        { id: 'home', title: 'Inicio', blocks: [] },
        { id: 's', title: 'Servicios', slug: 'servicios', blocks: [] },
        { id: 'o', title: 'Oculta', slug: 'oculta', hidden: true, blocks: [] },
      ],
    });
    expect(sitePaths(doc)).toEqual(['', 'servicios']);
    expect(pageUrl('https://minegocio.cl/', '')).toBe('https://minegocio.cl/');
    expect(pageUrl('https://app.test/web/mi-sitio', 'servicios')).toBe('https://app.test/web/mi-sitio/servicios');
    const xml = sitemapXml([{ url: 'https://a.cl/?x=1&y=<2>', lastModified: new Date('2026-10-01T12:00:00Z') }]);
    expect(xml).toContain('<loc>https://a.cl/?x=1&amp;y=&lt;2&gt;</loc>');
    expect(xml).toContain('<lastmod>2026-10-01T12:00:00.000Z</lastmod>');
    expect(robotsTxt({ base: 'https://minegocio.cl', indexable: true })).toContain('Sitemap: https://minegocio.cl/sitemap.xml');
    expect(robotsTxt({ base: 'https://minegocio.cl', indexable: false })).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('GET /web/[slug]/sitemap.xml', () => {
  afterEach(() => jest.restoreAllMocks());

  const row = (over: Row = {}) => ({
    id: 'site-1', companyId: COMPANY, name: 'Solar', slug: 'solar-sur', mode: 'GUIDED', status: 'PUBLISHED', seoTitle: null, seoDescription: null, indexable: true, logoUrl: null, ogImageUrl: null, faviconUrl: null,
    publishedBlocks: { pages: [{ id: 'home', title: 'Inicio', blocks: [] }, { id: 's', title: 'Servicios', slug: 'servicios', blocks: [] }] },
    publishedTheme: {}, publishedHtml: null, publishedAt: new Date('2026-10-01T12:00:00Z'), customDomain: null, customDomainVerifiedAt: null,
    company: { businessName: 'Solar SpA', status: 'ACTIVE', features: { hasWebSites: true } },
    ...over,
  });

  it('usa el dominio propio verificado como dirección canónica; sin él, la de la plataforma', async () => {
    const { GET } = await import('@/app/web/[slug]/sitemap.xml/route');
    const findUnique = jest.spyOn(prisma.webSite, 'findUnique');
    findUnique.mockResolvedValueOnce(row() as never);
    const plain = await (await GET(new Request('https://app.test/web/solar-sur/sitemap.xml'), { params: Promise.resolve({ slug: 'solar-sur' }) })).text();
    expect(plain).toContain('<loc>https://app.test/web/solar-sur/</loc>');
    expect(plain).toContain('<loc>https://app.test/web/solar-sur/servicios</loc>');

    findUnique.mockResolvedValueOnce(row({ customDomain: 'solarsur.cl', customDomainVerifiedAt: new Date() }) as never);
    const own = await (await GET(new Request('https://app.test/web/solar-sur/sitemap.xml'), { params: Promise.resolve({ slug: 'solar-sur' }) })).text();
    expect(own).toContain('<loc>https://solarsur.cl/servicios</loc>');
  });

  it('un sitio "no indexable" o no publicado no tiene mapa', async () => {
    const { GET } = await import('@/app/web/[slug]/sitemap.xml/route');
    jest.spyOn(prisma.webSite, 'findUnique').mockResolvedValueOnce(row({ indexable: false }) as never).mockResolvedValueOnce(row({ status: 'DRAFT' }) as never);
    expect((await GET(new Request('https://app.test/x'), { params: Promise.resolve({ slug: 'solar-sur' }) })).status).toBe(404);
    expect((await GET(new Request('https://app.test/x'), { params: Promise.resolve({ slug: 'solar-sur' }) })).status).toBe(404);
  });
});
