/**
 * Contexto del agente de marketing de la Supersuite (ADR 0015,
 * `src/lib/marketing/context.ts`, orden `marketing.contexto`). Fija que el
 * agente solo recibe datos públicos y verdaderos: las pantallas existen de
 * verdad, los módulos fuera de la oferta no se promocionan, los precios siguen
 * la política del landing y el enlace de ejemplo sobrevive al parser del
 * landing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { plans } from '@/components/marketing/content';
import { getModule } from '@/lib/auth/modules';
import { UNPRICED_FEATURES } from '@/lib/pricing/catalog';
import { getShowcaseCards } from '@/lib/marketing/module-showcase-content';
import { touchFromUrl } from '@/lib/marketing/attribution';
import { buildMarketingContext, copyReviewContext, publicPrices } from '@/lib/marketing/context';
import { BRAND_VOICE, MARKETING_CHANNELS } from '@/lib/marketing/brand-voice';
import { reviewMarketingCopy } from '@/lib/marketing/copy-review';

const INPUT = { baseUrl: 'https://aether.cl', salesEmail: 'ventas@aether.cl' };
const publicDir = path.join(__dirname, '..', 'public');
const toPublicPath = (url: string) => path.join(publicDir, new URL(url).pathname);

describe('contexto de marketing', () => {
  const ctx = buildMarketingContext(INPUT);

  it('trae todos los módulos de la vitrina, cada uno con su página pública', () => {
    expect(ctx.oferta.modulos.map((m) => m.pagina)).toEqual(getShowcaseCards().map((c) => `https://aether.cl/modulos/${c.slug}`));
    for (const m of ctx.oferta.modulos) expect(m.pantallas.length).toBeGreaterThan(0);
  });

  it('toda captura, portada y logo que se le entrega al agente existe de verdad', () => {
    const images = [
      ...Object.values(ctx.marca.logos),
      ...ctx.oferta.modulos.flatMap((m) => [m.portada, ...m.pantallas.map((p) => p.captura)]),
    ].filter((u): u is string => typeof u === 'string');
    expect(images.length).toBeGreaterThan(10);
    for (const url of images) expect(fs.existsSync(toPublicPath(url))).toBe(true);
  });

  it('lo que está fuera de la oferta no se promociona', () => {
    const offered = new Set(ctx.oferta.modulos.map((m) => m.nombre));
    expect(ctx.oferta.noPromocionar).toEqual(UNPRICED_FEATURES.map((f) => getModule(f).label));
    for (const name of ctx.oferta.noPromocionar) expect(offered.has(name)).toBe(false);
  });

  it('los precios siguen la política del landing (hoy: cotización a medida, sin montos)', () => {
    const fromLanding = plans.flatMap((p) => (p.priceFrom !== null ? [p.priceFrom] : []));
    expect(publicPrices()).toEqual(fromLanding);
    expect(ctx.oferta.politicaDePrecios.publica).toBe(fromLanding.length > 0);
    // Ningún monto del tarifario interno viaja al agente si el landing no lo publica.
    if (!fromLanding.length) expect(JSON.stringify(ctx.oferta)).not.toMatch(/precio(?:Mensual)?"\s*:\s*\d/);
  });

  it('el enlace de ejemplo lo entiende el landing tal cual', () => {
    const touch = touchFromUrl(new URL(ctx.enlaces.ejemplo), null, new Date());
    expect(touch).toMatchObject({ source: 'instagram', medium: 'social', campaign: 'pos-cierre-de-caja', content: 'carrusel-01', landingPath: '/modulos/punto-de-venta' });
    for (const s of ctx.enlaces.fuentes) expect(touchFromUrl(new URL(`https://aether.cl/?utm_source=${s}`), null, new Date())?.source).toBe(s);
  });

  it('guía completa: pilares que suman 100%, todos los canales y reglas sin patrones (solo texto)', () => {
    expect(ctx.guia).toBe(BRAND_VOICE);
    expect(BRAND_VOICE.pilares.reduce((sum, p) => sum + p.proporcion, 0)).toBeCloseTo(1, 5);
    expect(Object.keys(ctx.canales).sort()).toEqual([...MARKETING_CHANNELS].sort());
    for (const a of ctx.afirmaciones) expect(Object.keys(a).sort()).toEqual(['id', 'nivel', 'porQue', 'regla', 'tema']);
  });

  it('la versión cambia solo si cambia el contenido', () => {
    expect(buildMarketingContext(INPUT).version).toBe(ctx.version);
    expect(buildMarketingContext({ ...INPUT, salesEmail: 'otro@aether.cl' }).version).not.toBe(ctx.version);
  });

  it('el propio contenido que se entrega al agente pasa la revisión (no le damos ejemplos que la reprueben)', () => {
    const review = copyReviewContext(INPUT);
    for (const m of ctx.oferta.modulos) {
      const r = reviewMarketingCopy(`${m.nombre}. ${m.resumen}`, 'facebook', review);
      expect({ modulo: m.nombre, bloqueos: r.hallazgos.filter((h) => h.nivel === 'bloquea') }).toEqual({ modulo: m.nombre, bloqueos: [] });
    }
  });

  it('la revisión reconoce el dominio propio y el correo de ventas', () => {
    expect(copyReviewContext(INPUT)).toEqual({ preciosValidos: publicPrices(), dominiosPropios: ['aether.cl'], correosPermitidos: ['ventas@aether.cl'] });
  });
});
