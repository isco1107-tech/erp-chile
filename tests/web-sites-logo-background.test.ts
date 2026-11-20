import { DEFAULT_LOGO_BACKGROUND, detectBackground, processingSize, removeLogoBackground, strengthThreshold, transparentLogoFileName } from '@/lib/web-sites/logo-background';
import { editorImageFolder, EDITOR_IMAGE_FOLDERS } from '@/lib/web-sites/image-source';

/**
 * «Quitar fondo (PNG)» de los logos del constructor: la lógica pura que corre
 * en el navegador sobre los píxeles del `<canvas>`, y la regla de qué imágenes
 * puede abrir el panel para hacerlo.
 */

type Rgba = [number, number, number, number];
const WHITE: Rgba = [255, 255, 255, 255];
const NAVY: Rgba = [20, 30, 90, 255];
const RED: Rgba = [210, 30, 40, 255];

/** Imagen de `width × height` pintada con `paint(x, y)`. */
function image(width: number, height: number, paint: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return data;
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): Rgba {
  const o = (y * width + x) * 4;
  return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!];
}

/** Ruido determinista ±amplitude (como el de un JPG). */
function noise(x: number, y: number, amplitude: number): number {
  return (((x * 7919 + y * 104729) % 17) / 16) * 2 * amplitude - amplitude;
}

describe('quitar el fondo de un logo', () => {
  it('un logo sobre fondo blanco queda sin fondo y recortado a su tamaño (con un respiro)', () => {
    // Cuadrado azul de 40 × 20 en el centro de un JPG blanco de 100 × 60.
    const data = image(100, 60, (x, y) => (x >= 30 && x < 70 && y >= 20 && y < 40 ? NAVY : WHITE));
    const result = removeLogoBackground(data, 100, 60);
    expect(result.status).toBe('ok');
    expect(result.background).toEqual([255, 255, 255]);
    expect(result.uneven).toBe(false);
    expect(result.width).toBe(44);
    expect(result.height).toBe(24);
    expect(pixel(result.data, result.width, 0, 0)[3]).toBe(0);
    expect(pixel(result.data, result.width, 22, 12)).toEqual(NAVY);
    expect(result.removed).toBeGreaterThan(0.8);
  });

  it('el ruido del JPG alrededor del logo también se va', () => {
    const data = image(80, 80, (x, y) => (x >= 30 && x < 50 && y >= 30 && y < 50 ? RED : [255 + noise(x, y, 9), 255 + noise(y, x, 9), 255 + noise(x + 3, y, 9), 255]));
    const result = removeLogoBackground(data, 80, 80);
    expect(result.status).toBe('ok');
    expect(result.width).toBeLessThanOrEqual(24);
    let leftovers = 0;
    for (let i = 3; i < result.data.length; i += 4) if (result.data[i]! > 0 && result.data[i]! < 255) leftovers++;
    // Solo el contorno puede quedar semitransparente.
    expect(leftovers).toBeLessThanOrEqual(4 * 24);
  });

  it('el contorno suavizado se separa del fondo: no deja halo blanco sobre una tarjeta oscura', () => {
    // Borde gris (mezcla 50 % de negro y blanco) alrededor de un cuadrado negro.
    const data = image(30, 30, (x, y) => {
      if (x >= 10 && x < 20 && y >= 10 && y < 20) return [0, 0, 0, 255];
      if (x >= 9 && x < 21 && y >= 9 && y < 21) return [128, 128, 128, 255];
      return WHITE;
    });
    const result = removeLogoBackground(data, 30, 30);
    expect(result.status).toBe('ok');
    const edge = pixel(result.data, result.width, 2, result.height >> 1);
    // Quedó casi negro y a medias de opacidad: sobre blanco se ve igual que antes y sobre oscuro no brilla.
    expect(Math.max(edge[0], edge[1], edge[2])).toBeLessThanOrEqual(2);
    expect(edge[3]).toBeGreaterThan(110);
    expect(edge[3]).toBeLessThan(145);
  });

  it('sin «fondo encerrado» respeta el blanco dentro de una «O»; con él, también lo quita', () => {
    // Anillo azul con blanco adentro.
    const ring = image(60, 60, (x, y) => {
      const d = Math.hypot(x - 30, y - 30);
      return d >= 12 && d <= 20 ? NAVY : WHITE;
    });
    const kept = removeLogoBackground(ring, 60, 60, { ...DEFAULT_LOGO_BACKGROUND, holes: false });
    const center = (r: typeof kept) => pixel(r.data, r.width, r.width >> 1, r.height >> 1);
    expect(kept.status).toBe('ok');
    expect(center(kept)).toEqual(WHITE);
    const holes = removeLogoBackground(ring, 60, 60, { ...DEFAULT_LOGO_BACKGROUND, holes: true });
    expect(holes.status).toBe('ok');
    expect(center(holes)[3]).toBe(0);
  });

  it('las letras blancas dentro de un círculo de color se conservan con el ajuste de fábrica', () => {
    const badge = image(60, 60, (x, y) => {
      const d = Math.hypot(x - 30, y - 30);
      if (d > 22) return WHITE;
      return x >= 26 && x < 34 && y >= 20 && y < 40 ? WHITE : RED;
    });
    const result = removeLogoBackground(badge, 60, 60);
    expect(result.status).toBe('ok');
    expect(pixel(result.data, result.width, result.width >> 1, result.height >> 1)).toEqual(WHITE);
  });

  it('funciona con un fondo de color que no es blanco', () => {
    const data = image(50, 50, (x, y) => (x >= 15 && x < 35 && y >= 15 && y < 35 ? WHITE : [30, 90, 200, 255]));
    const result = removeLogoBackground(data, 50, 50);
    expect(result.status).toBe('ok');
    expect(result.background).toEqual([30, 90, 200]);
    expect(pixel(result.data, result.width, result.width >> 1, result.height >> 1)).toEqual(WHITE);
    expect(pixel(result.data, result.width, 0, 0)[3]).toBe(0);
  });

  it('un logo que ya es PNG transparente no se toca', () => {
    const data = image(40, 40, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? RED : [0, 0, 0, 0]));
    const result = removeLogoBackground(data, 40, 40);
    expect(result.status).toBe('already-transparent');
    expect(result.data).toBe(data);
  });

  it('una foto (fondo sin un color parejo) no se recorta a ciegas', () => {
    const data = image(40, 40, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 59) % 256, (x * 91 + y * 7) % 256, 255]);
    const result = removeLogoBackground(data, 40, 40);
    expect(['nothing-removed', 'ok']).toContain(result.status);
    expect(result.uneven).toBe(true);
    if (result.status === 'nothing-removed') expect(result.data).toBe(data);
  });

  it('con la intensidad al máximo un logo gris claro desaparece: se avisa en vez de entregar un PNG vacío', () => {
    const data = image(40, 40, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? [200, 200, 200, 255] : WHITE));
    expect(removeLogoBackground(data, 40, 40, { strength: 10, holes: false }).status).toBe('ok');
    expect(removeLogoBackground(data, 40, 40, { strength: 100, holes: false }).status).toBe('nothing-left');
  });

  it('el color de fondo sale del borde aunque el logo lo toque', () => {
    const data = image(20, 10, (x) => (x < 4 ? NAVY : WHITE));
    expect(detectBackground(data, 20, 10).color).toEqual([255, 255, 255]);
  });

  it('una imagen vacía o con datos incompletos no rompe', () => {
    expect(removeLogoBackground(new Uint8ClampedArray(0), 0, 0).status).toBe('nothing-left');
    expect(removeLogoBackground(new Uint8ClampedArray(8), 10, 10).status).toBe('nothing-left');
  });

  it('intensidad, tamaño de trabajo y nombre del PNG', () => {
    expect(strengthThreshold(0)).toBeLessThan(strengthThreshold(DEFAULT_LOGO_BACKGROUND.strength));
    expect(strengthThreshold(DEFAULT_LOGO_BACKGROUND.strength)).toBeLessThan(strengthThreshold(100));
    expect(strengthThreshold(500)).toBe(strengthThreshold(100));
    expect(strengthThreshold(Number.NaN)).toBe(strengthThreshold(DEFAULT_LOGO_BACKGROUND.strength));
    expect(processingSize(4000, 1000)).toEqual({ width: 1200, height: 300 });
    expect(processingSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(transparentLogoFileName('Logo Panadería Sol.JPG')).toBe('Logo-Panadería-Sol-sin-fondo.png');
    expect(transparentLogoFileName('https://x.public.blob.vercel-storage.com/web-sites/c1/s1/abc.jpg?x=1')).toBe('abc-sin-fondo.png');
    expect(transparentLogoFileName('')).toBe('logo-sin-fondo.png');
  });
});

describe('qué imágenes puede abrir el panel para quitarles el fondo', () => {
  const host = 'https://abc123.public.blob.vercel-storage.com';

  it('solo las bibliotecas de los editores y solo de la propia empresa', () => {
    expect(editorImageFolder(`${host}/web-sites/c1/s1/logo.jpg`, 'c1')).toBe('web-sites');
    expect(editorImageFolder(`${host}/pageant-site/c1/p1-123-abcd.png`, 'c1')).toBe('pageant-site');
    expect(editorImageFolder(`${host}/academy-site/c1/card-1.webp`, 'c1')).toBe('academy-site');
    // Otra empresa, otra carpeta (contratos, candidatas), sin archivo o con rodeos.
    expect(editorImageFolder(`${host}/web-sites/c2/s1/logo.jpg`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/candidates/c1/documents/x.jpg`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/web-sites/c1`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/web-sites/c1/../c2/logo.jpg`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/web-sites/c1/%2E%2E/c2/logo.jpg`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/constructor/c1/logo.jpg`, 'c1')).toBeNull();
    expect(editorImageFolder(`${host}/web-sites/c1/s1/logo.jpg`, '')).toBeNull();
  });

  it('nunca una dirección fuera de nuestro almacenamiento', () => {
    expect(editorImageFolder('https://evil.example.com/web-sites/c1/s1/logo.jpg', 'c1')).toBeNull();
    expect(editorImageFolder('http://abc123.public.blob.vercel-storage.com/web-sites/c1/s1/logo.jpg', 'c1')).toBeNull();
    expect(editorImageFolder('http://169.254.169.254/web-sites/c1/x', 'c1')).toBeNull();
    expect(editorImageFolder('no es una url', 'c1')).toBeNull();
  });

  it('cada carpeta exige el permiso de escritura del editor que la sube', () => {
    expect(EDITOR_IMAGE_FOLDERS['web-sites']).toEqual(['websites:write', 'store:write', 'store:manage']);
    expect(EDITOR_IMAGE_FOLDERS['pageant-site']).toEqual(['projects:write']);
    expect(EDITOR_IMAGE_FOLDERS['academy-site']).toEqual(['academy:write']);
  });
});
