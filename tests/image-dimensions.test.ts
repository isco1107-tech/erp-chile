import { readImageSize } from '@/lib/images/dimensions';

/**
 * El tamaño se lee de la cabecera, sin decodificar. Los casos se arman byte a
 * byte con las estructuras reales de cada formato.
 */

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** JPEG mínimo: SOI + un APP0 (para que haya un segmento que saltar) + SOF con el tamaño. */
function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sofSeg = [0xff, sof, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sofSeg, 0xff, 0xd9]);
}

function webpX(width: number, height: number): Uint8Array {
  const b = new Uint8Array(34);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  b.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  return b;
}

describe('readImageSize', () => {
  it('lee PNG', () => {
    expect(readImageSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('lee JPEG base y progresivo (SOF0 y SOF2), saltando los segmentos previos', () => {
    expect(readImageSize(jpeg(1066, 1600))).toEqual({ width: 1066, height: 1600 });
    expect(readImageSize(jpeg(150, 150, 0xc2))).toEqual({ width: 150, height: 150 });
  });

  it('lee WEBP extendido', () => {
    expect(readImageSize(webpX(800, 1067))).toEqual({ width: 800, height: 1067 });
  });

  it('el caso real: una portada de 150 × 150 se detecta como chica', () => {
    const size = readImageSize(jpeg(150, 150));
    expect(size && size.width < 1000).toBe(true);
  });

  it('devuelve null si no es imagen, está truncada o mide cero', () => {
    expect(readImageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageSize(png(0, 0))).toBeNull();
    expect(readImageSize(new Uint8Array(0))).toBeNull();
  });
});
