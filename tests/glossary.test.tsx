import { renderToStaticMarkup } from 'react-dom/server';
import { FieldHint, FieldLabel } from '@/components/ui/FieldLabel';
import { GLOSSARY_ENTRIES, GLOSSARY_LIST, GLOSSARY_SHORT_MAX, TAX_GLOSSARY, type GlossaryKey } from '@/lib/chile/glossary';
import { GLOSSARY } from '@/modules/manual/knowledge';

const KEYS = Object.keys(GLOSSARY_ENTRIES) as GlossaryKey[];

describe('glosario único', () => {
  it('conserva las claves que ya consumía el panel', () => {
    for (const key of [
      'iva', 'neto', 'exento', 'pmp', 'folio', 'dte', 'f29', 'ppm', 'debitoFiscal', 'creditoFiscal',
      'notaCreditoDebito', 'cxc', 'cxp', 'remanente', 'retencionHonorarios',
    ]) {
      expect(TAX_GLOSSARY).toHaveProperty(key);
      expect(typeof TAX_GLOSSARY[key as GlossaryKey]).toBe('string');
    }
  });

  it('trae las entradas nuevas de campos con jerga', () => {
    for (const key of [
      'rut', 'razonSocial', 'giro', 'codigoActividad', 'sku', 'stockMinimo', 'productoInventariable', 'afp', 'isapre',
      'fonasa', 'sueldoImponible', 'gratificacion', 'colacionMovilizacion', 'centroCosto', 'glosa', 'consumidorFinal',
      'boleta', 'factura', 'guiaDespacho', 'cotizacion', 'notaVenta', 'bodega', 'kardex', 'turnoCaja', 'stockNegativo',
      'caf', 'previred', 'ufUtm',
    ]) {
      expect(GLOSSARY_ENTRIES).toHaveProperty(key);
    }
  });

  it.each(KEYS)('%s: tooltip corto, con definición completa y sin texto vacío', (key) => {
    const entry = GLOSSARY_ENTRIES[key];
    expect(entry.term.trim()).not.toBe('');
    expect(entry.short.length).toBeGreaterThan(10);
    expect(entry.short.length).toBeLessThanOrEqual(GLOSSARY_SHORT_MAX);
    expect(entry.definition.length).toBeGreaterThanOrEqual(entry.short.length - 40);
    expect(TAX_GLOSSARY[key]).toBe(entry.short);
  });

  it('no escribe cifras previsionales que cambian cada mes (AFP, topes, UF, UTM)', () => {
    for (const entry of GLOSSARY_LIST) {
      const text = `${entry.short} ${entry.definition}`;
      expect(text).not.toMatch(/\$\s?\d{2,}/);
      expect(text).not.toMatch(/\b\d+[.,]?\d*\s?UF\b/);
    }
  });

  it('el manual y los tooltips salen de la misma fuente', () => {
    expect(GLOSSARY).toHaveLength(GLOSSARY_LIST.length);
    expect(GLOSSARY.map((g) => g.term)).toEqual(GLOSSARY_LIST.map((g) => g.term));
    expect(GLOSSARY.map((g) => g.definition)).toEqual(GLOSSARY_LIST.map((g) => g.definition));
    // Los términos que ya tenía el manual siguen estando.
    for (const term of ['IVA', 'PMP', 'Kardex', 'CAF', 'Previred', 'UF / UTM', 'Canje']) {
      expect(GLOSSARY.some((g) => g.term === term)).toBe(true);
    }
  });

  it('no hay dos entradas con el mismo término', () => {
    const terms = GLOSSARY_LIST.map((g) => g.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('FieldLabel', () => {
  it('pone el tooltip AL LADO del label, no dentro, para que no enfoque el campo', () => {
    const html = renderToStaticMarkup(
      <FieldLabel htmlFor="ppm" term="ppm">
        Tasa PPM
      </FieldLabel>
    );
    const label = html.match(/<label[^>]*>([\s\S]*?)<\/label>/);
    expect(label).not.toBeNull();
    expect(label![0]).toContain('for="ppm"');
    expect(label![1]).toBe('Tasa PPM');
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('Pago Provisional Mensual');
    expect(html.indexOf('</label>')).toBeLessThan(html.indexOf('<button'));
  });

  it('el hint extiende el tooltip con una frase propia del campo', () => {
    const html = renderToStaticMarkup(
      <FieldLabel htmlFor="x" term="rut" hint="Es el RUT con que emites tus documentos.">
        RUT emisor
      </FieldLabel>
    );
    expect(html).toContain('Es el RUT con que emites tus documentos.');
  });

  it('FieldHint muestra una línea de ayuda en gris', () => {
    const html = renderToStaticMarkup(<FieldHint>Con 0 no se avisa.</FieldHint>);
    expect(html).toContain('text-muted-foreground');
    expect(html).toContain('Con 0 no se avisa.');
  });
});
