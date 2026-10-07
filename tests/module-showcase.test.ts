import fs from 'node:fs';
import path from 'node:path';
import { MANUAL_SECTIONS } from '@/modules/manual/content';
import { BASE_PLATFORM, PRICED_MODULES, PRICING_PLANS } from '@/lib/pricing/catalog';
import { QUOTABLE_MODULE_IDS, SHOWCASE_CATEGORIES, SHOWCASE_MODULES } from '@/lib/marketing/module-showcase';
import { getShowcaseCards, getShowcaseDetail } from '@/lib/marketing/module-showcase-content';
import { buildModuleQuoteEmail, estimateModuleQuote, moduleQuoteSchema, selectedModules } from '@/lib/marketing/module-quote';
import { calculateIva } from '@/lib/chile/tax';

/**
 * Vitrina de módulos de la landing (`/#modulos`, `/modulos/[slug]`) y la
 * cotización que llega a ventas. Fijan que ningún módulo vendible quede sin
 * recuadro, que cada página muestre pantallas reales del manual y que el
 * servidor cotice solo ids conocidos.
 */

const publicDir = path.join(__dirname, '..', 'public');

describe('vitrina de módulos', () => {
  it('todo módulo del tarifario tiene su recuadro, una sola vez', () => {
    const shown = SHOWCASE_MODULES.flatMap((m) => (m.pricedId ? [m.pricedId] : []));
    expect(new Set(shown).size).toBe(shown.length);
    expect(PRICED_MODULES.map((m) => m.id).filter((id) => !shown.includes(id))).toEqual([]);
    expect([...QUOTABLE_MODULE_IDS].sort()).toEqual(PRICED_MODULES.map((m) => m.id).sort());
  });

  it('slugs únicos, en minúsculas y sin acentos (son la URL pública)', () => {
    const slugs = SHOWCASE_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('cada módulo apunta a secciones del manual que existen', () => {
    const ids = new Set(MANUAL_SECTIONS.map((s) => s.id));
    for (const m of SHOWCASE_MODULES) {
      expect(m.sections.length).toBeGreaterThan(0);
      expect(m.sections.filter((id) => !ids.has(id))).toEqual([]);
    }
  });

  it('cada recuadro tiene una captura real que existe en public/', () => {
    for (const card of getShowcaseCards()) {
      expect(card.cover).toMatch(/^\/manual\/screenshots\/[a-z0-9-]+\.jpg$/);
      expect(fs.existsSync(path.join(publicDir, card.cover ?? ''))).toBe(true);
    }
  });

  it('la página del módulo trae sus pantallas con pasos, y sus capturas existen', () => {
    for (const m of SHOWCASE_MODULES) {
      const detail = getShowcaseDetail(m.slug);
      expect(detail).not.toBeNull();
      expect(detail?.screens.length).toBe(m.sections.length);
      for (const screen of detail?.screens ?? []) {
        expect(screen.topics.length).toBeGreaterThan(0);
        if (screen.screenshot) expect(fs.existsSync(path.join(publicDir, screen.screenshot))).toBe(true);
      }
    }
    expect(getShowcaseDetail('no-existe')).toBeNull();
  });

  it('las categorías vienen en el orden de la vitrina y ningún recuadro lleva precio', () => {
    const cards = getShowcaseCards();
    const order = cards.map((card) => SHOWCASE_CATEGORIES.indexOf(card.category));
    expect(order.every((value) => value >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Los datos que viajan al navegador no llevan montos (la landing no publica precios).
    for (const card of cards) expect(Object.keys(card).sort()).toEqual(['category', 'cover', 'quoteId', 'slug', 'summary', 'title']);
  });
});

describe('cotización de módulos (correo a ventas)', () => {
  const request = {
    name: 'Ana <b>Pérez</b>',
    email: 'Ana@Empresa.cl',
    phone: '+56 9 1234 5678',
    company: 'Panadería & Cía',
    message: '',
    moduleIds: ['treasury', 'pos', 'no-existe', 'pos'],
  };

  it('valida los datos de contacto: correo y teléfono son obligatorios', () => {
    expect(moduleQuoteSchema.safeParse(request).success).toBe(true);
    expect(moduleQuoteSchema.safeParse({ ...request, phone: '' }).success).toBe(false);
    expect(moduleQuoteSchema.safeParse({ ...request, phone: '<script>' }).success).toBe(false);
    expect(moduleQuoteSchema.safeParse({ ...request, email: 'no-es-correo' }).success).toBe(false);
    expect(moduleQuoteSchema.safeParse({ ...request, moduleIds: [] }).success).toBe(false);
    const parsed = moduleQuoteSchema.parse(request);
    expect(parsed.email).toBe('ana@empresa.cl');
  });

  it('descarta ids desconocidos y repetidos, en el orden del tarifario', () => {
    expect(selectedModules(request.moduleIds).map((m) => m.id)).toEqual(['pos', 'treasury']);
    expect(selectedModules(['no-existe'])).toEqual([]);
  });

  it('suma la plataforma base y los módulos, con IVA entero', () => {
    const estimate = estimateModuleQuote(['pos', 'purchases']);
    const net = BASE_PLATFORM.price + 9990 + 8990;
    expect(estimate.net).toBe(net);
    expect(estimate.iva).toBe(calculateIva(net));
    expect(estimate.total).toBe(net + calculateIva(net));
    // El plan Comercio trae POS + Compras y cuesta menos que sumarlos sueltos.
    expect(estimate.suggestedPlan?.id).toBe('comercio');
  });

  it('solo sugiere un plan que incluya todo lo pedido y salga más barato', () => {
    const estimate = estimateModuleQuote(['org-chart']);
    expect(estimate.suggestedPlan).toBeNull();
    const many = estimateModuleQuote(PRICED_MODULES.map((m) => m.id));
    expect(many.suggestedPlan?.id).toBe(PRICING_PLANS.find((p) => p.id === 'total')?.id);
  });

  it('el correo escapa lo que escribió la persona y lista los módulos', () => {
    const parsed = moduleQuoteSchema.parse(request);
    const email = buildModuleQuoteEmail(parsed, estimateModuleQuote(parsed.moduleIds), new Date('2026-10-07T15:00:00Z'));
    expect(email.subject).toBe('Cotización de módulos: Panadería & Cía (2)');
    expect(email.html).not.toContain('<b>Pérez</b>');
    expect(email.html).toContain('Ana &lt;b&gt;Pérez&lt;/b&gt;');
    expect(email.html).toContain('Panadería &amp; Cía');
    expect(email.text).toContain('- Punto de Venta (POS)');
    expect(email.text).toContain('- Tesorería y Cobranzas');
    expect(email.text).toContain('Teléfono: +56 9 1234 5678');
  });
});
