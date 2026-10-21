import { renderToStaticMarkup } from 'react-dom/server';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { canvasSchema, canvasElementSchema, canvasPosition, constrainPosition } from '@/lib/web-sites/canvas';
import { createBlock, blockImageUrls, blockLinks, blockSchema, isBlockEmpty, parseBlocks } from '@/lib/web-sites/blocks';
import { creativeSiteSchema } from '@/lib/web-sites/creative';
import { academySiteContentSchema, academySiteImageUrls } from '@/lib/academy/site';
import { DEFAULT_THEME } from '@/lib/web-sites/theme';

const element = (patch = {}) => canvasElementSchema.parse({ id: 'layer-1', text: 'Una idea propia', ...patch });
const section = (patch = {}) => blockSchema.parse({ ...createBlock('text'), body: 'Contenido original', style: { canvas: { enabled: true, replaceContent: true, elements: [element(patch)] } } });
const render = (block = section()) => renderToStaticMarkup(<SiteRenderer name="Sitio" logoUrl={null} theme={DEFAULT_THEME} blocks={[block]} slug="sitio" mode="public" />);

describe('Lienzo de sitios web', () => {
  it('conserva las secciones existentes sin añadir lienzos automáticamente', () => {
    const old = createBlock('hero');
    expect(parseBlocks([old])[0].style.canvas).toBeUndefined();
  });
  it('valida posiciones independientes e hereda escritorio hasta editar otro dispositivo', () => {
    const el = element({ mobile: { x: 5, y: 15, width: 90, height: 25 } });
    expect(canvasPosition(el, 'tablet')).toEqual(el.desktop);
    expect(canvasPosition(el, 'mobile').width).toBe(90);
  });
  it.each([
    { desktop: { x: 90, width: 50 } }, { fontSize: Infinity }, { rotation: 181 },
    { color: 'red; background:url(https://evil.cl)' }, { motion: 'execute' },
  ])('rechaza geometría y estilos fuera de los límites: %j', (patch) => {
    expect(canvasElementSchema.safeParse({ id: 'test', ...patch }).success).toBe(false);
  });
  it('limita el número de capas y rechaza ids repetidos', () => {
    expect(canvasSchema.safeParse({ elements: [element(), element()] }).success).toBe(false);
    expect(canvasSchema.safeParse({ elements: Array.from({ length: 41 }, (_, i) => element({ id: String(i) })) }).success).toBe(false);
  });
  it('mantiene el elemento dentro del lienzo al arrastrar o redimensionar', () => {
    expect(constrainPosition({ x: 99, y: -9, width: 30, height: 120 })).toEqual({ x: 70, y: 0, width: 30, height: 100 });
  });
  it('publica una composición con sección vacía y reemplaza únicamente la presentación', () => {
    const block = section();
    const html = render(block);
    expect(isBlockEmpty(block)).toBe(false);
    expect(html).toContain('Una idea propia');
    expect(html).not.toContain('Contenido original');
    expect(block.type === 'text' && block.body).toBe('Contenido original');
  });
  it('una composición que acompaña conserva el contenido original', () => {
    const block = section();
    block.style.canvas!.replaceContent = false;
    expect(render(block)).toContain('Contenido original');
  });
  it('incluye imágenes incluso en capas ocultas o lienzos desactivados para validar propiedad en el servidor', () => {
    const block = section({ kind: 'image', imageUrl: 'https://files.example.cl/photo.webp', hidden: true });
    block.style.canvas!.enabled = false;
    expect(blockImageUrls(block)).toContain('https://files.example.cl/photo.webp');
  });
  it('escapa textos y no publica esquemas de URL peligrosos', () => {
    const html = render(section({ text: '<script>alert(1)</script>', href: 'javascript:alert(1)' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<script>alert');
    expect(render(section({ kind: 'image', imageUrl: 'data:image/svg+xml,test' }))).not.toContain('src="data:');
  });
  it('los botones son enlaces reales y se incluyen en los controles de publicación', () => {
    const block = section({ kind: 'button', text: 'Escríbenos', href: 'hola@example.cl' });
    expect(render(block)).toContain('href="mailto:hola@example.cl"');
    expect(blockLinks(block).some((entry) => entry.href === 'hola@example.cl')).toBe(true);
  });
  it('omite capas ocultas y permite ocultar solo en móvil', () => {
    expect(render(section({ hidden: true }))).not.toContain('Una idea propia');
    expect(render(section({ mobileHidden: true }))).toContain('data-mobile-hidden="true"');
  });
  it('publica duración, retraso y reglas de movimiento reducido sin scripts arbitrarios', () => {
    const html = render(section({ motion: 'float', duration: 2000, delay: 200 }));
    expect(html).toContain('data-motion="float"');
    expect(html).toContain('--canvas-duration:2000ms');
    expect(html).toContain('prefers-reduced-motion:no-preference');
  });
  it('un diseño integrado no añade otro main ni navegación independiente', () => {
    const html = renderToStaticMarkup(<SiteRenderer embedded name="Academia" logoUrl={null} theme={DEFAULT_THEME} blocks={[section()]} slug="academia" mode="public" />);
    expect(html).not.toContain('<main');
    expect(html).not.toContain('<header');
    expect(html).not.toContain('min-h-dvh');
    expect(html).toContain('Una idea propia');
  });
  it('la academia persiste el mismo motor y valida también sus imágenes', () => {
    const content = academySiteContentSchema.parse({ creative: { enabled: true, blocks: [section({ kind: 'image', imageUrl: 'https://files.example.cl/academy.webp' })] } });
    expect(content.creative?.blocks[0].style.canvas?.enabled).toBe(true);
    expect(academySiteImageUrls({ heroImageUrl: null, content })).toContain('https://files.example.cl/academy.webp');
  });
  it('los estudios integrados conservan los formularios nativos', () => {
    expect(creativeSiteSchema.safeParse({ blocks: [createBlock('contact')] }).success).toBe(false);
    expect(creativeSiteSchema.safeParse({ blocks: [{ ...createBlock('contact'), showForm: false }] }).success).toBe(true);
  });
});
