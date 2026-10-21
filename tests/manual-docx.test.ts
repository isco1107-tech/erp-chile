import JSZip from 'jszip';
import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { getManualSections, sectionScreenshot } from '@/modules/manual/content';
import { getKnowledgeAsManualSections } from '@/modules/manual/knowledge';
import { buildManualDocx, fitImage, groupByChapter, readImageSize } from '@/modules/manual/docx';

/**
 * El Word se arma con el mismo contenido filtrado que la pantalla: si la
 * empresa no contrató un módulo, no aparece; y las capturas que existen van
 * dentro del archivo.
 */

function features(enabled: FeatureKey[]): CompanyFeatureFlags {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, enabled.includes(key)])) as CompanyFeatureFlags;
}

/** PNG mínimo válido de 1440 × 900 (solo la cabecera importa para medirlo). */
function fakePng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function documentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

describe('buildManualDocx', () => {
  const enabled = features(['hasInventory', 'hasDteBilling', 'hasTreasury']);

  it('genera un .docx con portada, índice y solo los módulos contratados', async () => {
    const sections = getManualSections('company', enabled, ALL_PERMISSIONS);
    const buffer = await buildManualDocx({
      companyName: 'Comercial Andes SpA',
      audience: 'Manual completo de la empresa',
      generatedAt: new Date('2026-10-02T15:00:00Z'),
      sections,
      reference: getKnowledgeAsManualSections(enabled),
      loadImage: async () => null,
      screenshotOf: sectionScreenshot,
    });

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const xml = await documentXml(buffer);
    expect(xml).toContain('Manual de Usuario');
    expect(xml).toContain('Comercial Andes SpA');
    expect(xml).toContain('Ventas y facturación');
    expect(xml).toContain('Cobranza');
    expect(xml).toContain('Glosario');
    expect(xml).not.toContain('Punto de Venta (POS)');
    expect(xml).not.toContain('Candidatas y staff');
  });

  it('incluye la captura cuando existe', async () => {
    const sections = getManualSections('company', features(['hasInventory']), ALL_PERMISSIONS).filter((section) => section.id === 'etiquetas');
    const requested: string[] = [];
    const buffer = await buildManualDocx({
      companyName: 'Demo',
      audience: 'x',
      generatedAt: new Date(),
      sections,
      reference: [],
      loadImage: async (path) => {
        requested.push(path);
        return { data: fakePng(1440, 900), type: 'png', width: 1440, height: 900 };
      },
      screenshotOf: sectionScreenshot,
    });
    expect(requested).toEqual(['/manual/screenshots/etiquetas.jpg']);
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });
});

describe('utilidades del Word', () => {
  it('lee el tamaño de un PNG y de un JPEG', () => {
    expect(readImageSize(fakePng(1440, 900))).toEqual({ type: 'png', width: 1440, height: 900 });
    // SOI + APP0 corto + SOF0 con alto 720 y ancho 1280.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0x01, 0x22, 0x00]);
    expect(readImageSize(jpeg)).toEqual({ type: 'jpg', width: 1280, height: 720 });
    expect(readImageSize(Buffer.from('no es imagen'))).toBeNull();
  });

  it('ajusta la captura al ancho útil de la página sin deformarla', () => {
    expect(fitImage(1440, 900)).toEqual({ width: 600, height: 375 });
    const tall = fitImage(1000, 2000);
    expect(tall.height).toBeLessThanOrEqual(430);
    expect(Math.abs(tall.width / tall.height - 0.5)).toBeLessThan(0.01);
    expect(fitImage(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('agrupa por capítulo en orden de lectura', () => {
    const groups = groupByChapter(getManualSections('company', features(['hasInventory', 'hasDteBilling']), ALL_PERMISSIONS));
    const chapters = groups.map((group) => group.chapter);
    expect(chapters[0]).toBe('Primeros pasos');
    expect(chapters.indexOf('Ventas')).toBeLessThan(chapters.indexOf('Inventario'));
  });
});
