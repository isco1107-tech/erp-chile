import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approximateMeasurer, measurerFor, parseFontMetrics } from '@/lib/posters/font-metrics';
import { fitFlow, fitGroups, fitText } from '@/lib/posters/text-fit';

// La misma fuente que trae el renderizador de imágenes de Next: real, y disponible sin red.
const fontFile = readFileSync(join(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'));
const metrics = parseFontMetrics(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));
const measure = measurerFor(metrics);

describe('parseFontMetrics / measurerFor', () => {
  it('lee unidades por em y anchos distintos por glifo', () => {
    expect(metrics.unitsPerEm).toBeGreaterThan(0);
    expect(measure('W', 100)).toBeGreaterThan(measure('i', 100));
    expect(measure('MMMM', 100)).toBeGreaterThan(measure('iiii', 100));
  });

  it('escala lineal con el tamaño y suma el espaciado entre letras', () => {
    expect(measure('Temuco', 200)).toBeCloseTo(measure('Temuco', 100) * 2, 5);
    expect(measure('abc', 100, 0.1) - measure('abc', 100)).toBeCloseTo(30, 5);
  });

  it('mide acentos y eñes del español con su glifo real', () => {
    expect(metrics.advance('ñ'.codePointAt(0)!)).not.toBeNull();
    expect(metrics.advance('É'.codePointAt(0)!)).not.toBeNull();
  });

  it('un carácter que la fuente no trae usa el avance promedio, no cero', () => {
    expect(metrics.advance(0x1f451)).toBeNull();
    expect(measure('👑', 100)).toBeGreaterThan(0);
  });

  it('rechaza bytes que no son una fuente', () => {
    expect(() => parseFontMetrics(new ArrayBuffer(64))).toThrow();
  });
});

describe('fitText', () => {
  it('nunca excede el ancho disponible', () => {
    for (const text of ['Temuco', 'Temuco/Longuimay', 'Miss Universo Región de la Araucanía', 'Anticonstitucionalmente']) {
      const fit = fitText(text, measure, { maxWidth: 800, maxLines: 3, maxSize: 300, minSize: 40 });
      for (const line of fit.lines) expect(measure(line, fit.fontSize)).toBeLessThanOrEqual(800);
    }
  });

  it('una palabra corta queda en una línea y al tamaño máximo', () => {
    const fit = fitText('Ana', measure, { maxWidth: 1000, maxLines: 3, maxSize: 180, minSize: 40 });
    expect(fit.lines).toEqual(['Ana']);
    expect(fit.fontSize).toBe(180);
  });

  it('reparte un texto largo en líneas equilibradas', () => {
    const fit = fitText('Gran final nacional de belleza y talento', measure, { maxWidth: 600, maxLines: 3, maxSize: 200, minSize: 20 });
    expect(fit.lines.length).toBeGreaterThan(1);
    const widths = fit.lines.map((line) => measure(line, fit.fontSize));
    expect(Math.min(...widths) / Math.max(...widths)).toBeGreaterThan(0.5);
    expect(fit.lines.join(' ')).toBe('Gran final nacional de belleza y talento');
  });

  it('respeta el alto máximo del bloque', () => {
    const fit = fitText('Uno dos tres cuatro cinco seis', measure, { maxWidth: 400, maxHeight: 120, maxLines: 4, maxSize: 200, minSize: 10, lineHeight: 1 });
    expect(fit.height).toBeLessThanOrEqual(120);
  });

  it('si ni al mínimo cabe, achica igual y lo marca (nunca se desborda)', () => {
    const fit = fitText('Supercalifragilisticoespialidoso', measure, { maxWidth: 200, maxLines: 1, maxSize: 100, minSize: 40 });
    expect(fit.belowMin).toBe(true);
    expect(measure(fit.lines[0]!, fit.fontSize)).toBeLessThanOrEqual(200);
  });

  it('texto vacío no rompe', () => {
    expect(fitText('   ', measure, { maxWidth: 100, maxLines: 2, maxSize: 50, minSize: 10 }).lines).toEqual([]);
  });
});

describe('fitFlow', () => {
  const sponsors = ['Banco del Sur', 'Clínica Alemana de Temuco', 'Joyería Brillante', 'Hotel Dreams Araucanía', 'Radio Bío-Bío', 'Salón de Belleza Glamour', 'Pastelería Las Delicias'];

  it('incluye a todos los ítems, enteros y en orden', () => {
    const flow = fitFlow(sponsors, measure, { maxWidth: 800, maxHeight: 400, maxSize: 60, minSize: 18 });
    expect(flow.lines.flat()).toEqual(sponsors);
  });

  it('cabe en el ancho y el alto', () => {
    const flow = fitFlow(sponsors, measure, { maxWidth: 800, maxHeight: 300, maxSize: 80, minSize: 10, lineHeight: 1.35 });
    for (const line of flow.lines) expect(measure(line.join('  ·  '), flow.fontSize)).toBeLessThanOrEqual(800);
    expect(flow.lines.length * flow.fontSize * 1.35).toBeLessThanOrEqual(300);
  });

  it('pocos ítems quedan al tamaño máximo', () => {
    expect(fitFlow(['Uno'], measure, { maxWidth: 800, maxHeight: 400, maxSize: 60, minSize: 18 }).fontSize).toBe(60);
  });
});

describe('búsqueda de tamaño con tope no entero (formato impresión, escala 1,53)', () => {
  // El tope 91,89 no cabe pero 90 sí: antes `mid` quedaba igual a `low` (90) y el ciclo no terminaba nunca.
  const approx = approximateMeasurer();
  const maxWidth = (approx('ABC', 1) * 90.5) / 0.97;

  it('fitFlow termina y devuelve un tamaño entero que cabe', () => {
    const flow = fitFlow(['ABC'], approx, { maxWidth, maxHeight: 1000, maxSize: 91.89, minSize: 10 });
    expect(Number.isInteger(flow.fontSize)).toBe(true);
    expect(flow.fontSize).toBe(90);
  });

  it('fitGroups termina y devuelve un tamaño entero que cabe', () => {
    const result = fitGroups([{ label: 'Oro', items: ['ABC'] }], approx, { maxWidth, maxHeight: 1000, maxSize: 91.89, minSize: 10, labelHeight: () => 10 });
    expect(Number.isInteger(result.fontSize)).toBe(true);
    expect(result.fontSize).toBe(90);
  });

  it('fitGroups reparte todos los grupos al mismo tamaño y sin perder nombres', () => {
    const groups = [
      { label: 'Platino', items: ['Banco del Sur', 'Clínica Alemana'] },
      { label: null, items: ['Joyería Brillante', 'Radio Bío-Bío', 'Café Central'] },
    ];
    const result = fitGroups(groups, measure, { maxWidth: 600, maxHeight: 300, maxSize: 80.5, minSize: 10, labelHeight: (size) => size * 0.5 });
    expect(result.groups.flatMap((g) => g.lines.flat())).toEqual(groups.flatMap((g) => g.items));
    for (const { lines } of result.groups) for (const line of lines) expect(measure(line.join('  ·  '), result.fontSize)).toBeLessThanOrEqual(600);
  });
});

describe('approximateMeasurer', () => {
  it('crece con el texto y el tamaño', () => {
    const approx = approximateMeasurer();
    expect(approx('abcd', 10)).toBeGreaterThan(approx('ab', 10));
    expect(approx('ab', 20)).toBeCloseTo(approx('ab', 10) * 2, 5);
  });
});
